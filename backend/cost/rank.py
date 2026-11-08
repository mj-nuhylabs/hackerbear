"""Route order — cheapest material cost per gram of target first, from the cost engine's own numbers.

The cost engine (cost/stoich.py) already measures what a chemist means by a viable route: it
pushes every step's yield back through the route, so a low-yield step, or a long chain of them,
needs more starting material and costs more per gram of target. Ranking by that number is what
puts Et2NH + the chloroacetanilide ($16/g) above a route from a $24,080/g metabolite standard,
and AstraZeneca's 5-step osimertinib route (40 % overall, all yields recorded) above the 4-step
one (17 %). The old order did neither: recorded routes always first, fewer steps first, and
Model B (trained to imitate patents) for the rest — none of which ever looked at a price or a yield.

Sort key, in order:
  1. complete before incomplete — a route that does not reach buyable materials cannot be run
  2. how much of the cost is known
       full         every material has a price and every step's reactants supply its product
       lower_bound  a material has no price, or a step's record is missing a reactant
                    (chem/balance.py) — the true cost is higher than the number shown
       none         nothing on the route has a price
  3. among lower bounds, fewer unknowns (unpriced materials + steps missing a reactant): more
     missing prices always make a bound look cheaper, so bounds are not compared directly
  4. material cost per gram of target, consumption basis. Consumption is linear in the amount
     made, so this order is the same at 1 g and at 1 kg (pack-size purchase totals are not)
  5. fewer steps
  6. Model B score, higher first — only ever breaks exact ties

Not in the cost (yet): reagents, solvents and catalysts that do not end up in the product,
equivalents above 1, labour. Steps count only as a tie-break; their cost shows up through yield.
"""
from __future__ import annotations

from . import prices, stoich

RANK_BASIS = ("material cost per gram of target, yields pushed back through the route; "
              "fully costed routes first, then fewer steps")
KNOWN_ORDER = {"full": 0, "lower_bound": 1, "none": 2}


def summary(route: dict, table: dict[str, dict] | None = None,
            purification_factor: float = stoich.DEFAULT_PURIFICATION_FACTOR) -> dict:
    """The numbers the order is decided on, kept on the route so the UI can show them."""
    leaves = route.get("leaf_materials") or []
    table = prices.table() if table is None else table
    found = {l["smiles"]: table[l["smiles"]] for l in leaves if l.get("smiles") in table}
    b = stoich.bom(route["steps"], leaves, 1.0, found, purification_factor)
    t = b["totals"]
    gaps = [i for i, s in enumerate(route["steps"]) if s.get("missing_atoms")]
    cost = t["consumption_cost"]
    # a line without a consumption cost is unpriced whether it has no row or a row without a price
    unpriced = sum(1 for l in b["bom"] if l["consumption_cost"] is None)
    known = "none" if cost is None else ("lower_bound" if unpriced or gaps else "full")
    return {
        "cost_per_g": round(cost, 4) if cost is not None else None,
        "currency": t["currency"],
        "cost_known": known,
        "unpriced_materials": unpriced,
        "materials": len(b["bom"]),
        "steps_missing_reactant": gaps,
        "n_steps": len(route["steps"]),
        "purification_factor": purification_factor,
    }


def key(route: dict, s: dict) -> tuple:
    # Among lower bounds, fewer unknowns first: a route with four unpriced materials always
    # *looks* cheaper than one with one, so comparing their bounds directly rewards missing data.
    return (route.get("complete") is False,
            KNOWN_ORDER[s["cost_known"]],
            s["unpriced_materials"] + len(s["steps_missing_reactant"]),
            s["cost_per_g"] if s["cost_per_g"] is not None else float("inf"),
            s["n_steps"],
            -(route.get("route_rank_score") or 0.0))


def rank(routes: list[dict], table: dict[str, dict] | None = None) -> list[dict]:
    """Attach route['rank'] and return the routes in viability order (a new list)."""
    table = prices.table() if table is None else table
    for r in routes:
        r["rank"] = summary(r, table)
        r["rank_basis"] = RANK_BASIS
    return sorted(routes, key=lambda r: key(r, r["rank"]))
