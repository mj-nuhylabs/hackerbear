"""What counts as buyable — ZINC, plus the supplier rows and common reagents ZINC leaves out.

ZINC (data/aizynth/zinc_stock.hdf5, 17.4 M InChI keys) is a virtual-screening library of
drug-like compounds. It has no ethanol, MeI, CS2, DCM, NaH or K2CO3, so on its own the route
search "makes" them (ethanol from acetic acid at 10 %). Two lists fill the gap:

  priced      a row in data/prices.csv — a supplier product page with a price
  commodity   data/commodity_stock.csv — a reactant in >= 1,000 ORD records from >= 100
              patents or papers (scripts/build_commodity_stock.py). Commonly bought, not priced

Label order is the same everywhere a leaf is labelled: priced, then commodity, then zinc. None of
these is a price: a leaf's cost comes only from prices.csv, and is — when there is no row.
"""
from __future__ import annotations

from functools import lru_cache
from pathlib import Path

import pandas as pd
from rdkit import Chem, RDLogger

RDLogger.DisableLog("rdApp.*")

DATA = Path(__file__).resolve().parents[1] / "data"
COMMODITY = DATA / "commodity_stock.csv"
PRICES = DATA / "prices.csv"


def inchikey(smiles: str) -> str | None:
    m = Chem.MolFromSmiles(smiles) if smiles else None
    return Chem.MolToInchiKey(m) or None if m is not None else None


@lru_cache(maxsize=1)
def commodity() -> dict[str, dict]:
    """InChI key → {smiles, ord_records, ord_sources}. Empty if the file was not built."""
    if not COMMODITY.exists():
        return {}
    df = pd.read_csv(COMMODITY)
    return {r.inchi_key: {"smiles": r.smiles, "ord_records": int(r.ord_records),
                          "ord_sources": int(r.ord_sources)} for r in df.itertuples()}


@lru_cache(maxsize=1)
def priced() -> frozenset[str]:
    if not PRICES.exists():
        return frozenset()
    keys = (inchikey(str(s)) for s in pd.read_csv(PRICES).get("smiles", pd.Series(dtype=str)).dropna())
    return frozenset(k for k in keys if k)


def label(smiles: str, in_stock: bool | None) -> dict:
    """Leaf fields for the UI: stock_status ('priced' / 'commodity' / 'zinc' / None) and, for a
    common reagent, how many ORD records use it. in_stock is what the search said."""
    k = inchikey(smiles)
    if k in priced():
        return {"stock_status": "priced"}
    c = commodity().get(k)
    if c is not None:
        return {"stock_status": "commodity", "ord_records": c["ord_records"], "ord_sources": c["ord_sources"]}
    return {"stock_status": "zinc" if in_stock else None}


def extra_keys() -> frozenset[str]:
    return frozenset(commodity()) | priced()


def use_with_zinc(finder) -> None:
    """Add the priced + commodity lists to an AiZynthFinder next to its ZINC stock, select both."""
    from aizynthfinder.context.stock.queries import StockQueryMixin

    keys = extra_keys()

    class _Extra(StockQueryMixin):
        def __len__(self):
            return len(keys)

        def __contains__(self, mol):
            return mol.inchi_key in keys

    finder.stock.load(_Extra(), "extra")
    finder.stock.select(["zinc", "extra"])
