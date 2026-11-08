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
  2. a route with no price at all on any material goes last; there is nothing to compare
  3. a cost that covers less than COVERAGE_MIN of what the route buys, by mass, goes after the
     ones that do. An unpriced material adds nothing to the total, so a route missing most of
     its prices always looks cheapest — osimertinib has a 5-step route at "$1.56/g" with four
     of six materials unpriced. Mass, not count: counting treats a 41 mg catalyst and a 3 kg
     starting material alike, and that is what demoted AstraZeneca's own route (US08946235B2,
     $49.68/g, every yield recorded) below a fully priced route at $275/g over a single
     unpriced aniline. A cost built on most of the route's mass competes on cost
  4. material cost per gram of target, consumption basis. Consumption is linear in the amount
     made, so this order is the same at 1 g and at 1 kg (pack-size purchase totals are not)
  5. fewer steps
  6. fewer unknowns, then Model B score — only ever break exact ties

A fully priced route has mass_covered 1.0, so it is never demoted by rule 3; it simply competes
on its real cost. "full" and "lower_bound" stay on the route for the UI's "≥", which marks a
total that leaves something out, but they no longer decide the order on their own.

Not in the cost (yet): reagents, solvents and catalysts that do not end up in the product,
equivalents above 1, labour. Steps count only as a tie-break; their cost shows up through yield.
"""
from __future__ import annotations

from . import prices, stoich

RANK_BASIS = ("material cost per gram of target, yields pushed back through the route; "
              "fully costed routes first, then fewer steps")
KNOWN_ORDER = {"full": 0, "lower_bound": 1, "none": 2}
# Share of the route's bought mass that has to be priced before its cost is worth comparing.
# Half: below that the number is built on a minority of the route and says more about what is
# missing than about the chemistry.
COVERAGE_MIN = 0.5


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
    n_mat = len(b["bom"])
    # How much of what the route buys the cost actually covers, by mass rather than by count.
    # Counting materials treats a 41 mg catalyst and a 3 kg starting material alike; mass says
    # how much of the route a bound really accounts for.
    # Coverage is about price, and only price. Folding "did a record state the equivalents" into it
    # was a mistake: almost no route has recorded equivalents, so almost every route scored zero,
    # the gate stopped separating anything, and the order fell back to raw cost — which hands first
    # place to whichever route has the most unpriced materials. Lidocaine's documented route lost
    # its place to a two-step bromination costed on one priced material out of two.
    #
    # Equivalents are handled instead by costing every route the same way, in bom(): the ranked
    # figure is stoichiometric, so routes are comparable, and the figure at the equivalents a record
    # actually used is carried beside it for the routes that have one.
    mass_all = sum(l["mass_g"] or 0.0 for l in b["bom"])
    mass_priced = sum(l["mass_g"] or 0.0 for l in b["bom"] if l["consumption_cost"] is not None)
    covered = (mass_priced / mass_all) if mass_all else 0.0
    # A step whose record omits a reactant leaves that material off the bill altogether, so the
    # mass share above cannot see the hole — aspirin's recorded acetylation reads "100 % priced"
    # at $0.62/g precisely because the acetic anhydride it needs was never listed. Treat the gap
    # as uncovered, or the records with the worst mining win on a cost they never paid.
    covers_most = covered >= COVERAGE_MIN and not gaps
    return {
        "cost_per_g": round(cost, 4) if cost is not None else None,
        "currency": t["currency"],
        "cost_known": known,
        "unpriced_materials": unpriced,
        "mass_covered": round(covered, 4),
        "mass_priced": round((mass_priced / mass_all) if mass_all else 0.0, 4),
        "assumed_equivalents": sum(1 for l in b["bom"] if not l.get("equiv_from_record")),
        # a bound built on most of the route's mass is worth comparing on cost (see the sort key)
        "bound_covers_most": covers_most,
        "materials": n_mat,
        "steps_missing_reactant": gaps,
        "n_steps": len(route["steps"]),
        "purification_factor": purification_factor,
    }


def key(route: dict, s: dict) -> tuple:
    return (route.get("complete") is False,
            s["cost_per_g"] is None,
            not s["bound_covers_most"],
            s["cost_per_g"] if s["cost_per_g"] is not None else float("inf"),
            s["n_steps"],
            s["unpriced_materials"] + len(s["steps_missing_reactant"]),
            -(route.get("route_rank_score") or 0.0))


def rank(routes: list[dict], table: dict[str, dict] | None = None) -> list[dict]:
    """Attach route['rank'] and return the routes in viability order (a new list)."""
    table = prices.table() if table is None else table
    for r in routes:
        r["rank"] = summary(r, table)
        r["rank_basis"] = RANK_BASIS
    return sorted(routes, key=lambda r: key(r, r["rank"]))
