"""Everything else a step consumes — reagents, catalysts, solvents — from the recorded amounts.

The bill of materials only ever listed the molecules that end up in the product. Imatinib's
Buchwald step is the plain example: the record (ord-8f24e6ad…) states 0.05 equiv of rac-BINAP and
0.014 equiv of Pd2(dba)3, and both were costed at zero because neither is a leaf of the route.

Nothing is assumed here. evidence/adapt.py has already rescaled each record's inputs to our
substrates — equivalents from the record's own moles, volumes at the record's own concentration —
and that table is per `scale_mmol` mmol of the limiting substrate. This module multiplies it up to
the scale the route actually runs at and groups the result by molecule:

    mass_g    = mass_mg   × n_rxn / scale_mmol          (n_rxn: moles of this reaction)
    volume_ml = volume_ml × n_rxn × 1000 / scale_mmol

What cannot be costed stays uncosted and says why:
  * a solvent is recorded as a volume, and ORD does not carry a density, so a volume-only input
    has no mass and therefore no cost. It is listed in millilitres and counted as uncosted
  * a reagent with no price row shows its mass and a — , like any unpriced material
  * a step whose records state no amounts contributes nothing and is counted as unrecorded, so
    the UI can say how much of the route this covers

Live /routes searches carry no amount tables (only the five precomputed targets do, where
scripts/build_deep_targets.py read the procedures out of ORD), so there every step counts as
unrecorded and the route's reagents are simply unknown.
"""
from __future__ import annotations

from rdkit import Chem, RDLogger

RDLogger.DisableLog("rdApp.*")

# ORD roles that are never a molecule the route buys as a starting material.
NON_SUBSTRATE_ROLES = ("REAGENT", "CATALYST", "SOLVENT")

# A volume row is scaled by the record's own limiting moles, so one bad number there blows the
# volume up: one aspirin record scales to 33 L of water per gram of product. The table makes the
# error measurable without any outside assumption — a row holding V mL per 1 mmol of limiting
# substrate puts the reaction at 1/V mol/L, so 1,000 mL/mmol is a 1 mM reaction. Nothing
# preparative is run that dilute, so below this the record's own moles and volume contradict each
# other and neither can be scaled. Masses are unaffected: they come from an equivalents ratio.
# Measured on the five targets: 3 of 18 records with volumes fail this; the rest sit at 0.01–1 M.
MIN_CONCENTRATION_M = 0.001


def _canon(smiles: str | None) -> str | None:
    m = Chem.MolFromSmiles(smiles) if smiles else None
    return Chem.MolToSmiles(m) if m is not None else None


def best_table(step: dict) -> dict | None:
    """The step's recorded amount table with the most inputs actually stated.

    Records of the same reaction differ in how much the patent text gave up; the one that states
    the most amounts is the one worth scaling. Ties keep the earlier record, which is the order
    evidence/provenance.py already ranks by completeness.
    """
    tables = [r["table"] for r in (step.get("recorded_records") or []) if r.get("table")]
    if not tables:
        return None
    def stated(t):
        return sum(1 for r in t.get("rows") or []
                   if r.get("mass_mg") is not None or r.get("volume_ml") is not None)
    best = max(tables, key=stated)
    return best if stated(best) else None


def for_step(step: dict, n_rxn: float) -> tuple[list[dict], int]:
    """Non-substrate inputs of one step at n_rxn moles of reaction, and how many were skipped for
    having no structure. ([], 0) when nothing is recorded.

    A row the table marked as one of our substrates is skipped: that molecule is already on the
    bill as a leaf or an intermediate, and counting it here would charge for it twice.

    A row with no SMILES is skipped too. This list is a shopping list, and USPTO mining writes
    prose into the input name where the patent had no structure — "above solution", "the residue".
    Those cannot be bought, priced or checked against a supplier page. They keep their place in
    the step's own recorded table, verbatim, and are counted here so the route can say how many
    inputs it could not identify.
    """
    table = best_table(step)
    if table is None:
        return [], 0
    scale = float(table.get("scale_mmol") or 1.0) or 1.0
    out, unidentified = [], 0
    for r in table.get("rows") or []:
        if r.get("is_substrate"):
            continue
        smiles = _canon(r.get("our_smiles") or r.get("recorded_smiles"))
        mass_mg, vol_ml = r.get("mass_mg"), r.get("volume_ml")
        if vol_ml and (scale / vol_ml) < MIN_CONCENTRATION_M:
            vol_ml = None                 # the record's moles and volume contradict each other
        if mass_mg is None and vol_ml is None:
            continue                      # the record states no amount for this input
        if smiles is None:
            unidentified += 1
            continue
        out.append({
            "smiles": smiles,
            "name": r.get("recorded_name") or r.get("label"),
            "role": r.get("role"),
            "equiv": r.get("equiv"),
            "mass_g": (mass_mg * n_rxn / scale) if mass_mg is not None else None,
            "volume_ml": (vol_ml * n_rxn * 1000.0 / scale) if vol_ml is not None else None,
            "source_id": table.get("reaction_id"),
        })
    return out, unidentified


def rollup(steps: list[dict], n_rxn: dict[int, float]) -> dict:
    """Every step's non-substrate inputs, summed per molecule.

    Returns {"lines": [...], "steps_recorded": [i], "steps_unrecorded": [i], "unidentified": n}.
    A line without a mass carries a volume instead and can never be costed; both are kept so the
    UI can show the chemist what the step needs even when no price exists.
    """
    merged: dict[tuple, dict] = {}
    recorded, unrecorded, unidentified = [], [], 0
    for i, s in enumerate(steps):
        n = n_rxn.get(i)
        rows, un = for_step(s, n) if n else ([], 0)
        unidentified += un
        if not rows:
            # a step nobody draws product from has no scale; it is not evidence either way
            unrecorded.append(i)
            continue
        recorded.append(i)
        for r in rows:
            key = (r["smiles"] or r["name"], r["role"])
            m = merged.setdefault(key, {**r, "mass_g": None, "volume_ml": None,
                                        "steps": [], "source_ids": []})
            for field in ("mass_g", "volume_ml"):
                if r[field] is not None:
                    m[field] = (m[field] or 0.0) + r[field]
            m["steps"].append(i)
            if r["source_id"] and r["source_id"] not in m["source_ids"]:
                m["source_ids"].append(r["source_id"])
            # equivalents differ per step once a molecule is used twice; the per-step table keeps them
            if len(m["steps"]) > 1:
                m["equiv"] = None
    order = {"REAGENT": 0, "CATALYST": 1, "SOLVENT": 2}
    lines = sorted(merged.values(), key=lambda r: (order.get(r["role"], 0), -(r["mass_g"] or 0.0)))
    for r in lines:
        r.pop("source_id", None)
    return {"lines": lines, "steps_recorded": recorded, "steps_unrecorded": unrecorded,
            "unidentified": unidentified}


def price_lines(lines: list[dict], prices: dict[str, dict]) -> tuple[list[dict], float | None, int]:
    """Attach a price to each line. Returns (lines, total consumption cost or None, uncosted count).

    Uncosted: a volume-only input (no density in ORD, so no mass to price) or a mass with no
    price row. Neither is counted as zero — the total says how many it leaves out.
    """
    total, uncosted = 0.0, 0
    out = []
    for r in lines:
        p = prices.get(r["smiles"]) if r["smiles"] else None
        cost = None
        if r["mass_g"] is not None and p and p.get("price_per_g") is not None:
            cost = r["mass_g"] * float(p["price_per_g"])
            total += cost
        else:
            uncosted += 1
        out.append({**r,
                    "price_per_g": (p or {}).get("price_per_g"),
                    "supplier": (p or {}).get("supplier"),
                    "catalog_no": (p or {}).get("catalog_no"),
                    "url": (p or {}).get("url"),
                    "as_of_date": (p or {}).get("as_of_date"),
                    "currency": (p or {}).get("currency"),
                    "consumption_cost": cost,
                    # why there is no number: no density for a volume, or no price row
                    "uncosted_reason": (None if cost is not None else
                                        ("volume only — ORD records no density" if r["mass_g"] is None
                                         else "no price on record"))})
    return out, (total if total else None), uncosted
