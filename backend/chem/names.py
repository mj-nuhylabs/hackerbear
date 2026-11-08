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


CACHE = Path(__file__).resolve().parents[1] / "data/pubchem_titles.json"


@lru_cache(maxsize=1)
def _pubchem_cache() -> dict:
    import json
    if CACHE.exists():
        try:
            return json.loads(CACHE.read_text())
        except Exception:
            return {}
    return {}


def _save_cache(d: dict) -> None:
    import json
    try:
        CACHE.write_text(json.dumps(d, indent=0, sort_keys=True))
    except Exception:
        pass


def pubchem_name(smiles: str | None) -> str | None:
    """PubChem's own title for the structure — "Aspirin", not "2-(acetyloxy)benzoic acid".

    Cached on disk because the demo payload names a few hundred compounds and PubChem asks for no
    more than five requests a second. A miss is cached as well, so a compound PubChem does not name
    is asked for once and then left alone.
    """
    c = canon(smiles)
    if not c:
        return None
    cache = _pubchem_cache()
    if c in cache:
        return cache[c] or None
    from .resolve import pubchem_title
    title = (pubchem_title(c) or {}).get("title")
    cache[c] = title or ""
    _save_cache(cache)
    return title or None


def name_for(smiles: str | None, use_pubchem: bool = True) -> str | None:
    """A name for this structure, or None so the caller can fall back to the offline namer.

    The supplier's own product name first — that is the name you order by — then PubChem's title,
    which is the common name where one exists.
    """
    c = canon(smiles)
    if not c:
        return None
    return supplier_names().get(c) or (pubchem_name(c) if use_pubchem else None)
