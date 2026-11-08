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
ADAPT_K = 3             # nearest recorded reactions shown in the step panel
# ...but this many are looked at when choosing the one to build the sheet from. They are
# ordered by Model A, not by similarity, so the first three are not the three closest: a step
# could be refused a sheet for "the closest record is only 0.29 similar" while the seventh
# candidate was 0.6 similar with a temperature and a time. Looking further costs a rescore and
# lowers no bar — evidence/procedures.adapts_to still decides, record by record.
ADAPT_SEARCH_K = 15     # 50 (every candidate with text) was tried and found nothing 15 did not
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
    from evidence.procedures import is_formulation
    from evidence.procedures import score as proc_score
    from evidence.recorded_routes import flat
    from model import route_ranker, transfer_ranker
    from model.featurize import normalize_rxn
    from model.holdout import ALL_TARGETS, slug
    from model.predict import score_many

    steps = json.loads((DEEP / "steps.json").read_text())
    procs: dict[str, dict] = {}
    proc_files = [DEEP / "procedures.jsonl"]
    # imported records (scripts/import_scifinder.py) keep their text beside their parquet, and
    # corpus.scan_ids cannot fetch it — it only scans ORD's own projections
    extra_procs = ROOT / "backend/data/scifinder/procedures.jsonl"
    if extra_procs.exists():
        proc_files.append(extra_procs)
    for path in proc_files:
        with open(path) as fh:
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
            # 스텝의 분자는 화면에 이름으로 뜬다 — 여기서만 이름을 찾는다.
            # lite()는 후보 경로 수천 개를 훑으므로 켜지 않는다
            _desc_cache[s] = describe(s, look_up_name=True)
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
            if len(adapted) >= ADAPT_SEARCH_K:
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
        # the full list is what _protocol_for searches; the payload carries the first ADAPT_K
        step_out[rxn] = {"recorded_records": recorded, "adapted_procedures": adapted[:ADAPT_K],
                         "adapted_candidates": adapted, "analogs": shown,
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
        ev = step_out.get(rxn, {"recorded_records": [], "adapted_procedures": [],
                                "adapted_candidates": [], "analogs": [],
                                "adapted_order": None})
        raw, cal = plaus([rxn])[0] if rxn else (None, None)
        # A record that formulates the compound is not a record of making it, however the mining
        # wrote its reactants. US05154930 dissolves aspirin in egg phosphatides to prepare a dosage
        # form, and its name "salicylic acid acetate" was mined as salicylic acid plus acetate, so
        # the structured record reads as an acetylation. It must not make a step REPORTED.
        recs = [r for r in ev["recorded_records"]
                if not is_formulation((r.get("procedure") or {}).get("text"))]
        tier = "REPORTED" if recs else ("ANALOGOUS" if (precedent_count or 0) >= 10 else "COMPUTED")
        # conditions first, so the procedure can be the same run rather than a different record
        _cond = _conditions(recs) or analogs.conditions_from(ev["analogs"])
        # The yield the cost rests on comes from the record the sheet shows, when that record
        # states one. Taking the first yield in the list instead put 76% from one patent beside
        # another run's quantities and temperature, and the step then cited five records for a
        # number only one of them reported.
        _sid = (_cond or {}).get("source_id")
        _yrecs = [r for r in recs if r.get("yield_pct") is not None]
        _ysrc = (next((r for r in _yrecs if r.get("reaction_id") == _sid), None)
                 or (_yrecs[0] if _yrecs else None))
        y = _ysrc["yield_pct"] if _ysrc else None
        # The step's substrates are the recorded reactants that evidence/recorded_routes.substrates_of
        # could see ending up in the product. That test is fingerprint overlap with no atom maps, and
        # it sets aside anything small and very common — which is right for triethylamine and wrong
        # for formic acid donating the formyl group of a thioformate. When the record's own quantity
        # table charges a material that supplies exactly the atoms no substrate accounts for, nothing
        # is missing from the record and nothing is missing from the bill: the cost engine charges
        # that line. Say which material it is instead of claiming the record left a reactant out.
        _proto = _protocol_for(recs, ev, _cond, rxn, desc(product))
        # The sheet may have come from a candidate outside the three the panel shows (they are in
        # Model A's order, and the sheet is chosen on whether it adapts). Put that one in the list
        # so the record the amounts came from is on screen beside them.
        _shown = list(ev["adapted_procedures"])
        _from = (_proto or {}).get("from_analog") or {}
        if _from.get("reaction_id") and all(a.get("reaction_id") != _from["reaction_id"] for a in _shown):
            _match = next((a for a in (ev.get("adapted_candidates") or [])
                           if a.get("reaction_id") == _from["reaction_id"]), None)
            if _match is not None:
                _shown = [_match] + _shown
        _missing = missing_atoms(reactants, product)
        _supplied = None
        _charges = [] if (_proto or {}).get("from_analog") else ((_proto or {}).get("charges") or [])
        _charged = [c for c in _charges if c.get("smiles") and c["smiles"] not in reactants
                    and (c.get("role") or "").upper() != "SOLVENT"]
        if _missing and _charged:
            closed = missing_atoms(reactants + [c["smiles"] for c in _charged], product)
            if closed == {}:
                _supplied = [{"name": c.get("name"), "smiles": c["smiles"]} for c in _charged]
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
            "procedure": _first_procedure(recs, (_cond or {}).get("source_id")),
            # Same order as chem/routes.py: this reaction's own records, then the closest recorded
            # analog (flagged from_analog so the UI never passes it off as this reaction's own).
            # Without the fallback the precomputed demo showed fewer conditions than a live search.
            "conditions": _cond,
            "analogs": ev["analogs"],
            "adapted_procedures": _shown,
            "adapted_order": ev["adapted_order"],
            "reported_yield": y / 100.0 if y is not None else None,
            "assumed_yield": y / 100.0 if y is not None else 0.70,
            "yield_is_assumed": y is None,
            # the record that reported it, not every record on the step
            "yield_basis": ({"basis": "reported", "source_ids": [_ysrc["reaction_id"]],
                             "same_record_as_procedure": _ysrc.get("reaction_id") == _sid}
                            if y is not None else {"basis": "assumed", "value": 0.70}),
            "plausibility_raw": raw, "plausibility_calibrated": cal,
            "recorded_step": recorded_info,
            # 이 스텝을 우리 규모로 돌리는 순서표. 숫자는 전부 레코드/환산표에서 온다 (evidence/protocol.py)
            "protocol": _proto,
            # atoms of the product no listed reactant supplies (chem/balance.py): the record is missing
            # a reactant, so this step's material is not on the bill and the route's cost is a lower bound
            "missing_atoms": _missing,
            # unless the record's own quantity table charges what supplies them — then it is on the bill
            "missing_supplied_by": _supplied,
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

    def runnable_fraction(spec_steps) -> float:
        """Share of a route's steps that have a record of that very reaction carrying a procedure
        a chemist could run. This is what "best evidenced" has to mean: caffeine's theobromine +
        MeI route is an AiZynth route, not a chained recorded one, yet every step of it is a
        published preparation with a yield. Judging evidence by how the route was found instead
        left it at number four behind three routes with no procedure at all."""
        if not spec_steps:
            return 0.0
        n = 0
        for product, reactants in spec_steps:
            rxn = normalize_rxn(".".join(reactants) + ">>" + product)
            recs = step_out.get(rxn, {}).get("recorded_records", []) if rxn else []
            if any(proc_score(((r.get("procedure") or {}).get("text")))["experimental"] for r in recs):
                n += 1
        return n / len(spec_steps)

    def lite_route(spec_steps, spec_leaves, complete, model_b_score):
        """spec_steps: [(product, [reactants])], spec_leaves: [(smiles, leaf fields)]."""
        steps_l = [{"product": lite(p), "reactants": [lite(x) for x in rs],
                    "assumed_yield": step_yield(p, rs), "missing_atoms": missing_atoms(rs, p)}
                   for p, rs in spec_steps]
        leaves_l = [{**lite(m), **f} for m, f in spec_leaves]
        r = {"steps": steps_l, "leaf_materials": leaves_l, "complete": complete,
             "route_rank_score": model_b_score}
        return r, cost_rank.summary(r, price_table)

    for name, smi in ALL_TARGETS.items():
        stem = slug(name)
        rec = json.loads((DEEP / f"recorded_{stem}.json").read_text())
        g = rec["graph"]
        cands = []          # (key, kind, final disconnection, index)

        # recorded routes: every step is an ORD record
        for j, r in enumerate(rec["routes"]):
            spec = [(s["product"], g["steps"][s["product"]][s["option"]]["substrates"]) for s in r["steps"]]
            leaves = [(m, _recorded_leaf(m, status)) for m, status in r["leaves"].items()]
            lr, summ = lite_route(spec, leaves, r["complete"], None)
            cands.append((cost_rank.key(lr, summ) + (0,), "recorded", frozenset(map(flat, spec[-1][1])), j,
                          _sound(summ, r["complete"]), runnable_fraction(spec)))

        # AiZynth routes
        p = DEEP / f"aizynth_{stem}.json"
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
                              _sound(summ, complete), runnable_fraction(spec)))

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
        # the best-evidenced candidate, whatever found it: most steps with a runnable published
        # procedure, and it must be sound on its own merits. Ties go to the cheaper one.
        sound = [c for c in cands if c[4] and c[5] > 0]
        best_recorded = max(sound, key=lambda c: (c[5], [-x for x in c[0][:1]])) if sound else None
        if best_recorded is not None:
            best = max(c[5] for c in sound)
            best_recorded = next(c for c in cands if c[4] and c[5] == best)
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
        for pos, (_key, kind, _final, j, _sound_flag, _runnable) in enumerate(picked):
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
        # A step with no precedent behind it is not something to lead with, whatever it costs.
        routes = cost_rank.demote_computed(routes)
        # The lead goes to the cheapest route a chemist can actually run, not the cheapest route
        # (cost/rank.lead_with_runnable); the cheapest keeps the slot below it.
        routes = cost_rank.lead_with_runnable(routes)
        held = next((r for r in routes if r.pop("_reserved", False)), None)
        for r in routes:
            r.pop("_reserved", None)
        # The best-evidenced candidate still keeps a place in the top three when the lead and the
        # cheapest are both something else.
        if held is not None and routes and routes[0] is not held and "slot" not in held["rank"]:
            routes.remove(held)
            routes.insert(min(2, len(routes)), held)
            held["rank"]["slot"] = "best_evidence"
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
        (a.out_dir / f"demo_{stem}.json").write_text(json.dumps(out, default=str))
        log(f"  {name}: {sum(r['kind'] == 'recorded' for r in routes)} recorded + "
            f"{sum(r['kind'] == 'computed' for r in routes)} computed routes")


def _first_procedure(recs: list[dict], prefer_id: str | None = None) -> dict | None:
    """The record's text to show. The conditions panel above it names one run, so the procedure is
    that run's where it has text — otherwise the two describe different experiments. Failing that,
    a real preparation beats a fuller record that is only prose: aspirin's best-looking record
    offered its patent's background section, and lidocaine's an HPLC assay (evidence/procedures.py)."""
    from evidence.procedures import is_formulation
    from evidence.procedures import score as proc_score

    from evidence.procedures import amount_conflicts

    with_text = [r for r in recs if r.get("procedure") and r["procedure"].get("text")]
    if not with_text:
        return None
    # A record whose own mass and molar amount for the same reagent disagree cannot be scaled from.
    # Prefer one that does not contradict itself, before anything else about it.
    for r in with_text:
        r["_conflicts"] = amount_conflicts(r["procedure"]["text"], _mw_lookup(r["procedure"]))
    same_run = next((r for r in with_text if r.get("reaction_id") == prefer_id and not r["_conflicts"]), None)
    best = same_run or max(with_text, key=lambda r: (not r["_conflicts"],
                                         proc_score(r["procedure"]["text"])["experimental"],
                                         r["procedure"].get("yield_pct") is not None,
                                         r["procedure"].get("temperature_c") is not None,
                                         len(r["procedure"].get("reagents") or [])))
    p = best["procedure"]
    s = proc_score(p["text"])
    return {**p, "match": "covered", "url": p.get("url") or best.get("url"), "patent": best.get("patent"),
            # the UI must not head prose with "Procedure"
            "experimental": s["experimental"], "not_experimental_reason": s["reason"] or None,
            # the scale this record was run at. The reagent table under the procedure is the record's
            # own amounts, and the panel above it is our scale; without this the two read as one
            "limiting_recorded_mmol": (best.get("table") or {}).get("limiting_recorded_mmol"),
            # the record's own figures contradict each other; nothing scaled from it can be trusted
            "amount_conflicts": best.get("_conflicts") or None}


def _mw_lookup(procedure: dict):
    """Reagent name as the record writes it -> molar mass from the structure the record gives."""
    from rdkit import Chem
    from rdkit.Chem import Descriptors

    table = {}
    for r in procedure.get("reagents") or []:
        nm, smi = (r.get("name") or "").strip().lower(), r.get("smiles")
        if nm and smi:
            m = Chem.MolFromSmiles(smi)
            if m is not None:
                table[nm] = Descriptors.MolWt(m)

    def mw_of(name: str):
        return table.get((name or "").strip().lower())

    return mw_of


def _conditions(recs: list[dict]) -> dict | None:
    """Per-field, from the first record stating each — evidence/provenance.conditions_from."""
    from evidence.provenance import conditions_from
    return conditions_from(recs)


def _protocol_for(recs, ev, cond, rxn_smiles, product=None):
    """The bench sheet for this step at SCALE_MMOL; the UI multiplies it to the chemist's scale.

    The quantity table has to be the one belonging to the record the conditions name, or the sheet
    charges one run's reagents at another run's temperature.
    """
    from evidence.procedures import adapts_to
    from evidence.protocol import build as build_protocol

    sid = (cond or {}).get("source_id")
    table = next((r.get("table") for r in recs if r.get("table") and r.get("reaction_id") == sid), None)
    if table is None:
        table = next((r.get("table") for r in recs if r.get("table")), None)
    proc = _first_procedure(recs, sid)
    y = next((r["yield_pct"] for r in recs if r.get("yield_pct") is not None), None)
    analog = None

    # Most steps have no record of that exact reaction, and every one of them has a record of the
    # closest reaction to it — the same transformation run on a different substrate, with its
    # amounts already rescaled to our substrates by evidence/adapt.py. A sheet built from that is
    # not a precedent for this step and must never read as one, but it is what a chemist would
    # reach for, and leaving the step with nothing at all was the worse answer.
    if table is None:
        # The closest record, but only where it is honestly a procedure for this reaction —
        # evidence/procedures.adapts_to decides, and its reason is kept so the step can say why it
        # has no sheet instead of leaving the chemist to guess.
        why = []
        best = None
        for a in (ev.get("adapted_candidates") or ev.get("adapted_procedures") or []):
            t = a.get("table") or {}
            reason = adapts_to(t, rxn_smiles or "", a.get("similarity"),
                               t.get("temperature_c"), t.get("time_h"))
            if reason is None and a.get("experimental"):
                best = a
                break
            why.append((a.get("similarity") or 0.0,
                        reason or a.get("not_experimental_reason") or "the record is not a procedure"))
        if best is None:
            # the reason belonging to the CLOSEST candidate, not the first one Model A ranked —
            # a step that says "the closest record is only 0.29 similar" has to mean the closest
            why.sort(key=lambda x: -x[0])
            return {"no_sheet_because": why[0][1] if why else "no record of this reaction carries amounts"}
        table = best["table"]
        analog = {"similarity": best.get("similarity"), "reaction_id": best.get("reaction_id"),
                  "patent": best.get("patent"), "url": best.get("url")}
        proc = {"text": (best.get("table") or {}).get("text"), "reaction_id": best.get("reaction_id")}
        t = best["table"]
        cond = {"temperature_c": t.get("temperature_c"), "time_h": t.get("time_h"),
                "source_id": t.get("reaction_id")}
        y = None

    sheet = build_protocol({"conditions": cond or {}, "procedure": proc, "product": product or {},
                            "reported_yield": None if y is None else y / 100.0,
                            "yield_basis": {}}, table, 1.0)
    if sheet is not None:
        sheet["from_analog"] = analog
    return sheet


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
