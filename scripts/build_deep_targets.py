"""Deep evidence for the 5 demo targets — precomputed so the demo is instant and offline.

Stages (run in order; each writes to backend/data/deep/ and can be re-run alone):

  recorded   chain real ORD records backward from each target (evidence/recorded_routes.py),
             enumerate the recorded routes, and write holdout_molecules.txt — every molecule
             made by a recorded step in these trees. The training-set builders read that file
             (model/holdout.py) so neither model ever trains on the demo answers.
  aizynth    a heavy AiZynthFinder search per target: both expansion policies (USPTO + ring
             breaker), ITERATIONS iterations, every solved route kept.
  steps      for every distinct step in all of those routes: the exact ORD records (same
             product, step substrates among the record's reactants) and the TOP_K nearest
             recorded reactions from the analog index, plus the recorded procedure text and
             amounts for the records a step can cite (procedures.jsonl).

    .venv/bin/python -I scripts/build_deep_targets.py --stage recorded
    .venv/bin/python -I scripts/build_deep_targets.py --stage aizynth [--workers 2]
    .venv/bin/python -I scripts/build_deep_targets.py --stage steps

Everything written is a record or a code-computed value (similarity, counts). Model scores are
added later by the rankers; this script does not rank anything.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
from multiprocessing import Pool
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from model.holdout import ALL_TARGETS, slug  # noqa: E402

# SYNTHPATH_DEEP_DIR lets a rebuild write somewhere other than the live demo inputs (the retrain
# loop re-runs score_deep_targets.py on whatever is in data/deep/ at any moment)
DEEP = Path(os.environ.get("SYNTHPATH_DEEP_DIR") or ROOT / "backend/data/deep")
CONFIG = ROOT / "backend/data/aizynth/config.yml"
ITERATIONS = 5000
TIME_LIMIT_S = 1500
MAX_KEEP_ROUTES = 3000
TOP_K = 50                 # analog candidates kept per step (Model A ranks these)
TEXT_K = 50                # procedure text for every candidate — Model A may prefer any of them
IDS_PER_ANALOG = 2


def log(m: str):
    print(f"[{time.strftime('%H:%M:%S')}] {m}", flush=True)


# ---------------------------------------------------------------- recorded
def stage_recorded():
    from evidence.recorded_routes import Purchasable, RecordIndex, build_graph, enumerate_routes

    DEEP.mkdir(parents=True, exist_ok=True)
    log("loading record index + stock")
    index, stock = RecordIndex(), Purchasable()
    holdout: set[str] = set()
    for name, smi in ALL_TARGETS.items():
        g = build_graph(smi, index, stock)
        routes = enumerate_routes(g)
        holdout |= set(g.steps)                      # molecules made by a recorded step
        holdout.add(g.target)
        out = {
            "name": name, "target": smi, "target_flat": g.target,
            "graph": {"steps": g.steps, "buyable": g.buyable, "heavy_atoms": g.heavy_atoms,
                      "truncated": g.truncated},
            "routes": routes,
        }
        (DEEP / f"recorded_{slug(name)}.json").write_text(json.dumps(out, default=str))
        log(f"  {name}: {len(g.steps)} molecules with recorded steps, {len(routes)} routes "
            f"({sum(r['complete'] for r in routes)} complete)")
    # Never shrink the holdout. A wider stock stops the recorded search at more molecules, so a
    # re-run can find fewer intermediates — and the models already in training excluded the old
    # set. Dropping a molecule from it would let the next training run learn a demo answer.
    hp = DEEP / "holdout_molecules.txt"
    if hp.exists():
        holdout |= {l.strip() for l in hp.read_text().splitlines() if l.strip()}
    hp.write_text("\n".join(sorted(holdout)) + "\n")
    log(f"wrote holdout_molecules.txt ({len(holdout)} molecules)")


# ---------------------------------------------------------------- aizynth
def _aizynth_one(item):
    name, smi = item
    out_path = DEEP / f"aizynth_{slug(name)}.json"
    if out_path.exists():
        return name, "exists"
    from aizynthfinder.aizynthfinder import AiZynthFinder

    from chem.stock import use_with_zinc
    t0 = time.time()
    f = AiZynthFinder(configfile=str(CONFIG))
    # ZINC + priced + common ORD reagents (chem/stock.py). ZINC alone has no EtOH, MeI or CS2
    use_with_zinc(f)
    f.expansion_policy.select(["uspto", "ringbreaker"])
    f.filter_policy.select("uspto")
    f.config.search.iteration_limit = ITERATIONS
    f.config.search.time_limit = TIME_LIMIT_S
    f.config.search.max_transforms = 6
    f.config.post_processing.all_routes = True
    f.target_smiles = smi
    f.tree_search()
    f.build_routes()
    stats = f.extract_statistics()
    dicts = list(f.routes.dicts)[:MAX_KEEP_ROUTES]
    scores = [dict(s) for s in list(f.routes.scores)[:MAX_KEEP_ROUTES]]
    out_path.write_text(json.dumps({"name": name, "target": smi, "stats": stats,
                                    "routes": dicts, "scores": scores}, default=str))
    return name, f"{len(dicts)} routes, solved={stats.get('is_solved')}, {time.time() - t0:.0f} s"


def stage_aizynth(workers: int):
    DEEP.mkdir(parents=True, exist_ok=True)
    items = list(ALL_TARGETS.items())
    log(f"aizynth: {len(items)} targets, {workers} workers, {ITERATIONS} iterations each")
    with Pool(workers) as pool:
        for name, msg in pool.imap_unordered(_aizynth_one, items):
            log(f"  {name}: {msg}")


# ---------------------------------------------------------------- steps
def _aiz_steps(node, out):
    if node.get("type") != "mol" or not node.get("children"):
        return
    rxn = node["children"][0]
    for c in rxn.get("children", []):
        _aiz_steps(c, out)
    out.append((node["smiles"], [c["smiles"] for c in rxn.get("children", [])]))


def stage_steps():
    from evidence import analogs, corpus
    from evidence.recorded_routes import RecordIndex, flat
    from model.featurize import normalize_rxn

    index = RecordIndex()
    steps: dict[str, dict] = {}            # normalized rxn → step info

    def add(product, substrates, origin):
        rxn = normalize_rxn(".".join(substrates) + ">>" + product)
        if not rxn:
            return
        s = steps.setdefault(rxn, {"rxn": rxn, "product": flat(product),
                                   "substrates": sorted(flat(x) for x in substrates), "origins": set()})
        s["origins"].add(origin)

    for name in ALL_TARGETS:
        rec = json.loads((DEEP / f"recorded_{slug(name)}.json").read_text())
        for mol, opts in rec["graph"]["steps"].items():
            for o in opts:
                add(mol, o["substrates"], f"recorded:{slug(name)}")
        p = DEEP / f"aizynth_{slug(name)}.json"
        if p.exists():
            for rd in json.loads(p.read_text())["routes"]:
                out = []
                _aiz_steps(rd, out)
                for prod, reac in out:
                    add(prod, reac, f"aizynth:{slug(name)}")
        else:
            log(f"  WARNING: no aizynth output for {name} — recorded steps only")
    log(f"{len(steps):,} distinct steps")

    # exact records: same product, step substrates all among the record's reactants
    # A record that already lists the product among its own reactants did not make it. US05154930
    # is the case that showed this: it dissolves aspirin in egg phosphatides to formulate it, lists
    # "salicylic acid acetate" on both sides, and was being cited as evidence that acetic acid and
    # salicylic acid give aspirin. Its two masses for that same compound also produced 800 equiv.
    rf = index.df.reactants_flat.values
    noop = 0
    for s in steps.values():
        want, prod = set(s["substrates"]), s["product"]
        rows = []
        for i in index.rows(prod):
            have = set(rf[i])
            if not want <= have:
                continue
            if prod in have:
                noop += 1
                continue
            rows.append(int(i))
        s["exact_rows"] = rows
    log(f"  steps with an exact record: {sum(bool(s['exact_rows']) for s in steps.values()):,} "
        f"({noop:,} record matches dropped: the product is already among the record's reactants)")

    # analog candidates, batched
    rxns = list(steps)
    B = 256
    for b in range(0, len(rxns), B):
        part = rxns[b:b + B]
        for r, hits in zip(part, _analog_rows(part, TOP_K)):
            steps[r]["analogs"] = hits
        if (b // B) % 20 == 0:
            log(f"  analogs {min(b + B, len(rxns)):,}/{len(rxns):,}")

    # which reaction ids need procedure text
    ix = analogs._load()
    meta = ix["meta"]
    wanted: set[str] = set()
    for s in steps.values():
        for i in s["exact_rows"]:
            rid = index.df.reaction_id.values[i]
            if rid:
                wanted.add(rid)
        for row, _sim in s.get("analogs", [])[:TEXT_K]:
            for rid in list(meta.reaction_ids.values[row])[:IDS_PER_ANALOG]:
                wanted.add(rid)
    log(f"fetching procedure text for {len(wanted):,} records")
    n = 0
    with open(DEEP / "procedures.jsonl", "w") as fh:
        for proc in corpus.scan_ids(wanted):
            fh.write(json.dumps(proc.to_json(), default=str) + "\n")
            n += 1
    log(f"  wrote {n:,} procedures")

    for s in steps.values():
        s["origins"] = sorted(s["origins"])
        s["exact_records"] = [index.record(i) for i in s.pop("exact_rows")]
        s["analogs"] = [[int(r), float(sim)] for r, sim in s.get("analogs", [])]
    (DEEP / "steps.json").write_text(json.dumps(steps, default=str))
    log("wrote steps.json")


def _analog_rows(rxns: list[str], k: int) -> list[list[tuple[int, float]]]:
    """Top-k analog index rows (row, Tanimoto) per normalized reaction. Row ids, not copies."""
    import numpy as np

    from evidence import analogs
    from model.featurize import featurize
    from model.transfer_features import query_rxn

    ix = analogs._load()
    # searched the way Model A's training queries were: substrates>>product, reagents dropped
    Q = featurize([query_rxn(r) or r for r in rxns], "drfp")
    Q.data[:] = 1.0
    S = analogs._similarity(Q.astype(np.float32), ix)
    out = []
    for row in S:
        kk = min(k, row.shape[0])
        best = np.argpartition(-row, kk - 1)[:kk]
        best = best[np.argsort(-row[best])]
        out.append([(int(b), float(row[b])) for b in best])
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--stage", required=True, choices=["recorded", "aizynth", "steps"])
    ap.add_argument("--workers", type=int, default=2)
    a = ap.parse_args()
    {"recorded": stage_recorded,
     "aizynth": lambda: stage_aizynth(a.workers),
     "steps": stage_steps}[a.stage]()


if __name__ == "__main__":
    main()
