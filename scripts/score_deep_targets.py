"""Final demo payload for the 5 targets: recorded routes + AiZynth routes, both models' scores.

Reads what scripts/build_deep_targets.py wrote (recorded_*.json, aizynth_*.json, steps.json,
procedures.jsonl) and writes backend/data/deep/demo_<target>.json in the shape /routes returns,
plus, per step:

  recorded_records    exact ORD records of this step (same product, substrates among the
                      record's reactants), each with its verbatim procedure and its recorded
                      amounts rescaled to 1 mmol of our limiting substrate (evidence/adapt.py)
  adapted_procedures  the nearest recorded reactions, ordered by Model A when it is trained
                      (else by similarity, and the payload says so), top ADAPT_K with procedure
                      text, each rescaled the same way and labelled as recorded for a different
                      substrate

Route order:
  * recorded routes first (every step is a record), complete before incomplete, fewer steps first
  * then AiZynth routes, ordered by Model B when it is trained (else AiZynth's state score), and
    diversified: no two shown routes share a final disconnection

    .venv/bin/python -I scripts/score_deep_targets.py [--max-aizynth 2000]
"""
from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

DEEP = ROOT / "backend/data/deep"
ADAPT_K = 3
SHOW_RECORDED = 5
SHOW_COMPUTED = 5
SCALE_MMOL = 1.0      # tables are per 1 mmol of the limiting substrate; the UI multiplies


def log(m: str):
    print(f"[{time.strftime('%H:%M:%S')}] {m}", flush=True)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--max-aizynth", type=int, default=2000, help="AiZynth routes scored per target")
    a = ap.parse_args()

    import numpy as np
    import pandas as pd

    from chem.resolve import describe
    from evidence import analogs
    from evidence.adapt import adapt
    from evidence.recorded_routes import flat
    from model import route_ranker, transfer_ranker
    from model.featurize import normalize_rxn
    from model.holdout import DEMO_TARGETS
    from model.predict import score_many

    steps = json.loads((DEEP / "steps.json").read_text())
    procs: dict[str, dict] = {}
    with open(DEEP / "procedures.jsonl") as fh:
        for line in fh:
            p = json.loads(line)
            procs[p["reaction_id"]] = p
    log(f"{len(steps):,} steps, {len(procs):,} procedures")
    meta = analogs._load()["meta"]

    model_a = transfer_ranker.available()
    log(f"Model A {'trained — ranking analogs' if model_a else 'NOT trained — similarity order'}")

    # ---------------- per-step evidence
    _desc_cache: dict[str, dict] = {}

    def desc(s):
        if s not in _desc_cache:
            _desc_cache[s] = describe(s)
        return _desc_cache[s]

    step_out: dict[str, dict] = {}
    for n, (rxn, s) in enumerate(steps.items(), 1):
        rows = [int(r) for r, _ in s["analogs"]]
        sims = [float(x) for _, x in s["analogs"]]
        scores = transfer_ranker.rank(rxn, rows, sims) if model_a else None
        order = (np.argsort(-np.asarray(scores), kind="stable") if scores is not None
                 else np.arange(len(rows)))
        subs_iso = rxn.split(">>")[0].split(".")
        product_iso = rxn.split(">>")[1]

        recorded = []
        for rec in s["exact_records"]:
            p = procs.get(rec.get("reaction_id"))
            recorded.append({**rec, "procedure": p,
                             "table": adapt(p, subs_iso, product_iso, SCALE_MMOL) if p else None})

        adapted = []
        for rank_i, j in enumerate(order):
            if len(adapted) >= ADAPT_K:
                break
            m = meta.iloc[rows[j]]
            ids = list(m.reaction_ids) if m.reaction_ids is not None else []
            p = next((procs[i] for i in ids if i in procs), None)
            if p is None:
                continue
            adapted.append({
                "analog_rxn": m.rxn, "similarity": round(sims[j], 3),
                "model_a_score": round(float(scores[j]), 4) if scores is not None else None,
                "model_a_rank": rank_i if scores is not None else None,
                "similarity_rank": int(j),
                "patent": m.patent if isinstance(m.patent, str) else None,
                "reaction_id": p["reaction_id"], "url": p.get("url"),
                "table": adapt(p, subs_iso, product_iso, SCALE_MMOL),
            })
        # the shape the existing step panel reads (evidence/analogs._row), in the order shown
        shown = [analogs._row(meta.iloc[rows[j]], sims[j]) for j in order[:5]]
        step_out[rxn] = {"recorded_records": recorded, "adapted_procedures": adapted, "analogs": shown,
                         "adapted_order": "model_a" if scores is not None else "similarity"}
        if n % 200 == 0:
            log(f"  steps {n:,}/{len(steps):,}")

    plaus_cache: dict[str, tuple] = {}

    def plaus(rxns):
        need = [r for r in rxns if r not in plaus_cache]
        if need:
            for r, v in zip(need, score_many(need)):
                plaus_cache[r] = v
        return [plaus_cache[r] for r in rxns]

    def step_payload(product: str, reactants: list[str], *, template_id=None, classification=None,
                     precedent_count=None, recorded_info=None) -> dict:
        rxn = normalize_rxn(".".join(reactants) + ">>" + product)
        ev = step_out.get(rxn, {"recorded_records": [], "adapted_procedures": [], "analogs": [],
                                "adapted_order": None})
        raw, cal = plaus([rxn])[0] if rxn else (None, None)
        recs = ev["recorded_records"]
        y = next((r["yield_pct"] for r in recs if r.get("yield_pct") is not None), None)
        tier = "REPORTED" if recs else ("ANALOGOUS" if (precedent_count or 0) >= 10 else "COMPUTED")
        return {
            "rxn_smiles": rxn or (".".join(reactants) + ">>" + product),
            "template_id": template_id, "classification": classification,
            "reactants": [desc(x) for x in reactants], "product": desc(product),
            "evidence": {"tier": tier,
                         "source_ids": [r["reaction_id"] for r in recs[:5] if r.get("reaction_id")],
                         "precedent_count": precedent_count,
                         "url": next((r["url"] for r in recs if r.get("url")), None)},
            "recorded_records": recs,
            # the procedure panel shows the most complete recorded record of this very reaction
            "procedure": _first_procedure(recs),
            "conditions": _conditions(recs),
            "analogs": ev["analogs"],
            "adapted_procedures": ev["adapted_procedures"],
            "adapted_order": ev["adapted_order"],
            "reported_yield": y / 100.0 if y is not None else None,
            "assumed_yield": y / 100.0 if y is not None else 0.70,
            "yield_is_assumed": y is None,
            "yield_basis": ({"basis": "reported", "source_ids": [r["reaction_id"] for r in recs[:5]]}
                            if y is not None else {"basis": "assumed", "value": 0.70}),
            "plausibility_raw": raw, "plausibility_calibrated": cal,
            "recorded_step": recorded_info,
        }

    model_b = route_ranker._load_model() is not None
    log(f"Model B {'trained — ranking AiZynth routes' if model_b else 'NOT trained — AiZynth state score order'}")

    for name, smi in DEMO_TARGETS.items():
        slug = name.lower()
        rec = json.loads((DEEP / f"recorded_{slug}.json").read_text())
        g = rec["graph"]
        routes = []
        # ---------------- recorded routes
        # one route per recorded final step first (round-robin in the recorded order), then the rest:
        # five variants of the same last step hide the other ways the target has been made
        by_final: dict[int, list] = {}
        for r in rec["routes"]:
            by_final.setdefault(r["steps"][-1]["option"], []).append(r)
        picked = []
        while len(picked) < SHOW_RECORDED and any(by_final.values()):
            for opt in sorted(by_final):
                if by_final[opt] and len(picked) < SHOW_RECORDED:
                    picked.append(by_final[opt].pop(0))
        for k, r in enumerate(picked):
            st = []
            for s in r["steps"]:
                opt = g["steps"][s["product"]][s["option"]]
                st.append(step_payload(s["product"], opt["substrates"], precedent_count=opt["n_records"],
                                       recorded_info={"n_records": opt["n_records"], "n_sources": opt["n_sources"],
                                                      "unclassified": opt.get("unclassified") or []}))
            leaves = [{**desc(m), "in_stock": status in ("zinc", "priced"), "stock_status": status}
                      for m, status in r["leaves"].items()]
            routes.append({"id": f"{name[:3].upper()}-REC{k + 1}", "kind": "recorded", "steps": st,
                           "leaf_materials": leaves, "complete": r["complete"],
                           "rank_basis": "recorded routes: complete first, then fewer steps, then more sources",
                           "aizynth_score": None, "route_rank_score": None})
        # ---------------- AiZynth routes
        p = DEEP / f"aizynth_{slug}.json"
        if p.exists():
            az = json.loads(p.read_text())
            dicts = az["routes"][:a.max_aizynth]
            state = [float(sc.get("state score", 0.0)) for sc in az["scores"][:a.max_aizynth]]
            mb = route_ranker.score_routes(dicts, state) if model_b else [None] * len(dicts)
            keyed = [((mb[i] if mb[i] is not None else state[i]), -i, i) for i in range(len(dicts))]
            keyed.sort(reverse=True)
            seen_final, shown = set(), 0
            for _score, _neg, i in keyed:
                rd = dicts[i]
                final = frozenset(flat(c["smiles"]) for c in rd["children"][0]["children"]) if rd.get("children") else None
                if final is None or final in seen_final:
                    continue
                seen_final.add(final)
                st, leaves = [], {}
                _walk_aiz(rd, st, leaves, step_payload, desc)
                routes.append({"id": f"{name[:3].upper()}-AZ{shown + 1}", "kind": "computed", "steps": st,
                               "leaf_materials": list(leaves.values()), "complete": True,
                               "aizynth_score": round(state[i], 3),
                               "route_rank_score": round(mb[i], 4) if mb[i] is not None else None,
                               "rank_basis": ("Model B (learned from patent routes), one route per final disconnection"
                                              if mb[i] is not None else
                                              "AiZynthFinder state score, one route per final disconnection")})
                shown += 1
                if shown >= SHOW_COMPUTED:
                    break
            stats = az.get("stats", {})
        else:
            stats = {}
        out = {"target": smi, "name": name, "routes": routes,
               "search": {"solved": bool(routes), "precomputed": True,
                          "aizynth_routes_searched": len(json.loads(p.read_text())["routes"]) if p.exists() else 0,
                          "recorded_routes_found": len(rec["routes"]),
                          "search_time_s": stats.get("search_time"),
                          "model_a": "trained" if model_a else "not trained",
                          "model_b": "trained" if model_b else "not trained",
                          "analog_index": analogs.stats() or None,
                          "analogous_min_precedents": 10}}
        (DEEP / f"demo_{slug}.json").write_text(json.dumps(out, default=str))
        log(f"  {name}: {sum(r['kind'] == 'recorded' for r in routes)} recorded + "
            f"{sum(r['kind'] == 'computed' for r in routes)} computed routes")


def _first_procedure(recs: list[dict]) -> dict | None:
    with_text = [r for r in recs if r.get("procedure") and r["procedure"].get("text")]
    if not with_text:
        return None
    best = max(with_text, key=lambda r: (r["procedure"].get("yield_pct") is not None,
                                         r["procedure"].get("temperature_c") is not None,
                                         len(r["procedure"].get("reagents") or [])))
    p = best["procedure"]
    return {**p, "match": "covered", "url": p.get("url") or best.get("url"), "patent": best.get("patent")}


def _conditions(recs: list[dict]) -> dict | None:
    for r in recs:
        if r.get("temperature_c") is not None or r.get("time_h") is not None:
            return {"solvent": r.get("solvents"), "temperature_c": r.get("temperature_c"),
                    "time_h": r.get("time_h"), "catalyst": r.get("catalysts"), "catalyst_loading": None,
                    "source_id": r.get("reaction_id")}
    return None


def _walk_aiz(node, steps, leaves, step_payload, desc):
    if node.get("type") != "mol":
        return
    if not node.get("children"):
        c = desc(node["smiles"])
        leaves[c["smiles"]] = {**c, "in_stock": bool(node.get("in_stock")),
                               "stock_status": "zinc" if node.get("in_stock") else None}
        return
    rxn = node["children"][0]
    for child in rxn.get("children", []):
        _walk_aiz(child, steps, leaves, step_payload, desc)
    md = rxn.get("metadata", {}) or {}
    steps.append(step_payload(node["smiles"], [c["smiles"] for c in rxn.get("children", [])],
                              template_id=md.get("template_hash"), classification=md.get("classification"),
                              precedent_count=int(md.get("library_occurence") or 0)))


if __name__ == "__main__":
    main()
