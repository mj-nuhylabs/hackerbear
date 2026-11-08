"""Backward stoichiometry. Implements the formulas in CLAUDE_HACKFNM.md exactly.

This is pure calculation, not ML. It must not break in the demo, so the formulas are matched exactly.

    n_needed[target]      = target_mass_g / MW(target)
    n_rxn[i]              = n_needed[product_i] / (yield_i * purification_factor_i)
    n_needed[reactant_j] += n_rxn[i] * stoich_j * equiv_j
    n_cat[i]              = n_rxn[i] * catalyst_loading_i
    mass_g                = n_needed * MW
    consumption           = mass_g * price_per_g                    # based on actual amount consumed
    purchase              = ceil(mass_g / pack_size_g) * pack_price # actual amount paid

Assumed values (purification_factor, equiv, yield when there is no literature value) are all flagged in the result.
"""
from __future__ import annotations

import math
from collections import Counter

DEFAULT_PURIFICATION_FACTOR = 0.9   # assumed value. Adjustable in the UI and labeled
DEFAULT_EQUIV = 1.0                 # equivalents. 1.0 if the record has none


def _mw(c: dict) -> float | None:
    mw = c.get("mw")
    return float(mw) if mw else None


def rollup(steps: list[dict], target_g: float,
           purification_factor: float = DEFAULT_PURIFICATION_FACTOR,
           use_recorded_equivalents: bool = False) -> dict:
    """Steps (starting materials -> target topological order) + target mass -> moles needed per leaf material.

    The product of the last step is taken as the target. Intermediates are passed recursively to earlier steps.
    """
    if not steps:
        return {"n_needed": {}, "n_rxn": {}, "catalysts": {}, "target": None, "warnings": ["no steps"]}
    warnings: list[str] = []
    target = steps[-1]["product"]
    mw_t = _mw(target)
    if not mw_t:
        return {"n_needed": {}, "n_rxn": {}, "catalysts": {}, "target": target,
                "warnings": ["the target has no molecular weight, so nothing can be scaled"]}

    n_needed: dict[str, float] = {target["smiles"]: target_g / mw_t}
    n_rxn: dict[int, float] = {}
    catalysts: dict[str, float] = {}
    equivalents_used: dict[str, dict] = {}

    # Start from the target side (last step) and go backward
    for i in range(len(steps) - 1, -1, -1):
        s = steps[i]
        prod = s["product"]["smiles"]
        need = n_needed.get(prod)
        if not need:
            # Nobody uses this step's product (can occur in convergent routes)
            continue
        y = float(s.get("assumed_yield") or 0.0)
        if y <= 0:
            warnings.append(f"step {i} has no usable yield, so its demand cannot be scaled")
            continue
        rxn = need / (y * purification_factor)
        n_rxn[i] = rxn
        # Use the equivalents the record states. It is a ratio, so it carries over when the scale changes -- this is what
        # generalizes from a procedure. Without a record it is 1.0, and equivalents_used records which case applies
        from .inputs import substrate_equivalents
        recorded_eq = substrate_equivalents(s) if use_recorded_equivalents else {}
        stated_eq = substrate_equivalents(s)
        # If the same reactant is listed twice, that count becomes its stoich
        for smi, stoich in Counter(r["smiles"] for r in s["reactants"]).items():
            eq = recorded_eq.get(smi, DEFAULT_EQUIV)
            equivalents_used.setdefault(smi, {"equiv": stated_eq.get(smi, DEFAULT_EQUIV),
                                              "from_record": smi in stated_eq})
            n_needed[smi] = n_needed.get(smi, 0.0) + rxn * stoich * eq
        cond = s.get("conditions") or {}
        loading = cond.get("catalyst_loading")
        cat = cond.get("catalyst")
        if cat and loading:
            catalysts[cat] = catalysts.get(cat, 0.0) + rxn * float(loading)

    return {"n_needed": n_needed, "n_rxn": n_rxn, "catalysts": catalysts,
            "equivalents": equivalents_used, "target": target, "warnings": warnings}


def buy_vs_make(target: dict | None, target_g: float, price: dict | None, totals: dict) -> dict:
    """Cost of buying the target itself vs. the material cost of making it by this route. If buying is cheaper, say so.

    The comparison is between actual amounts paid (pack-size purchase vs. the BOM purchase total).
    The make side is materials only -- no solvent, labor, equipment or time. So:
      - buy < make         -> "buy". Holds even if some materials have no price (they only make make larger)
      - buy >= make, all priced -> "make" (with the caveat that it is on a materials basis)
      - buy >= make, some material unpriced -> None. make is only a lower bound, so no conclusion
    If the target has no price, do not compare -- do not fill in an estimated price (absolute rule 3).
    """
    make = totals.get("purchase_cost")
    unpriced = totals.get("unpriced_materials") or 0
    out = {"available": False, "verdict": None, "make_cost": make,
           "make_is_lower_bound": unpriced > 0, "unpriced_materials": unpriced}
    if not target or not price or not price.get("pack_size_g") or price.get("pack_price") is None:
        out["reason"] = "the target itself has no catalogue price in data/prices.csv"
        return out

    pack_g, pack_price = float(price["pack_size_g"]), float(price["pack_price"])
    packs = math.ceil(target_g / pack_g)
    buy = packs * pack_price
    ppg = price.get("price_per_g")
    out.update({
        "available": True,
        "smiles": target["smiles"],
        "name": price.get("name"),
        "packs": packs,
        "pack_size_g": pack_g,
        "pack_price": pack_price,
        "price_per_g": ppg,
        "buy_cost": buy,
        "buy_consumption_cost": target_g * float(ppg) if ppg is not None else None,
        "currency": price.get("currency"),
        "supplier": price.get("supplier"),
        "catalog_no": price.get("catalog_no"),
        "url": price.get("url"),
        "as_of_date": price.get("as_of_date"),
        "price_is_mock": bool(price.get("is_mock")),
    })
    if make is None:
        out["reason"] = "none of this route's materials has a price, so making it has no cost to compare"
    elif buy < make:
        out["verdict"] = "buy"
        out["savings"] = make - buy
    elif unpriced == 0:
        out["verdict"] = "make"
        out["savings"] = buy - make
    else:
        out["reason"] = (f"{unpriced} material(s) on this route have no price, so the cost of making it "
                         f"is only a lower bound")
    return out


def bom(steps: list[dict], leaf_materials: list[dict], target_g: float,
        prices: dict[str, dict], purification_factor: float = DEFAULT_PURIFICATION_FACTOR) -> dict:
    """One BOM line per leaf material that must be purchased + totals.

    A substance with no price gets cost None -- it is not counted as 0. Counting it as 0 would make the totals lie.
    """
    roll = rollup(steps, target_g, purification_factor)
    intermediates = {s["product"]["smiles"] for s in steps}
    lines, unpriced = [], 0
    total_consumption = total_purchase = 0.0

    by_smiles = {m["smiles"]: m for m in leaf_materials}
    for smi, moles in sorted(roll["n_needed"].items(), key=lambda kv: -kv[1]):
        if smi in intermediates:
            continue                      # intermediates are not bought
        mat = by_smiles.get(smi, {"smiles": smi})
        mw = _mw(mat)
        mass_g = moles * mw if mw else None
        p = prices.get(smi)
        consumption = purchase = packs = None
        if mass_g is not None and p:
            ppg, pack_g, pack_price = p.get("price_per_g"), p.get("pack_size_g"), p.get("pack_price")
            if ppg is not None:
                consumption = mass_g * float(ppg)
                total_consumption += consumption
            if pack_g and pack_price is not None:
                packs = math.ceil(mass_g / float(pack_g))
                purchase = packs * float(pack_price)
                total_purchase += purchase
        if p is None:
            unpriced += 1
        lines.append({
            "smiles": smi,
            # Name to show on screen instead of SMILES. Use only what a record/catalog gave (chem/names.py)
            "name": mat.get("name") or (p or {}).get("name"),
            "mw": mw,
            "moles": moles,
            "mass_g": mass_g,
            "equiv": (roll["equivalents"].get(smi) or {}).get("equiv"),
            "equiv_from_record": (roll["equivalents"].get(smi) or {}).get("from_record", False),
            "in_stock": mat.get("in_stock"),
            # Why it was considered purchasable (chem/stock.py): priced / commodity (common ORD reagent) / zinc
            "stock_status": mat.get("stock_status"),
            "ord_records": mat.get("ord_records"),
            "price_per_g": (p or {}).get("price_per_g"),
            "pack_size_g": (p or {}).get("pack_size_g"),
            "pack_price": (p or {}).get("pack_price"),
            "packs": packs,
            "consumption_cost": consumption,
            "purchase_cost": purchase,
            "currency": (p or {}).get("currency"),
            "supplier": (p or {}).get("supplier"),
            "catalog_no": (p or {}).get("catalog_no"),
            "url": (p or {}).get("url"),
            "as_of_date": (p or {}).get("as_of_date"),
            "price_is_mock": bool((p or {}).get("is_mock")),
        })

    # The same bill again at the equivalents the records state, where they do. Ranking uses the
    # stoichiometric figure above so every route is compared on one basis; this is what the route
    # actually costs if you follow the procedure, and it is the larger, truer number.
    as_recorded = None
    if any(l.get("equiv_from_record") for l in lines):
        roll2 = rollup(steps, target_g, purification_factor, use_recorded_equivalents=True)
        total2 = 0.0
        intermediates2 = {s["product"]["smiles"] for s in steps}
        for smi, moles in roll2["n_needed"].items():
            if smi in intermediates2:
                continue
            mat = by_smiles.get(smi, {"smiles": smi})
            mw2, p2 = _mw(mat), prices.get(smi)
            if mw2 and p2 and p2.get("price_per_g") is not None:
                total2 += moles * mw2 * float(p2["price_per_g"])
        as_recorded = total2 or None

    steps_with_time = [s for s in steps if (s.get("conditions") or {}).get("time_h") is not None]
    total_h = sum((s["conditions"]["time_h"] for s in steps_with_time), 0.0)
    assumed_yield_steps = sum(1 for s in steps if s.get("yield_is_assumed"))

    # Inputs that do not go into the product (reagents, catalysts, solvents) are converted from the amounts in the record and counted separately (cost/inputs.py).
    # Not mixed with material cost: only steps with records have values, so adding them would make a
    # well-documented route look more expensive than an undocumented one. Ranking uses material cost only (see cost/rank.py)
    from . import inputs as reagent_inputs
    rg = reagent_inputs.rollup(steps, roll["n_rxn"])
    rg_lines, rg_cost, rg_uncosted = reagent_inputs.price_lines(rg["lines"], prices)

    return {
        "bom": lines,
        "reagents": rg_lines,
        "totals": {
            "target_g": target_g,
            "consumption_cost": total_consumption if total_consumption else None,
            "purchase_cost": total_purchase if total_purchase else None,
            "currency": next((l["currency"] for l in lines if l["currency"]), None),
            "unpriced_materials": unpriced,
            # Recomputed with the equivalents the record states. Ranking uses the stoichiometry-based value above
            "consumption_cost_as_recorded": as_recorded,
            # Reagents, catalysts, solvents. Placed alongside, not merged into material cost
            "reagent_cost": rg_cost,
            "reagent_lines": len(rg_lines),
            "reagent_lines_uncosted": rg_uncosted,
            "steps_with_recorded_inputs": len(rg["steps_recorded"]),
            # Inputs where the record gives only a name and no structure (mined text such as "above solution")
            "reagent_inputs_unidentified": rg["unidentified"],
            # Time is summed only for steps that have conditions. The rest are counted as "unknown" (not added to the total)
            "reaction_time_h": total_h if steps_with_time else None,
            "steps_without_time": len(steps) - len(steps_with_time),
        },
        # Per-step scale (same order as steps). n_rxn is None for steps whose product nobody uses
        "steps": [{"n_rxn": roll["n_rxn"].get(i),
                   "yield": float(s.get("assumed_yield") or 0.0) or None,
                   "yield_is_assumed": bool(s.get("yield_is_assumed"))}
                  for i, s in enumerate(steps)],
        "assumptions": {
            "purification_factor": purification_factor,
            # Reactants with an equivalent stated in the record use that value; the rest were computed with 1.0
            "equivalents": DEFAULT_EQUIV,
            "materials_at_recorded_equivalents":
                sum(1 for v in roll["equivalents"].values() if v["from_record"]),
            "materials_at_assumed_equivalents":
                sum(1 for v in roll["equivalents"].values() if not v["from_record"]),
            # Reagent amounts are not assumed. Steps without a record are simply counted as unknown
            "steps_without_recorded_inputs": len(rg["steps_unrecorded"]),
            "steps_using_assumed_yield": assumed_yield_steps,
            "steps_total": len(steps),
        },
        "warnings": roll["warnings"],
    }
