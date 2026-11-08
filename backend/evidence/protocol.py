"""A bench sheet for one step, at the scale the route needs.

Quoting a paper is not a procedure for your reaction. The source ran 0.0072 mol and you need
8.11 mmol; its sentences carry its own numbers, and a chemist then has to redo every one of them.
This builds the sheet for the scale actually being made: what to charge, how much of it, in what
order, at what temperature, for how long.

Nothing here is written by a model and nothing is inferred. Each line is assembled from values
that already exist:

  quantities    evidence/adapt.py rescaled the record's own amounts to this step's scale, by
                equivalents; chem/density.py turns a mass into millilitres where the supplier page
                gave a density, so a liquid is measured and a solid is weighed
  order         ORD keeps its inputs in the order the record lists them, which is the order they
                went in; substrates first, then the rest
  conditions    the one record the step cites, never merged across runs
                (evidence/provenance.conditions_from)
  workup        the source's own words, quoted, because no part of it can be recomputed

Every line says where its numbers came from, and a line whose value is missing says so rather than
carrying a plausible one. The sheet is not a substitute for the source: it sits beside it.
"""
from __future__ import annotations

import re

ROLE_ORDER = {"REACTANT": 0, "REAGENT": 1, "CATALYST": 2, "SOLVENT": 3}
# the sentence in a recorded procedure where the reaction stops and the isolation starts
_WORKUP = re.compile(
    r"((?:after|once|on completion|the (?:reaction )?mixture was then|then)\b[^.]*?\b"
    r"(?:cool|quench|pour|filter|extract|wash|concentrat|evaporat|crystalli|precipitat|dilut)[^.]*\.)"
    r"|((?:the (?:product|solid|residue|crude|organic layer|mixture)|product)\b[^.]*?\b"
    r"(?:was|were)\b[^.]*?\b(?:filter|extract|wash|collect|dried|concentrat|recrystalli)[^.]*\.)",
    re.I)


def _fmt_mass(mg: float | None) -> str | None:
    if mg is None:
        return None
    return f"{mg / 1000:.3g} g" if mg >= 1000 else f"{mg:.3g} mg"


def _fmt_vol(ml: float | None) -> str | None:
    if ml is None:
        return None
    return f"{ml * 1000:.3g} µL" if ml < 1 else f"{ml:.3g} mL"


def _amount(row: dict, factor: float) -> dict:
    """How much of this input, at our scale, and how to put it in."""
    scale = lambda v: None if v is None else v * factor
    mass_mg, measure_ml = scale(row.get("mass_mg")), scale(row.get("measure_ml"))
    rec_vol = scale(row.get("volume_ml"))
    return {
        "mass": _fmt_mass(mass_mg),
        "volume": _fmt_vol(measure_ml if measure_ml is not None else rec_vol),
        "measured_by_density": measure_ml is not None,
        "mmol": None if row.get("mmol") is None else round(row["mmol"] * factor, 3),
        "equiv": row.get("equiv"),
    }


def charges(step: dict, table: dict | None, factor: float) -> list[dict]:
    """One line per thing that goes into the flask, in the order the record lists them."""
    if not table:
        return []
    out = []
    for i, row in enumerate(table.get("rows") or []):
        amt = _amount(row, factor)
        if amt["mass"] is None and amt["volume"] is None and amt["mmol"] is None:
            # the record names it but states no amount — say so rather than leave it off the sheet
            out.append({"name": row.get("recorded_name") or row.get("label"),
                        "smiles": row.get("our_smiles") or row.get("recorded_smiles"),
                        "role": row.get("role"), "is_substrate": bool(row.get("is_substrate")),
                        "amount": None, "note": "the record states no amount for this", "order": i})
            continue
        out.append({"name": row.get("recorded_name") or row.get("label"),
                    "smiles": row.get("our_smiles") or row.get("recorded_smiles"),
                    "role": row.get("role"), "is_substrate": bool(row.get("is_substrate")),
                    "amount": amt, "note": None, "order": i})
    out.sort(key=lambda r: (ROLE_ORDER.get((r.get("role") or "").upper(), 1),
                            not r["is_substrate"], r["order"]))
    return out


def workup(text: str | None) -> str | None:
    """The source's own isolation sentences, quoted. None when it does not describe one."""
    if not text:
        return None
    found = [m.group(0).strip() for m in _WORKUP.finditer(text)]
    joined = " ".join(dict.fromkeys(found)).strip()
    return joined or None


def build(step: dict, table: dict | None, factor: float, target_g: float | None = None) -> dict:
    """The whole sheet: what to charge, the conditions, the isolation, and what is missing."""
    c = step.get("conditions") or {}
    lines = charges(step, table, factor)
    product = step.get("product") or {}
    missing = []
    if c.get("temperature_c") is None:
        missing.append("temperature")
    if c.get("time_h") is None:
        missing.append("reaction time")
    if not lines:
        missing.append("amounts for anything")
    if step.get("reported_yield") is None:
        missing.append("a reported yield")
    return {
        "scale_mmol": round(factor * (table or {}).get("scale_mmol", 1.0), 3) if table else None,
        "charges": lines,
        "temperature_c": c.get("temperature_c"),
        "time_h": c.get("time_h"),
        "solvent": c.get("solvent"),
        "catalyst": c.get("catalyst_name") or c.get("catalyst"),
        "workup": workup((step.get("procedure") or {}).get("text")),
        "source_id": c.get("source_id") or (step.get("procedure") or {}).get("reaction_id"),
        "expected_g": (round(target_g, 4) if target_g else None),
        "product_name": product.get("name"),
        "reported_yield": step.get("reported_yield"),
        "yield_basis": (step.get("yield_basis") or {}).get("basis"),
        "missing": missing,
    }
