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


def rank_key(text: str | None):
    """Sort key for choosing which recorded text to show: real procedures first, then the most
    detailed. Use with reverse=True."""
    s = score(text)
    return (s["experimental"], s["quantities"] + s["operations"])
