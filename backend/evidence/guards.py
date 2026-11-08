"""LLM output guard: enforces the absolute rules in code.

The project's differentiator is "no hallucination". The only thing the LLM may output is natural-language prose;
if it makes up SMILES, yields, prices, DOIs, patent numbers or reaction conditions, that is **a bug**.

So the explanation path must pass through enforce(). A violation raises an exception, and
llm/explain.py catches it and returns "generation failed" instead of prose. Filtered text is never
repaired and shipped: after repair you cannot tell what is fact and what is an edit.

What it catches:
  SMILES    a token RDKit parses as a molecule, with 3+ heavy atoms and SMILES special characters/digits
  number+unit  quantitative claims such as "76%", "40 °C", "8 h", "2 equiv", "5 mmol"
  DOI       10.xxxx/...
  patent number    US1234567, US20070213315A1
"""
from __future__ import annotations

import re

from rdkit import Chem, RDLogger

RDLogger.DisableLog("rdApp.*")

MIN_HEAVY_ATOMS = 3
SMILES_CHARS = re.compile(r"[\[\]()=#@\\/+]|\d")
# Words that can legitimately appear in prose pass even if they parse as molecules
ALLOW = {"i", "in", "on", "no", "nos", "c", "n", "o", "s", "p", "b", "co", "cc", "ccc", "one", "none"}

UNIT = (r"%|°\s?[CFK]|\bK\b|\bdeg\b|°|"
        r"\b(?:h|hr|hrs|hours?|min|mins|minutes?|s|sec|secs|seconds?|d|days?)\b|"
        r"\b(?:[munpk]?g|kg|[munpk]?mol|mol|M|mM|[munp]M|N|[munpk]?L|mL|ppm|Å|eq|equivs?|equivalents?|wt|vol)\b")
NUMBER_UNIT = re.compile(rf"(?<![\w.])\d+(?:[.,]\d+)?\s*(?:{UNIT})", re.IGNORECASE)
DOI = re.compile(r"\b10\.\d{4,9}/\S+", re.IGNORECASE)
PATENT = re.compile(r"\bUS[\s-]?\d{6,11}(?:[A-Z]\d?)?\b")


class GuardViolation(ValueError):
    """The LLM made up chemical facts. Do not use that output."""

    def __init__(self, violations: list[dict]):
        self.violations = violations
        detail = "; ".join(f"{v['kind']}: {v['text']!r}" for v in violations)
        super().__init__(f"the generated text states chemical facts it must not ({detail})")


def _looks_like_smiles(token: str) -> bool:
    t = token.strip(".,;:!?\"'()[]")
    if len(t) < 2 or t.lower() in ALLOW or not SMILES_CHARS.search(t):
        return False
    m = Chem.MolFromSmiles(t)
    return m is not None and m.GetNumHeavyAtoms() >= MIN_HEAVY_ATOMS


def check(text: str) -> list[dict]:
    """List of violations. Empty means pass."""
    out: list[dict] = []
    for rx, kind in ((DOI, "doi"), (PATENT, "patent"), (NUMBER_UNIT, "number_with_unit")):
        for m in rx.finditer(text or ""):
            out.append({"kind": kind, "text": m.group(0).strip()})
    for token in re.split(r"\s+", text or ""):
        if _looks_like_smiles(token):
            out.append({"kind": "smiles", "text": token.strip(".,;:!?\"'")})
    return out


def enforce(text: str) -> str:
    """Return the text unchanged if it passes, else raise GuardViolation. Never repair and ship."""
    v = check(text)
    if v:
        raise GuardViolation(v)
    return text
