"""A compound's name, where a real source already gives one.

The screens were printing canonical SMILES wherever a compound appears — the bill of materials,
the reagent tables, the conditions. SMILES is the key everything else in this project is built on
and it is what proves a step is the same reaction as a record, but it is not what a chemist reads,
and a sheet of `Cc1ccc(N)cc1Br` is hard to check at a glance.

Two sources, both already in the project and neither a guess:

  prices.csv    the supplier's product name, which is also the name you order by
  the record    ORD writes a NAME identifier for many reagents ("p-toluenesulfonic acid
                monohydrate"), kept verbatim by evidence/corpus.Reagent

Anything these do not cover is named in the browser by Octet's offline IUPAC namer, which is
deterministic code checked by reading the name back. Nothing here asks a model for a name.
"""
from __future__ import annotations

import csv
from functools import lru_cache
from pathlib import Path

from rdkit import Chem, RDLogger

RDLogger.DisableLog("rdApp.*")

PRICES = Path(__file__).resolve().parents[1] / "data/prices.csv"


def canon(smiles: str | None) -> str | None:
    m = Chem.MolFromSmiles(smiles) if smiles else None
    return Chem.MolToSmiles(m) if m is not None else None


@lru_cache(maxsize=1)
def supplier_names() -> dict[str, str]:
    """Canonical SMILES → the name on the product page it was priced from."""
    if not PRICES.exists():
        return {}
    out: dict[str, str] = {}
    with PRICES.open(newline="") as f:
        for row in csv.DictReader(f):
            c, nm = canon(row.get("smiles")), (row.get("name") or "").strip()
            if c and nm:
                out.setdefault(c, nm)
    return out


def name_for(smiles: str | None) -> str | None:
    """A name for this structure, or None so the caller can fall back to the offline namer."""
    c = canon(smiles)
    return supplier_names().get(c) if c else None
