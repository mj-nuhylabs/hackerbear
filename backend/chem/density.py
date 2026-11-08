"""Density, so a liquid can be measured out instead of weighed.

A quantity table that says "3.34 g of acetic anhydride" is not how anyone works: acetic anhydride
is a liquid and you pipette 3.09 mL of it. Mass is right for a solid and useless for a liquid.

The densities are not looked up from memory or assumed. They are the ones already read off the
supplier product pages when the prices were taken (backend/data/price_sources/*.json records
density_g_per_ml beside the packs), joined to structures through the CAS numbers in
prices_to_fill.csv. A compound with no density on its page gets none here, and its row keeps
showing mass only — the same rule as everywhere else: no value, no guess.
"""
from __future__ import annotations

import csv
import json
from functools import lru_cache
from pathlib import Path

from rdkit import Chem, RDLogger

RDLogger.DisableLog("rdApp.*")

DATA = Path(__file__).resolve().parents[1] / "data"
SOURCES = DATA / "price_sources"
SHEET = DATA / "prices_to_fill.csv"


def _canon(smiles: str | None) -> str | None:
    m = Chem.MolFromSmiles(smiles) if smiles else None
    return Chem.MolToSmiles(m) if m is not None else None


@lru_cache(maxsize=1)
def table() -> dict[str, dict]:
    """Canonical SMILES → {g_per_ml, name, href}. Empty when the price records are not present."""
    by_cas: dict[str, dict] = {}
    for path in sorted(SOURCES.glob("*.json")):
        try:
            src = json.loads(path.read_text())
        except Exception:
            continue
        for cas, prod in (src.get("products") or {}).items():
            d = prod.get("density_g_per_ml")
            if d:
                by_cas.setdefault(str(cas).strip(), {
                    "g_per_ml": float(d), "name": prod.get("name"),
                    "href": (src.get("site", "") + (prod.get("href") or "")) or None})
    if not by_cas or not SHEET.exists():
        return {}
    out: dict[str, dict] = {}
    with SHEET.open(newline="") as f:
        for row in csv.DictReader(f):
            cas, c = (row.get("cas") or "").strip(), _canon(row.get("smiles"))
            if c and cas in by_cas:
                out.setdefault(c, by_cas[cas])
    return out


def of(smiles: str | None) -> dict | None:
    c = _canon(smiles)
    return table().get(c) if c else None


def volume_ml(smiles: str | None, mass_g: float | None) -> float | None:
    """Millilitres for a mass, when the density is on record. None otherwise."""
    d = of(smiles)
    if d is None or mass_g is None:
        return None
    return mass_g / d["g_per_ml"]
