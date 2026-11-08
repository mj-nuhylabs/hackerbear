"""AiZynthFinder wrapper -> Route objects.

Routes, templates and precedent counts are values given by AiZynthFinder and the USPTO template library;
the plausibility score comes from model/predict.py, the evidence tier from evidence/tiers.py, and sources, conditions and yields
are what evidence/provenance.py found in ORD records. This file produces no numbers of its own.

Only assumed_yield is an assumption -- use the literature value if there is one, otherwise ASSUMED_YIELD,
and mark the step yield_is_assumed=True so the UI can attach a label.
"""
from __future__ import annotations

import threading
from pathlib import Path

from cost import rank as cost_rank
from evidence import analogs, provenance
from evidence.tiers import ANALOGOUS_MIN_PRECEDENTS, decide
from model.predict import score_many

from .balance import missing_atoms
from .resolve import describe
from .stock import label as stock_label

CONFIG = Path(__file__).resolve().parents[1] / "data/aizynth/config.yml"
ASSUMED_YIELD = 0.70          # only when there is no literature value. Always mark as assumed
MAX_ROUTES = 5
DEFAULT_TIME_LIMIT_S = 45
SEARCH_SEED = 0               # the same molecule must give the same routes on every search (see finder())

_finder = None
_lock = threading.Lock()
# Kept so /cost and /explain can look routes up again by route_id (no DB -- in memory)
ROUTES: dict[str, dict] = {}


def finder():
    """Load AiZynthFinder once. The ONNX models are large, so the first call is slow."""
    global _finder
    if _finder is None:
        with _lock:
            if _finder is None:
                import random

                import numpy as np
                from aizynthfinder.aizynthfinder import AiZynthFinder

                from .stock import use_with_zinc
                # MCTS picks the node to expand with random.choice / np.random.choice. Without a seed,
                # searching the same molecule twice can give different routes -- the reason a chemist feels "the compound
                # from before disappeared". Results must be identical every time to be verifiable.
                random.seed(SEARCH_SEED)
                np.random.seed(SEARCH_SEED)
                f = AiZynthFinder(configfile=str(CONFIG))
                # ZINC alone cannot buy EtOH, MeI or CS2, so the search would "synthesize" them (chem/stock.py)
                use_with_zinc(f)
                f.expansion_policy.select("uspto")
                f.filter_policy.select("uspto")
                _finder = f
    return _finder


def _walk(node: dict, steps: list, leaves: dict):
    """Post-order traversal of an AiZynth route dict (target -> leaves); steps are in topological order, starting materials -> target."""
    if node.get("type") != "mol":
        return
    # The UI plugs the SVG straight into schemes, steps and the BOM (RDKit rendering)
    if not node.get("children"):
        c = describe(node["smiles"])
        leaves[c["smiles"]] = {**c, "in_stock": bool(node.get("in_stock")),
                               **stock_label(c["smiles"], bool(node.get("in_stock")))}
        return
    rxn = node["children"][0]
    for child in rxn.get("children", []):
        _walk(child, steps, leaves)
    md = rxn.get("metadata", {}) or {}
    reactants = [describe(m["smiles"]) for m in rxn.get("children", [])]
    product = describe(node["smiles"])
    steps.append({
        "rxn_smiles": ".".join(r["smiles"] for r in reactants) + ">>" + product["smiles"],
        "template_id": md.get("template_hash"),
        "classification": md.get("classification"),
        "reactants": reactants,
        "product": product,
        "precedent_count": int(md.get("library_occurence") or 0),
        "missing_atoms": missing_atoms([r["smiles"] for r in reactants], product["smiles"]),
    })


def _finish_steps(steps: list[dict]) -> list[dict]:
    """Attach plausibility scores (batched) + evidence tier + source/conditions/yield + analogous reactions.

    Value priority is **nearest evidence first**:
      1. Records of this exact reaction (provenance) -- the same reaction is on record
      2. Close analogous reactions (analogs)        -- it has been run on other substrates
      3. Assumed value ASSUMED_YIELD                -- nothing at all
    Which one was used is recorded in yield_basis so the UI can attach a label. Option 2 is used only when it clears
    the similarity threshold (see the measurement table in evidence/analogs.py).
    """
    scores = score_many([s["rxn_smiles"] for s in steps])
    neighbours = analogs.search_many([s["rxn_smiles"] for s in steps])
    out = []
    for s, (raw, cal), hits in zip(steps, scores, neighbours):
        records = provenance.match([r["smiles"] for r in s["reactants"]], s["product"]["smiles"])
        tier = decide(has_corpus_record=bool(records),
                      precedent_count=s["precedent_count"],
                      plausibility_calibrated=cal)
        evidence = provenance.evidence_from(records, s["precedent_count"], tier)
        lit_pct = provenance.reported_yield(records)              # percent value from the records
        lit_yield = lit_pct / 100.0 if lit_pct is not None else None  # 0-1 fraction, same as assumed_yield and the UI

        analog_yield, analog_basis = analogs.yield_from(hits)
        if lit_yield is not None:
            used, basis = lit_yield, {"basis": "reported", "source_ids": evidence["source_ids"]}
        elif analog_yield is not None:
            used, basis = analog_yield, analog_basis
        else:
            used, basis = ASSUMED_YIELD, {"basis": "assumed", "value": ASSUMED_YIELD}

        out.append({
            "rxn_smiles": s["rxn_smiles"],
            "template_id": s["template_id"],
            "classification": s["classification"],
            "reactants": s["reactants"],
            "product": s["product"],
            "evidence": evidence,
            # If the reactant list cannot account for all product atoms, the number of missing elements (chem/balance.py). Cost becomes a lower bound
            "missing_atoms": s.get("missing_atoms"),
            # Conditions follow the same order. Analog conditions are marked from_analog=True so the UI can tell them apart
            "conditions": (provenance.conditions_from(records)
                           or analogs.conditions_from(hits)),
            "procedure": provenance.procedure_from(records, [r["smiles"] for r in s["reactants"]]),
            "analogs": hits,
            "reported_yield": lit_yield,
            # The value used in calculation. yield_basis says where it came from
            "assumed_yield": used,
            "yield_is_assumed": lit_yield is None,
            "yield_basis": basis,
            "plausibility_raw": raw,
            "plausibility_calibrated": cal,
        })
    return out


DEEP = Path(__file__).resolve().parents[1] / "data/deep"


def _demo_payload(smiles: str) -> dict | None:
    """The 5 demo targets return results precomputed overnight (scripts/score_deep_targets.py) as they are.

    Contains the recorded routes (every step an ORD record) + the deeply searched AiZynth routes, with both models' rankings.
    If the file is missing, None -- fall back to live search.
    """
    from model.holdout import ALL_TARGETS, slug
    from rdkit import Chem
    m = Chem.MolFromSmiles(smiles)
    if m is None:
        return None
    key = Chem.MolToSmiles(m, isomericSmiles=False)
    for name, s in ALL_TARGETS.items():
        if Chem.MolToSmiles(Chem.MolFromSmiles(s), isomericSmiles=False) == key:
            p = DEEP / f"demo_{slug(name)}.json"
            if p.exists():
                import json
                return json.loads(p.read_text())
    return None


def search(smiles: str, max_depth: int = 4, *, time_limit_s: int = DEFAULT_TIME_LIMIT_S,
           max_routes: int = MAX_ROUTES) -> dict:
    """Target SMILES -> {routes, search}. If no route is found, routes is an empty list."""
    demo = _demo_payload(smiles)
    if demo is not None:
        for r in demo["routes"]:
            ROUTES[r["id"]] = r
        return {"routes": demo["routes"], "search": demo["search"]}

    f = finder()
    with _lock:
        f.config.search.time_limit = time_limit_s
        # The AiZynthFinder 4.x field is named max_transforms. Passing max_depth is silently ignored
        f.config.search.max_transforms = max_depth
        f.target_smiles = smiles
        f.tree_search()
        f.build_routes()
        stats = f.extract_statistics()
        dicts, scores = list(f.routes.dicts), list(f.routes.scores)

    routes = []
    for i, (rd, sc) in enumerate(zip(dicts, scores)):
        raw_steps, leaves = [], {}
        _walk(rd, raw_steps, leaves)
        if not raw_steps:
            continue
        rid = f"R{i + 1}"
        routes.append({
            "id": rid,
            "steps": _finish_steps(raw_steps),
            "leaf_materials": list(leaves.values()),
            "aizynth_score": round(float(sc.get("state score", next(iter(sc.values())))), 3),
        })
    # AiZynth scores are almost all 0.998 for short routes where everything is purchasable, so they cannot order them.
    # Sort by material cost per gram from the cost engine (yield-adjusted) (cost/rank.py)
    routes = cost_rank.rank(routes)[:max_routes]
    for r in routes:
        ROUTES[r["id"]] = r
    return {
        "routes": routes,
        "search": {
            "solved": bool(stats.get("is_solved")),
            "search_time_s": round(float(stats.get("search_time", 0.0)), 1),
            "analogous_min_precedents": ANALOGOUS_MIN_PRECEDENTS,
            # If the analog index is missing, every analogs list is empty. The UI must be able to tell "off" from
            # "not found" -- both must not look like the same blank screen
            "analog_index": analogs.stats() or None,
        },
    }
