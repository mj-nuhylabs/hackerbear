"""Model B — rank AiZynthFinder's candidate routes by how much they look like a route chemists ran.

AiZynthFinder's own "state score" (0.95 × fraction of leaves in stock + 0.05 × a depth term)
gives almost every short, fully-in-stock route the same 0.994, so its ordering among those is
just tree order. This model learns an ordering from routes that patents actually report.

Training data
-------------
  reference routes  scripts/build_reference_routes.py — routes chained from one patent's
                    recorded reactions (data/ml/reference_routes.jsonl)
  candidates        scripts/run_aizynth_batch.py — AiZynthFinder's solved routes for each
                    reference target (data/ml/aizynth_candidates/worker_*.jsonl)

Labels (graded 0–3), per candidate route against that target's reference route
-------------------------------------------------------------------------------
A candidate step *matches* a reference step when the non-isomeric canonical products are
equal and the candidate's reactants are a subset of the record's reactants — the same subset
rule as evidence/provenance.py:match (ORD writes salts, counter-ions and reagents on the left,
AiZynthFinder does not).

  3  every reference step is matched by some candidate step
  2  the final (target-forming) step is matched and ≥ 50 % of reference steps are matched
  1  the final step is matched
  0  otherwise

Features (per route; nothing computed from the reference route)
---------------------------------------------------------------
  n_steps, longest_branch, n_leaves, frac_leaves_in_stock, convergent,
  pp_min / pp_mean            AiZynthFinder policy probability of each step
  lo_min_log / lo_mean_log    log(1 + library_occurence) of each step's template
  n_ring_forming              steps whose product has more rings than all reactants together
  state_score                 AiZynthFinder's own score
  plaus_min / plaus_mean      calibrated plausibility from model/predict.py
  cls_0 … cls_11              steps per reaction super-class (AiZynth classification prefix)
  n_steps_recorded            steps that have an ORD record of that reaction. In training, records
                              from any patent that itself reports the target are not counted —
                              the target's own patent and its family would otherwise give the
                              answer away. At inference every record counts.

Model: LGBMRanker(objective="lambdarank"), one group per target, early stopping on val.

    cd backend && ../.venv/bin/python -m model.route_ranker --train

Writes data/route_ranker.pkl and data/route_ranker_metrics.json. Every number in the metrics
file is computed here on the held-out test patents, against three baselines.
"""
from __future__ import annotations

import argparse
import json
import math
import pickle
import random
import time
from collections import defaultdict
from functools import lru_cache
from pathlib import Path

import numpy as np

DATA = Path(__file__).resolve().parents[1] / "data"
REFS = DATA / "ml/reference_routes.jsonl"
CANDIDATES = DATA / "ml/aizynth_candidates"
CANON = DATA / "ord_canon.parquet"
PLAUS_CACHE = DATA / "ml/route_plausibility_cache.parquet"
MODEL_PATH = DATA / "route_ranker.pkl"
METRICS_PATH = DATA / "route_ranker_metrics.json"

N_CLASSES = 12
FEATURES = (["n_steps", "longest_branch", "n_leaves", "frac_leaves_in_stock", "convergent",
             "pp_min", "pp_mean", "lo_min_log", "lo_mean_log", "n_ring_forming", "state_score",
             "plaus_min", "plaus_mean", "n_steps_recorded"]
            + [f"cls_{i}" for i in range(N_CLASSES)])


def log(m: str):
    print(f"[{time.strftime('%H:%M:%S')}] {m}", flush=True)


# ---------------------------------------------------------------- chemistry helpers

@lru_cache(maxsize=500_000)
def flat(smiles: str) -> str | None:
    """Non-isomeric canonical SMILES (atom maps stripped)."""
    from rdkit import Chem, RDLogger
    RDLogger.DisableLog("rdApp.*")
    m = Chem.MolFromSmiles(smiles) if smiles else None
    if m is None:
        return None
    for a in m.GetAtoms():
        a.SetAtomMapNum(0)
    return Chem.MolToSmiles(m, isomericSmiles=False)


@lru_cache(maxsize=500_000)
def ring_count(smiles: str) -> int | None:
    from rdkit import Chem
    m = Chem.MolFromSmiles(smiles) if smiles else None
    return m.GetRingInfo().NumRings() if m is not None else None


# ---------------------------------------------------------------- route shape

def walk(rd: dict) -> dict:
    """AiZynthFinder route dict (target → leaves) → {"steps", "leaves"}.

    Steps are post-order (starting materials → target); the last step makes the target.
    `depth` is the step's distance from the target (the final step has depth 1).
    """
    steps, leaves = [], []

    def go(node: dict, depth: int):
        if node.get("type") != "mol":
            return
        kids = node.get("children") or []
        if not kids:
            leaves.append({"smiles": node["smiles"], "in_stock": bool(node.get("in_stock"))})
            return
        rxn = kids[0]
        mols = rxn.get("children") or []
        for c in mols:
            go(c, depth + 1)
        md = rxn.get("metadata") or {}
        steps.append({
            "product": node["smiles"],
            "reactants": [c["smiles"] for c in mols],
            "template_hash": md.get("template_hash"),
            "library_occurence": md.get("library_occurence"),
            "classification": md.get("classification"),
            "policy_probability": md.get("policy_probability"),
            "depth": depth,
            "n_intermediate_reactants": sum(1 for c in mols if c.get("children")),
        })

    go(rd, 0)
    return {"steps": steps, "leaves": leaves}


def rxn_smiles(step: dict) -> str:
    return ".".join(step["reactants"]) + ">>" + step["product"]


def _step_key(step: dict) -> tuple[str | None, frozenset]:
    return flat(step["product"]), frozenset(f for f in (flat(r) for r in step["reactants"]) if f)


# ---------------------------------------------------------------- labels

def label(route: dict, ref: dict) -> int:
    ref_steps = [(s["product_flat"], frozenset(s["reactants_flat"])) for s in ref["steps"]]
    cand = [_step_key(s) for s in route["steps"]]
    target = ref["target_flat"]

    def matched(rs):
        rp, rr = rs
        return any(cp == rp and cr and cr <= rr for cp, cr in cand)

    hits = [matched(rs) for rs in ref_steps]
    final_ref = [i for i, (rp, _) in enumerate(ref_steps) if rp == target]
    final_ok = bool(final_ref) and any(hits[i] for i in final_ref)
    frac = sum(hits) / len(hits) if hits else 0.0
    if hits and all(hits):
        return 3
    if final_ok and frac >= 0.5:
        return 2
    if final_ok:
        return 1
    return 0


# ---------------------------------------------------------------- recorded-reaction lookup

_canon_table = None


def _records_table():
    """The bond-forming ORD records (product, reactants, patent), read once per process."""
    global _canon_table
    if _canon_table is None and CANON.exists():
        import pyarrow.compute as pc
        import pyarrow.parquet as pq
        t = pq.read_table(CANON, columns=["product_main_flat", "reactants_flat", "patent", "is_noop"])
        _canon_table = t.filter(pc.invert(t["is_noop"])).drop(["is_noop"])
    return _canon_table


class RecordedIndex:
    """product (non-isomeric) → [(patent, reactant set)] for just the products asked for."""

    def __init__(self, products: set[str]):
        import pyarrow as pa
        import pyarrow.compute as pc
        self.by_product: dict[str, list[tuple[str | None, frozenset]]] = defaultdict(list)
        t = _records_table()
        if t is None or not products:
            return
        t = t.filter(pc.is_in(t["product_main_flat"], value_set=pa.array(sorted(products))))
        for p, rs, pat in zip(t["product_main_flat"].to_pylist(), t["reactants_flat"].to_pylist(),
                              t["patent"].to_pylist()):
            self.by_product[p].append((pat, frozenset(rs or [])))

    def patents_making(self, product_flat: str) -> set[str]:
        return {pat for pat, _ in self.by_product.get(product_flat, []) if pat}

    def recorded(self, step_key: tuple, exclude_patents: set[str] | frozenset = frozenset()) -> bool:
        p, rs = step_key
        if not p or not rs:
            return False
        for pat, have in self.by_product.get(p, []):
            if pat in exclude_patents:
                continue
            if rs <= have:
                return True
        return False


# ---------------------------------------------------------------- plausibility

def _score_chunk(rxns: list[str]) -> list[float | None]:
    from model.predict import score_many
    return [cal for _, cal in score_many(rxns)]


def plausibility(rxns: list[str], workers: int = 1, use_cache: bool = True) -> dict[str, float | None]:
    """reaction SMILES → calibrated plausibility (None where the model can't score it)."""
    import pandas as pd
    uniq = sorted(set(rxns))
    have: dict[str, float | None] = {}
    if use_cache and PLAUS_CACHE.exists():
        c = pd.read_parquet(PLAUS_CACHE)
        have = {r: (None if pd.isna(v) else float(v)) for r, v in zip(c.rxn, c.cal)}
    todo = [r for r in uniq if r not in have]
    if todo:
        log(f"  scoring {len(todo):,} new reactions for plausibility ({workers} workers)")
        t0 = time.time()
        chunks = [todo[i:i + 2000] for i in range(0, len(todo), 2000)]
        if workers > 1 and len(chunks) > 1:
            from multiprocessing import get_context
            with get_context("spawn").Pool(workers) as pool:
                parts = pool.map(_score_chunk, chunks)
        else:
            parts = [_score_chunk(c) for c in chunks]
        for chunk, vals in zip(chunks, parts):
            have.update(zip(chunk, vals))
        log(f"    done in {time.time() - t0:.0f} s")
        if use_cache:
            PLAUS_CACHE.parent.mkdir(parents=True, exist_ok=True)
            pd.DataFrame({"rxn": list(have), "cal": [np.nan if v is None else v for v in have.values()]}
                         ).to_parquet(PLAUS_CACHE, index=False)
    return {r: have.get(r) for r in uniq}


# ---------------------------------------------------------------- features

def _cls(c: str | None) -> int:
    try:
        return min(int(str(c).split(".")[0]), N_CLASSES - 1)
    except (ValueError, TypeError):
        return 0


def features(route: dict, plaus: dict, index: RecordedIndex, state_score: float | None,
             exclude_patents: set[str] | frozenset = frozenset()) -> dict:
    steps, leaves = route["steps"], route["leaves"]
    pp = [s["policy_probability"] for s in steps if s.get("policy_probability") is not None]
    lo = [math.log1p(float(s["library_occurence"])) for s in steps if s.get("library_occurence") is not None]
    pl = [plaus.get(rxn_smiles(s)) for s in steps]
    pl = [p for p in pl if p is not None]
    ring_forming = 0
    for s in steps:
        rp = ring_count(s["product"])
        rr = [ring_count(r) for r in s["reactants"]]
        if rp is not None and None not in rr and rp > sum(rr):
            ring_forming += 1
    nan = float("nan")
    f = {
        "n_steps": len(steps),
        "longest_branch": max((s["depth"] for s in steps), default=0),
        "n_leaves": len(leaves),
        "frac_leaves_in_stock": (sum(l["in_stock"] for l in leaves) / len(leaves)) if leaves else nan,
        "convergent": int(any(s.get("n_intermediate_reactants", 0) >= 2 for s in steps)),
        "pp_min": min(pp) if pp else nan,
        "pp_mean": float(np.mean(pp)) if pp else nan,
        "lo_min_log": min(lo) if lo else nan,
        "lo_mean_log": float(np.mean(lo)) if lo else nan,
        "n_ring_forming": ring_forming,
        "state_score": nan if state_score is None else float(state_score),
        "plaus_min": min(pl) if pl else nan,
        "plaus_mean": float(np.mean(pl)) if pl else nan,
        "n_steps_recorded": sum(index.recorded(_step_key(s), exclude_patents) for s in steps),
    }
    for i in range(N_CLASSES):
        f[f"cls_{i}"] = 0
    for s in steps:
        f[f"cls_{_cls(s.get('classification'))}"] += 1
    return f


# ---------------------------------------------------------------- training

def _load_jsonl(paths) -> list[dict]:
    out = []
    for p in paths:
        with open(p) as fh:
            for line in fh:
                line = line.strip()
                if line:
                    try:
                        out.append(json.loads(line))
                    except json.JSONDecodeError:
                        pass          # a line cut off by a stopped worker
    return out


def _hit_at_k(order: np.ndarray, good: np.ndarray, k: int) -> bool:
    return bool(good[order[:k]].any())


def _random_hit_at_k(n: int, n_good: int, k: int) -> float:
    """Exact probability that a uniformly random order puts ≥1 good route in the top k."""
    if n_good == 0:
        return 0.0
    k = min(k, n)
    return 1.0 - math.comb(n - n_good, k) / math.comb(n, k)


def evaluate(groups: list[dict], model_scores: list[np.ndarray] | None) -> dict:
    methods = ["aizynth_state_score", "fewest_steps", "random"] + (["model"] if model_scores is not None else [])
    res = {m: {"top1_rel2": 0.0, "top5_rel2": 0.0, "top1_final": 0.0, "top5_final": 0.0} for m in methods}
    n = len(groups)
    ceil2 = ceil1 = 0
    for gi, g in enumerate(groups):
        y, rank, steps = g["y"], g["aizynth_rank"], g["n_steps"]
        good2, good1 = y >= 2, y >= 1
        ceil2 += bool(good2.any())
        ceil1 += bool(good1.any())
        orders = {
            "aizynth_state_score": np.lexsort((rank, -g["state_score"])),
            "fewest_steps": np.lexsort((rank, steps)),
        }
        if model_scores is not None:
            orders["model"] = np.lexsort((rank, -model_scores[gi]))
        for m, o in orders.items():
            res[m]["top1_rel2"] += _hit_at_k(o, good2, 1)
            res[m]["top5_rel2"] += _hit_at_k(o, good2, 5)
            res[m]["top1_final"] += _hit_at_k(o, good1, 1)
            res[m]["top5_final"] += _hit_at_k(o, good1, 5)
        ln = len(y)
        res["random"]["top1_rel2"] += _random_hit_at_k(ln, int(good2.sum()), 1)
        res["random"]["top5_rel2"] += _random_hit_at_k(ln, int(good2.sum()), 5)
        res["random"]["top1_final"] += _random_hit_at_k(ln, int(good1.sum()), 1)
        res["random"]["top5_final"] += _random_hit_at_k(ln, int(good1.sum()), 5)
    for m in res:
        for k in res[m]:
            res[m][k] = round(res[m][k] / n, 4) if n else None
    return {
        "n_targets": n,
        "ceiling_any_rel2": round(ceil2 / n, 4) if n else None,
        "ceiling_any_final": round(ceil1 / n, 4) if n else None,
        "methods": res,
    }


def train(workers: int = 6, seed: int = 0, candidates: Path = CANDIDATES, model_path: Path = MODEL_PATH,
          metrics_path: Path = METRICS_PATH):
    import lightgbm as lgb
    import pandas as pd

    from model.holdout import held_out_molecules, holdout_file_ready, is_held_out

    refs = {(r["target_flat"], r["patent"]): r for r in _load_jsonl([REFS])}
    # The reference routes may have been built before data/deep/holdout_molecules.txt existed.
    # Re-apply both holdout rules here so no demo-tree molecule reaches training either way.
    held = held_out_molecules() if holdout_file_ready() else frozenset()
    n0 = len(refs)
    refs = {k: r for k, r in refs.items()
            if not is_held_out(r["target"])
            and not (held and ({r["target_flat"]} | {m for s in r["steps"]
                                                     for m in [s["product_flat"], *s["reactants_flat"]]}) & held)}
    log(f"holdout: dropped {n0 - len(refs):,} reference routes (demo-tree file {'used' if held else 'not written yet'})")
    lines = _load_jsonl(sorted(Path(candidates).glob("worker_*.jsonl")))
    lines = [l for l in lines if l.get("routes")]
    log(f"reference routes: {len(refs):,}   targets with candidates: {len(lines):,}")

    # what the features need, gathered once
    all_rxn, products = [], set()
    for l in lines:
        products.add(flat(l["target"]))
        for r in l["routes"]:
            for s in r["steps"]:
                all_rxn.append(rxn_smiles(s))
                products.add(flat(s["product"]))
    products.discard(None)
    plaus = plausibility(all_rxn, workers=workers)
    log(f"loading ORD records for {len(products):,} products")
    index = RecordedIndex(products)

    rows, groups_meta = [], []
    for l in lines:
        key = (flat(l["target"]), l["patent"])
        ref = refs.get(key) or refs.get((l.get("target_flat"), l["patent"]))
        if ref is None:
            continue
        excl = index.patents_making(ref["target_flat"]) | {ref["patent"]}
        for i, r in enumerate(l["routes"]):
            f = features(r, plaus, index, r.get("state_score"), excl)
            f.update({"_gid": len(groups_meta), "_y": label(r, ref), "_rank": r.get("aizynth_rank", i)})
            rows.append(f)
        groups_meta.append({"target": ref["target"], "patent": ref["patent"], "split": ref["split"],
                            "n_ref_steps": ref["n_steps"]})
    df = pd.DataFrame(rows)
    df["_split"] = [groups_meta[g]["split"] for g in df["_gid"]]
    log(f"routes: {len(df):,} in {df._gid.nunique():,} targets; label counts {df._y.value_counts().sort_index().to_dict()}")

    def part(split, train_like):
        d = df[df._split == split]
        if train_like:   # a group whose routes all share one label teaches lambdarank nothing
            keep = d.groupby("_gid")._y.transform(lambda s: s.nunique() > 1)
            d = d[keep]
        return d.sort_values(["_gid", "_rank"])

    tr, va, te = part("train", True), part("val", True), part("test", False)
    log(f"train groups {tr._gid.nunique():,}  val groups {va._gid.nunique():,}  test groups {te._gid.nunique():,}")

    def gsizes(d):
        return d.groupby("_gid", sort=False).size().to_numpy()

    model = None
    if tr._gid.nunique() >= 2:
        model = lgb.LGBMRanker(objective="lambdarank", n_estimators=2000, learning_rate=0.05,
                               num_leaves=31, min_child_samples=20, subsample=0.8, subsample_freq=1,
                               colsample_bytree=0.8, random_state=seed, verbose=-1)
        fit_kw = {}
        if va._gid.nunique() >= 2:
            fit_kw = {"eval_set": [(va[FEATURES], va._y)], "eval_group": [gsizes(va)], "eval_at": [1, 5],
                      "callbacks": [lgb.early_stopping(100, verbose=False)]}
        model.fit(tr[FEATURES], tr._y, group=gsizes(tr), **fit_kw)
        log(f"trained: best iteration {model.best_iteration_ or model.n_estimators}")
    else:
        log("too few training groups with mixed labels — no model trained")

    test_groups, test_scores = [], []
    for gid, d in te.groupby("_gid", sort=False):
        test_groups.append({"y": d._y.to_numpy(), "aizynth_rank": d._rank.to_numpy(),
                            "n_steps": d.n_steps.to_numpy(), "state_score": d.state_score.fillna(0).to_numpy()})
        if model is not None:
            test_scores.append(model.predict(d[FEATURES]))
    metrics = {
        "what": "Model B: rank AiZynthFinder routes by closeness to the route a patent reports",
        "split": "md5(patent) 70/15/15; test = held-out patents",
        "label": "3 all reference steps matched / 2 final step + ≥50% / 1 final step / 0 none",
        "generated": time.strftime("%Y-%m-%d %H:%M"),
        "targets_with_candidates": int(df._gid.nunique()),
        "routes": int(len(df)),
        "label_counts": {int(k): int(v) for k, v in df._y.value_counts().sort_index().items()},
        "train_groups": int(tr._gid.nunique()), "val_groups": int(va._gid.nunique()),
        "best_iteration": (int(model.best_iteration_ or model.n_estimators) if model is not None else None),
        "test": evaluate(test_groups, test_scores if model is not None else None),
        "feature_importance_gain": (
            {k: round(float(v), 1) for k, v in sorted(zip(FEATURES, model.booster_.feature_importance("gain")),
                                                       key=lambda kv: -kv[1])} if model is not None else None),
        "caveats": [
            "AiZynthFinder's public USPTO policy was trained on patent reactions that include these reference "
            "routes, so the candidate generator finds them more easily than it would for a new molecule. "
            "The comparison between ranking methods is still fair: all rank the same candidates.",
            "A route counts as a hit only against the one route its patent reports; other valid routes score 0.",
        ],
    }
    if model is not None:
        with open(model_path, "wb") as fh:
            pickle.dump({"model": model, "features": FEATURES, "trained": time.strftime("%Y-%m-%d %H:%M"),
                         "n_train_groups": int(tr._gid.nunique())}, fh)
        log(f"wrote {model_path}")
    Path(metrics_path).write_text(json.dumps(metrics, indent=2))
    log(f"wrote {metrics_path}")
    print(json.dumps(metrics["test"], indent=2))
    return metrics


# ---------------------------------------------------------------- inference

_bundle = None


def _load_model():
    global _bundle
    if _bundle is None and MODEL_PATH.exists():
        with open(MODEL_PATH, "rb") as fh:
            _bundle = pickle.load(fh)
    return _bundle


def score_routes(route_dicts: list[dict], state_scores: list[float] | None = None) -> list[float | None]:
    """AiZynthFinder route dicts (f.routes.dicts) → ranking scores, higher = more like a reported route.

    The score is a ranking score, not a probability — compare it only between routes of one target.
    Returns None for every route if the model has not been trained (rule 3: no stand-in values).
    """
    b = _load_model()
    if b is None or not route_dicts:
        return [None] * len(route_dicts)
    import pandas as pd
    routes = [walk(rd) for rd in route_dicts]
    rxns = [rxn_smiles(s) for r in routes for s in r["steps"]]
    plaus = plausibility(rxns, workers=1, use_cache=False)
    products = {flat(s["product"]) for r in routes for s in r["steps"]} - {None}
    index = RecordedIndex(products)
    X = pd.DataFrame([features(r, plaus, index, (state_scores[i] if state_scores else None))
                      for i, r in enumerate(routes)])[b["features"]]
    return [float(v) for v in b["model"].predict(X)]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--train", action="store_true")
    ap.add_argument("--workers", type=int, default=6)
    ap.add_argument("--candidates", default=str(CANDIDATES), help="dir of worker_*.jsonl")
    ap.add_argument("--model-out", default=str(MODEL_PATH))
    ap.add_argument("--metrics-out", default=str(METRICS_PATH))
    a = ap.parse_args()
    if a.train:
        train(workers=a.workers, candidates=Path(a.candidates), model_path=Path(a.model_out),
              metrics_path=Path(a.metrics_out))
    else:
        ap.print_help()


if __name__ == "__main__":
    main()
