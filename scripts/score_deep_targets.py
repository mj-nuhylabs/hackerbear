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

Route order (cost/rank.py): every candidate — all enumerated recorded routes and up to
--max-aizynth AiZynth routes — is costed first with the cost engine (cheap: no SVGs, no
procedures). One list, cheapest material cost per gram of target first (yields pushed back
through the route), fully costed routes before lower bounds, then fewer steps. No two shown
routes share a final disconnection. Recorded and computed routes compete on the same number;
"recorded" is a label, not a rank. Model B's score is kept on each AiZynth route for display and
breaks exact ties only.

    .venv/bin/python -I scripts/score_deep_targets.py [--max-aizynth 2000]
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

# SYNTHPATH_DEEP_DIR lets a rebuild write somewhere other than the live demo inputs (the retrain
# loop re-runs score_deep_targets.py on whatever is in data/deep/ at any moment)
DEEP = Path(os.environ.get("SYNTHPATH_DEEP_DIR") or ROOT / "backend/data/deep")
ADAPT_K = 3
SHOW_ROUTES = 10      # recorded and computed together, one per final disconnection
SCALE_MMOL = 1.0      # tables are per 1 mmol of the limiting substrate; the UI multiplies


def log(m: str):
    print(f"[{time.strftime('%H:%M:%S')}] {m}", flush=True)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--max-aizynth", type=int, default=2000, help="AiZynth routes scored per target")
    ap.add_argument("--out-dir", type=Path, default=DEEP, help="where demo_*.json go (default: the live ones)")
    a = ap.parse_args()

    import numpy as np
    import pandas as pd

    from chem.balance import missing_atoms
    from chem.resolve import describe
    from chem.stock import label as stock_label
    from cost import prices
    from cost import rank as cost_rank
    from evidence import analogs
    from evidence.adapt import adapt
    from evidence.procedures import score as proc_score
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
        # A real preparation first, whatever Model A thought of it: an analog whose recorded text is
        # a patent's background section cannot be run, and the panel offers these to be run. Model A's
        # order is kept within each group (sorted is stable), and every entry says which it is.
        for entry in adapted:
            sc = proc_score((entry.get("table") or {}).get("text"))
            entry["experimental"] = sc["experimental"]
            entry["not_experimental_reason"] = sc["reason"] or None
        adapted.sort(key=lambda e: not e["experimental"])
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
            # Same order as chem/routes.py: this reaction's own records, then the closest recorded
            # analog (flagged from_analog so the UI never passes it off as this reaction's own).
            # Without the fallback the precomputed demo showed fewer conditions than a live search.
            "conditions": _conditions(recs) or analogs.conditions_from(ev["analogs"]),
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
            # atoms of the product no listed reactant supplies (chem/balance.py): the record is missing
            # a reactant, so this step's material is not on the bill and the route's cost is a lower bound
            "missing_atoms": missing_atoms(reactants, product),
        }

    model_b = route_ranker._load_model() is not None
    log(f"Model B {'trained — scoring AiZynth routes' if model_b else 'NOT trained — no Model B scores'}")
    price_table = prices.table()

    # ---------------- cheap pass: cost every candidate route before building any payload
    _lite_cache: dict[str, dict] = {}

    def lite(s):
        if s not in _lite_cache:
            _lite_cache[s] = describe(s, svg=False)
        return _lite_cache[s]

    _y_cache: dict[tuple, float] = {}

    def step_yield(product, reactants):
        k = (product, tuple(reactants))
        if k not in _y_cache:
            rxn = normalize_rxn(".".join(reactants) + ">>" + product)
            recs = step_out.get(rxn, {}).get("recorded_records", []) if rxn else []
            y = next((r["yield_pct"] for r in recs if r.get("yield_pct") is not None), None)
            _y_cache[k] = y / 100.0 if y is not None else 0.70
        return _y_cache[k]

    def lite_route(spec_steps, spec_leaves, complete, model_b_score):
        """spec_steps: [(product, [reactants])], spec_leaves: [(smiles, leaf fields)]."""
        steps_l = [{"product": lite(p), "reactants": [lite(x) for x in rs],
                    "assumed_yield": step_yield(p, rs), "missing_atoms": missing_atoms(rs, p)}
                   for p, rs in spec_steps]
        leaves_l = [{**lite(m), **f} for m, f in spec_leaves]
        r = {"steps": steps_l, "leaf_materials": leaves_l, "complete": complete,
             "route_rank_score": model_b_score}
        return r, cost_rank.summary(r, price_table)

    for name, smi in DEMO_TARGETS.items():
        slug = name.lower()
        rec = json.loads((DEEP / f"recorded_{slug}.json").read_text())
        g = rec["graph"]
        cands = []          # (key, kind, final disconnection, index)

        # recorded routes: every step is an ORD record
        for j, r in enumerate(rec["routes"]):
            spec = [(s["product"], g["steps"][s["product"]][s["option"]]["substrates"]) for s in r["steps"]]
            leaves = [(m, _recorded_leaf(m, status)) for m, status in r["leaves"].items()]
            lr, summ = lite_route(spec, leaves, r["complete"], None)
            cands.append((cost_rank.key(lr, summ) + (0,), "recorded", frozenset(map(flat, spec[-1][1])), j,
                          _sound(summ, r["complete"])))

        # AiZynth routes
        p = DEEP / f"aizynth_{slug}.json"
        dicts, state, mb, stats = [], [], [], {}
        if p.exists():
            az = json.loads(p.read_text())
            dicts = az["routes"][:a.max_aizynth]
            state = [float(sc.get("state score", 0.0)) for sc in az["scores"][:a.max_aizynth]]
            mb = route_ranker.score_routes(dicts, state) if model_b else [None] * len(dicts)
            stats = az.get("stats", {})
            for i, rd in enumerate(dicts):
                if not rd.get("children"):
                    continue
                spec, leaves = [], []
                _walk_light(rd, spec, leaves)
                complete = all(ins for _, ins in leaves)
                lr, summ = lite_route(spec, [(m, stock_label(m, ins)) for m, ins in leaves], complete, mb[i])
                cands.append((cost_rank.key(lr, summ) + (1,), "computed", frozenset(map(flat, spec[-1][1])), i,
                              _sound(summ, complete)))

        # One route per final disconnection, cheapest first — except that the best-evidenced route
        # keeps a slot of its own. A recorded route is one where every step is an ORD record, so it
        # carries the patent procedure for each step; without this it loses its place whenever a
        # cheaper computed route happens to break the same bond, and imatinib's top ten ended up
        # with no recorded route at all. The cheapest route still leads; this one sits right below.
        cands.sort(key=lambda c: c[0])
        picked, seen_final = [], set()
        # The reserved route has to be worth reserving: a record that omits a reactant is not good
        # evidence, it is bad mining, and a cost built on a minority of the route's mass says more
        # about what is missing than about the chemistry. Both are already in the sort key, so a
        # candidate that passes it on its own merits is the one to hold a slot for.
        best_recorded = next((c for c in cands if c[1] == "recorded" and c[4]), None)
        for c in cands:
            if c[2] in seen_final:
                continue
            seen_final.add(c[2])
            picked.append(c)
            if len(picked) >= SHOW_ROUTES:
                break
        # a place in the top three, not ahead of the runner-up: the cheapest two still lead
        if best_recorded is not None and best_recorded not in picked:
            picked.insert(min(2, len(picked)), best_recorded)
        picked = picked[:SHOW_ROUTES]
        reserved_idx = next((i for i, c in enumerate(picked) if c is best_recorded), None)

        # ---------------- full payloads for the routes shown
        routes = []
        for pos, (_key, kind, _final, j, _sound_flag) in enumerate(picked):
            if kind == "recorded":
                r = rec["routes"][j]
                st = []
                for s in r["steps"]:
                    opt = g["steps"][s["product"]][s["option"]]
                    st.append(step_payload(s["product"], opt["substrates"], precedent_count=opt["n_records"],
                                           recorded_info={"n_records": opt["n_records"], "n_sources": opt["n_sources"],
                                                          "unclassified": opt.get("unclassified") or []}))
                leaves = [{**desc(m), **_recorded_leaf(m, status)} for m, status in r["leaves"].items()]
                routes.append({"kind": "recorded", "steps": st, "leaf_materials": leaves, "complete": r["complete"],
                               "aizynth_score": None, "route_rank_score": None})
            else:
                rd = dicts[j]
                st, leaves = [], {}
                _walk_aiz(rd, st, leaves, step_payload, desc)
                routes.append({"kind": "computed", "steps": st, "leaf_materials": list(leaves.values()),
                               "complete": all(l["in_stock"] for l in leaves.values()),
                               "aizynth_score": round(state[j], 3),
                               "route_rank_score": round(mb[j], 4) if mb[j] is not None else None})
            routes[-1]["_reserved"] = pos == reserved_idx
        routes = cost_rank.rank(routes, price_table)
        # rank() sorts on cost alone, so put the reserved route back right under the cheapest
        held = next((r for r in routes if r.pop("_reserved", False)), None)
        for r in routes:
            r.pop("_reserved", None)
        if held is not None and routes and routes[0] is not held:
            routes.remove(held)
            routes.insert(min(2, len(routes)), held)      # a place in the top three, not the top two
            held["rank"]["slot"] = "best_evidence"
        if routes:
            routes[0]["rank"]["slot"] = "cheapest"
        n_kind = {"recorded": 0, "computed": 0}
        for r in routes:
            n_kind[r["kind"]] += 1
            r["id"] = f"{name[:3].upper()}-{'REC' if r['kind'] == 'recorded' else 'AZ'}{n_kind[r['kind']]}"
        out = {"target": smi, "name": name, "routes": routes,
               "search": {"solved": bool(routes), "precomputed": True,
                          "rank_basis": cost_rank.RANK_BASIS,
                          "candidates_costed": len(cands),
                          "aizynth_routes_searched": len(json.loads(p.read_text())["routes"]) if p.exists() else 0,
                          "recorded_routes_found": len(rec["routes"]),
                          "search_time_s": stats.get("search_time"),
                          "model_a": "trained" if model_a else "not trained",
                          "model_b": "trained" if model_b else "not trained",
                          "analog_index": analogs.stats() or None,
                          "analogous_min_precedents": 10}}
        a.out_dir.mkdir(parents=True, exist_ok=True)
        (a.out_dir / f"demo_{slug}.json").write_text(json.dumps(out, default=str))
        log(f"  {name}: {sum(r['kind'] == 'recorded' for r in routes)} recorded + "
            f"{sum(r['kind'] == 'computed' for r in routes)} computed routes")


def _first_procedure(recs: list[dict]) -> dict | None:
    """The record's text to show. A real preparation beats a fuller record that is only prose:
    aspirin's best-looking record offered its patent's background section, and lidocaine's offered
    an HPLC assay method (evidence/procedures.py)."""
    from evidence.procedures import score as proc_score

    with_text = [r for r in recs if r.get("procedure") and r["procedure"].get("text")]
    if not with_text:
        return None
    best = max(with_text, key=lambda r: (proc_score(r["procedure"]["text"])["experimental"],
                                         r["procedure"].get("yield_pct") is not None,
                                         r["procedure"].get("temperature_c") is not None,
                                         len(r["procedure"].get("reagents") or [])))
    p = best["procedure"]
    s = proc_score(p["text"])
    return {**p, "match": "covered", "url": p.get("url") or best.get("url"), "patent": best.get("patent"),
            # the UI must not head prose with "Procedure"
            "experimental": s["experimental"], "not_experimental_reason": s["reason"] or None}


def _conditions(recs: list[dict]) -> dict | None:
    """Per-field, from the first record stating each — evidence/provenance.conditions_from."""
    from evidence.provenance import conditions_from
    return conditions_from(recs)


def _sound(summ: dict, complete: bool) -> bool:
    """Is this route worth holding a slot for? It has to reach buyable materials, its records have
    to name every reactant (chem/balance.py), and its cost has to rest on most of what it buys.
    Aspirin's recorded acetylation fails the second: the record never lists the acetic anhydride,
    so it reads as $0.62/g, and reserving a slot for it put that straight back at the top."""
    return bool(complete) and not summ["steps_missing_reactant"] and summ["bound_covers_most"]


def _recorded_leaf(smiles: str, status: str | None) -> dict:
    """Leaf fields for a recorded route; status comes from evidence/recorded_routes.Purchasable."""
    from chem.stock import commodity, inchikey

    out = {"in_stock": status in ("priced", "commodity", "zinc"), "stock_status": status}
    if status == "commodity":
        c = commodity().get(inchikey(smiles)) or {}
        out.update(ord_records=c.get("ord_records"), ord_sources=c.get("ord_sources"))
    return out


def _walk_light(node, steps, leaves):
    """AiZynth route dict → [(product, [reactants])] in synthesis order + [(leaf, in_stock)]."""
    if node.get("type") != "mol":
        return
    if not node.get("children"):
        leaves.append((node["smiles"], bool(node.get("in_stock"))))
        return
    rxn = node["children"][0]
    for child in rxn.get("children", []):
        _walk_light(child, steps, leaves)
    steps.append((node["smiles"], [c["smiles"] for c in rxn.get("children", [])]))


def _walk_aiz(node, steps, leaves, step_payload, desc):
    from chem.stock import label

    if node.get("type") != "mol":
        return
    if not node.get("children"):
        c = desc(node["smiles"])
        ins = bool(node.get("in_stock"))
        leaves[c["smiles"]] = {**c, "in_stock": ins, **label(node["smiles"], ins)}
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
