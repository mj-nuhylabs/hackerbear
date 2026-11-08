"""Is this recorded text an experimental procedure, or just prose about the reaction?

ORD carries whatever USPTO mining put in notes.procedure_details, and that is not always a
procedure. The aspirin step offered this as its procedure:

    "Commercially, aspirin is synthesized using a two-step process. Phenol, generally extracted
     from coal tar, is treated with sodium base to generate sodium phenoxide..."

That is the background section of a patent. A chemist cannot run it, and showing it under the
heading "Procedure" is worse than showing nothing, because it looks like an answer.

The test is deterministic text matching, not a model, and it only ever decides which recorded text
to show first and how to label it. It never rewrites one: the text that is shown is the record's,
verbatim, as the absolute rules require.

A procedure describes one run someone did, so it states amounts and it acts on them:

  quantities   a number next to a unit — 1.0 g, 75 mL, 5 mmol, 0.5 equiv, 110 °C, 4 h
  operations   past-tense bench verbs — was added, stirred, heated, cooled, filtered, extracted,
               concentrated, dried, recrystallised, poured, quenched, washed
  not general  "commercially", "generally", "typically", "may be used", "can be prepared" are how
               a patent's background talks about chemistry in the abstract

MIN_QUANTITIES and MIN_OPERATIONS are deliberately low: two amounts and one operation is a terse
but real procedure, and the point is to catch prose, not to grade writing.
"""
from __future__ import annotations

import re

MIN_QUANTITIES = 2
MIN_OPERATIONS = 1

# a number immediately followed by a unit, which is how an amount is written at the bench
_QUANTITY = re.compile(
    r"\d+(?:\.\d+)?\s*(?:mg|g|kg|µL|ul|mL|ml|L|mmol|mol|equiv|eq\b|wt%|%|°\s*C|º\s*C|K\b|h\b|hr|hours?|min(?:utes?)?|days?)",
    re.I)
_OPERATION = re.compile(
    r"\b(?:was|were|is|are)\s+(?:then\s+)?(?:added|stirred|heated|cooled|filtered|extracted|"
    r"concentrated|dried|washed|poured|quenched|dissolved|treated|evaporated|refluxed|"
    r"recrystalli[sz]ed|chromatographed|degassed|charged|collected|combined|diluted|separated)"
    r"|\b(?:add|stir|heat|cool|filter|extract|concentrate|dry|wash|pour|quench|dissolve|reflux)ed\b",
    re.I)
# phrases a patent uses when describing chemistry in general rather than one run
_GENERAL = re.compile(
    r"\b(?:commercially|generally|typically|usually|in general|may be (?:used|prepared|employed)|"
    r"can be (?:used|prepared|employed)|is (?:synthesi[sz]ed|prepared) using|are known|for example,\s*the)\b",
    re.I)
# analytical / assay methods: the record is about measuring the compound, not making it
_ASSAY = re.compile(
    r"\b(?:internal standard|calibration curve|HPLC|LC[-/]MS|GC[-/]MS|chromatogra(?:m|phic) (?:conditions|analysis)|"
    r"sample preparation|plasma|serum|aliquot of the sample|limit of (?:detection|quantification))\b",
    re.I)


# A record that formulates a compound is not a record of making it. US05154930 dissolves aspirin
# in egg phosphatides to prepare a dosage form; the mining read its name, "salicylic acid acetate",
# as salicylic acid plus acetate and emitted those as the reactants, so the structured record reads
# exactly like an acetylation. The text is the only place the difference survives.
_FORMULATION = re.compile(
    r"\b(?:dosage form|dose form|pharmaceutical composition|formulation(?:s)? (?:of|was|were)|"
    r"excipient|tablet|capsule|lozenge|suppositor|ointment|topical or oral|for oral use|"
    r"liposome|liposomal|phosphatides|emulsion for|suspension for|unit dose|placebo)\b", re.I)
# ... as against the verbs that only appear when a bond is being made or broken
_SYNTHETIC = re.compile(
    r"\b(?:was|were)\s+(?:then\s+)?(?:refluxed|heated|quenched|acylated|alkylated|coupled|"
    r"hydrogenated|oxidi[sz]ed|reduced|brominated|chlorinated|nitrated|hydroly[sz]ed)"
    r"|\byield(?:ed|ing)?\b|\bcrude product\b|\bthe title compound\b|\bchromatograph", re.I)


def is_formulation(text: str | None) -> bool:
    """Does this record read as formulating a compound rather than making it?"""
    t = text or ""
    f = len(_FORMULATION.findall(t))
    return bool(f) and f > len(_SYNTHETIC.findall(t))


def score(text: str | None) -> dict:
    """What the text looks like. Returns counts plus `experimental`, the verdict used for ordering."""
    t = (text or "").strip()
    if not t:
        return {"experimental": False, "quantities": 0, "operations": 0, "general": 0, "assay": 0,
                "reason": "no text"}
    q = len(_QUANTITY.findall(t))
    o = len(_OPERATION.findall(t))
    g = len(_GENERAL.findall(t))
    a = len(_ASSAY.findall(t))
    if a and o <= a:
        reason, ok = "reads as an analytical method, not a preparation", False
    elif q < MIN_QUANTITIES:
        reason, ok = f"states {q} amount{'' if q == 1 else 's'}; a procedure states at least {MIN_QUANTITIES}", False
    elif o < MIN_OPERATIONS:
        reason, ok = "describes no bench operation", False
    elif g and o < g:
        reason, ok = "talks about the chemistry in general rather than one run", False
    else:
        reason, ok = "", True
    return {"experimental": ok, "quantities": q, "operations": o, "general": g, "assay": a,
            "reason": reason}


def is_experimental(text: str | None) -> bool:
    return score(text)["experimental"]


# "salicylic acid (10 mg, 0.72 mmol)" — a mass and a molar amount for the same reagent, which the
# text states together and which the molar mass ties to each other.
_MASS_MOL = re.compile(
    r"(\d+(?:\.\d+)?)\s*(mg|g|kg)\s*,\s*(\d+(?:\.\d+)?)\s*(mmol|mol|mmoles|moles)\b", re.I)
_TO_G = {"mg": 1e-3, "g": 1.0, "kg": 1e3}
_TO_MOL = {"mmol": 1e-3, "mmoles": 1e-3, "mol": 1.0, "moles": 1.0}
# How far the two may disagree before the record is calling itself wrong. Rounding and purity move
# these by a few percent; a factor of two is not rounding, and the cases seen are factors of ten.
AMOUNT_TOLERANCE = 2.0


def amount_conflicts(text: str | None, mw_of) -> list[dict]:
    """Places where the text's own mass and molar amount cannot both be right.

    An aspirin record says "salicylic acid (10 mg, 0.72 mmol)". 10 mg of salicylic acid is
    0.072 mmol; 0.72 mmol is 99 mg. ORD kept only the mass, so nothing downstream could notice,
    and the step was scaled from a number the record itself contradicts. The same example says
    "acetic anhydride (10 ul, 1.09 mmoles)", also ten-fold apart.

    `mw_of` maps a reagent name as the text writes it to a molar mass, or returns None. Only pairs
    whose compound is identified are checked; the rest cannot be checked and are not guessed at.
    """
    out = []
    t = text or ""
    for m in _MASS_MOL.finditer(t):
        grams = float(m.group(1)) * _TO_G[m.group(2).lower()]
        moles = float(m.group(3)) * _TO_MOL[m.group(4).lower()]
        # The reagent is named just before the bracket. How many words it takes is not fixed
        # ("salicylic acid", "acetic anhydride", "pyridine"), so try the longest name that is
        # recognised and give up when none is.
        before = re.sub(r"[\s(]+$", "", t[max(0, m.start() - 80):m.start()])
        words = re.findall(r"[A-Za-z][A-Za-z0-9'\-,’]*", before)
        name, mw = None, None
        for n in range(min(4, len(words)), 0, -1):
            cand = " ".join(words[-n:]).strip(" ,")
            got = mw_of(cand)
            if got:
                name, mw = cand, got
                break
        if not mw or moles <= 0:
            continue
        ratio = (grams / mw) / moles
        if ratio > AMOUNT_TOLERANCE or ratio < 1 / AMOUNT_TOLERANCE:
            out.append({"reagent": name, "stated_g": grams, "stated_mol": moles, "mw": mw,
                        "mol_from_mass": grams / mw, "ratio": round(ratio, 3)})
    return out


def rank_key(text: str | None):
    """Sort key for choosing which recorded text to show: real procedures first, then the most
    detailed. Use with reverse=True."""
    s = score(text)
    return (s["experimental"], s["quantities"] + s["operations"])
