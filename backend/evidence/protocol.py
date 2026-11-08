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
# Isolation verbs, in the past tense a paper uses and the imperative a manual uses. "concentrated"
# is deliberately only matched as an operation — "concentrated under reduced pressure", "was
# concentrated" — because "concentrated phosphoric acid" is a strength, not a step, and matching it
# turned the aspirin sheet's workup into "Add 3 drops of concentrated phosphoric acid".
_ISOLATION = (r"quench\w*|pour\w*|filter\w*|filtrat\w*|extract\w*|wash\w*|collect\w*|"
              r"evaporat\w*|crystalli[sz]\w*|recrystalli[sz]\w*|precipitat\w*|triturat\w*|"
              r"concentrated (?:under|in vacuo|to)|concentrate the|was concentrated|"
              r"dried over|dry under|dried under")
_ISOLATION_RE = re.compile(rf"\b(?:{_ISOLATION})", re.I)
# A sentence ends at a full stop only where the next sentence begins — whitespace then a capital.
# Splitting on every "." cut the caffeine work-up at "to give a silky white solid (0." because the
# yield in parentheses contains one, and it would cut "m.p. 234-236 C" the same way.
_SENTENCE = re.compile(r"(?<=[.!?])\s+(?=[A-Z])")
# There is deliberately no second filter rejecting sentences that mention adding something. One was
# here, and it threw away the real work-up: "the acetonitrile was evaporated under vacuum, ethanol
# was added to the solid crude reaction mixture, followed by water" is an isolation that happens to
# add a solvent, and lidocaine's two leading routes showed no work-up at all because of it. It also
# dropped aspirin's recrystallisation for saying "add 13 mL of cold water". Carrying an isolation
# verb is the test; a sentence that only sets the reaction up has none.
_NOT_WORKUP = re.compile(r"(?!)")      # matches nothing


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
    vol = measure_ml if measure_ml is not None else rec_vol
    return {
        # formatted for reading, and raw so the screen can rescale without parsing text back
        "mass": _fmt_mass(mass_mg),
        "volume": _fmt_vol(vol),
        "mass_mg": None if mass_mg is None else round(mass_mg, 4),
        "volume_ml": None if vol is None else round(vol, 5),
        "measured_by_density": measure_ml is not None,
        # The record poured it, so we pour it. Without this a reagent whose volume the source
        # states - the patent's pyridine, 64 microlitres for 0.80 mmol - was shown as a mass,
        # because a mass could be worked out from its moles and the screen preferred that.
        "volume_recorded": rec_vol is not None,
        "mmol": None if row.get("mmol") is None else round(row["mmol"] * factor, 4),
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
    # ORD lists the same species more than once when a patent writes it into several inputs, so a
    # sheet built straight from the rows tells you to charge salicylic acid twice. One line per
    # compound, the one that carries an amount.
    merged: dict = {}
    for r in out:
        key = r["smiles"] or r["name"]
        prev = merged.get(key)
        if prev is None or (prev["amount"] is None and r["amount"] is not None):
            merged[key] = r if prev is None else {**r, "order": prev["order"]}
    out = list(merged.values())
    out.sort(key=lambda r: (ROLE_ORDER.get((r.get("role") or "").upper(), 1),
                            not r["is_substrate"], r["order"]))
    return out


# Spectroscopic and physical data. A submission keeps these apart from the procedure, and the
# mined patent text runs them together: "...to give the title compound (138.7 g, 81.5%) as a purple
# solid; 1H NMR (CDCl3) 3.89 (3H, s)...". Pulled out, the isolation reads as an isolation and the
# data sits where a referee looks for it - still the source's own material, never ours.
_DATA = re.compile(r"(?:\b(?:1H|13C|19F|31P|29Si|11B)\s*NMR\b|\bHRMS\b|\bLCMS\b|\bESI?[+-]|"
                   r"\bm/z\b|\bMH\+|\bIR\s*\(|\bm\.?p\.?\s*\d|\bmelting point\b|"
                   r"\[α\]|\bAnal\.\s*Calcd)", re.I)


def _split_data(sentence: str) -> tuple[str, str | None]:
    """One sentence into (what was done, what was measured).

    A patent writes both in one sentence: "The solid was collected by filtration ... to give the
    title compound (138.7 g, 81.5%) as a purple solid; 1H NMR (CDCl3) 3.89 (3H, s)...". Splitting
    whole sentences sent the isolation to the data line with the NMR; the cut has to be inside the
    sentence, where the data starts.
    """
    m = _DATA.search(sentence)
    if not m:
        return sentence, None
    return sentence[:m.start()].rstrip(" ;,:").strip(), sentence[m.start():].strip()


def characterisation(text: str | None) -> str | None:
    """The source's own spectroscopic data for its own material, kept out of the procedure."""
    if not text:
        return None
    found = [d for d in (_split_data(x.strip())[1] for x in _SENTENCE.split(text)) if d]
    return " ".join(dict.fromkeys(found)).strip() or None


def workup(text: str | None) -> str | None:
    """The source's own isolation sentences, quoted. None when it does not describe one."""
    if not text:
        return None
    found = [h for h in (_split_data(x.strip())[0] for x in _SENTENCE.split(text))
             if h and _ISOLATION_RE.search(h) and not _NOT_WORKUP.search(h)]
    found = [h if h.endswith(".") else h + "." for h in found]
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
    # What the record itself ran at. A procedure written for 50 mg scaled straight to a gram
    # multiplies every charge about twentyfold, and a reagent used in large excess at microscale
    # becomes a volume nobody would pour. The sheet states the factor rather than hiding it.
    ran_at = (table or {}).get("limiting_recorded_mmol")
    return {
        "scale_mmol": round(factor * (table or {}).get("scale_mmol", 1.0), 3) if table else None,
        "record_scale_mmol": ran_at,
        "charges": lines,
        "temperature_c": c.get("temperature_c"),
        "time_h": c.get("time_h"),
        "solvent": c.get("solvent"),
        "catalyst": c.get("catalyst_name") or c.get("catalyst"),
        "workup": workup((step.get("procedure") or {}).get("text")),
        "characterisation": characterisation((step.get("procedure") or {}).get("text")),
        "source_id": c.get("source_id") or (step.get("procedure") or {}).get("reaction_id"),
        "expected_g": (round(target_g, 4) if target_g else None),
        "product_name": product.get("name"),
        "reported_yield": step.get("reported_yield"),
        "yield_basis": (step.get("yield_basis") or {}).get("basis"),
        "missing": missing,
    }
