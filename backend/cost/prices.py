"""Price lookup -- static snapshot in data/prices.csv.

Every row of prices.csv is a list price read from a supplier product page. The values as read are in
data/price_sources/*.json, and prices.csv is built from them by computation only:

    data/price_sources/*.json → scripts/prices_from_source.py → scripts/import_prices.py --drop-examples

Every row has supplier, catalog_no, url and as_of_date -- numbers must have a source (absolute rule 2).
Substances whose price was not found have no row. lookup() returns no key, so cost is None and the UI shows --.
There are no example-price (is_mock=true) rows. The flag handling remains but is unused by the current data.

Live supplier APIs are out of scope (CLAUDE_HACKFNM.md, data sources). This is a snapshot as of as_of_date.

CSV columns: smiles,name,price_per_g,pack_size_g,pack_price,currency,supplier,catalog_no,url,as_of_date,is_mock
"""
from __future__ import annotations

import csv
from functools import lru_cache
from pathlib import Path

PRICES_CSV = Path(__file__).resolve().parents[1] / "data/prices.csv"


def _num(v: str | None) -> float | None:
    if v is None or v == "":
        return None
    try:
        return float(v)
    except ValueError:
        return None


@lru_cache(maxsize=1)
def table() -> dict[str, dict]:
    """Canonical SMILES -> price row. If the file is missing, an empty dict (all costs become None)."""
    if not PRICES_CSV.exists():
        return {}
    from rdkit import Chem, RDLogger
    RDLogger.DisableLog("rdApp.*")
    out: dict[str, dict] = {}
    with PRICES_CSV.open(newline="") as f:
        for row in csv.DictReader(f):
            m = Chem.MolFromSmiles(row.get("smiles", ""))
            if m is None:
                continue
            out[Chem.MolToSmiles(m)] = {
                "name": row.get("name") or None,
                "price_per_g": _num(row.get("price_per_g")),
                "pack_size_g": _num(row.get("pack_size_g")),
                "pack_price": _num(row.get("pack_price")),
                "currency": row.get("currency") or None,
                "supplier": row.get("supplier") or None,
                # Source. A price is a number, and numbers must have a source (absolute rule 2).
                # Empty for example rows; real rows hold the URL of the product page they were read from
                "catalog_no": row.get("catalog_no") or None,
                "url": row.get("url") or None,
                "as_of_date": row.get("as_of_date") or None,
                "is_mock": str(row.get("is_mock", "")).strip().lower() in ("1", "true", "yes"),
            }
    return out


def lookup(smiles_list: list[str]) -> dict[str, dict]:
    """Return only what was found. SMILES not found have no key, and their cost becomes None."""
    t = table()
    return {s: t[s] for s in smiles_list if s in t}
