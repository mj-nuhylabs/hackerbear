"""Import the filled-in price sheet into data/prices.csv.

**Prices without a source are rejected.** Absolute rule 2: every number shown in the UI must have a source.
A row with a price but no supplier and url is not imported, and the reason for rejection is printed.
This check exists so we do not have to trust that people are diligent. At 2 a.m. nobody is.

Imported rows get is_mock=false and as_of_date=today. Existing example rows are left alone:
a row with the same SMILES is replaced; otherwise it stays an example and keeps its 'example' badge in the UI.

    .venv/bin/python -I scripts/import_prices.py [--sheet ...] [--dry-run]
"""
from __future__ import annotations

import argparse
import csv
import datetime as dt
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SHEET = ROOT / "backend/data/prices_to_fill.csv"
PRICES = ROOT / "backend/data/prices.csv"

# Columns of prices.csv. catalog_no and url are where the source goes (cost/prices.py reads them and sends them to the UI)
COLUMNS = ["smiles", "name", "price_per_g", "pack_size_g", "pack_price",
           "currency", "supplier", "catalog_no", "url", "as_of_date", "is_mock"]


def num(v: str | None) -> float | None:
    if v is None:
        return None
    v = v.strip().replace(",", "").lstrip("$")
    if not v:
        return None
    try:
        return float(v)
    except ValueError:
        return None


def canon(smiles: str) -> str | None:
    from rdkit import Chem, RDLogger
    RDLogger.DisableLog("rdApp.*")
    m = Chem.MolFromSmiles(smiles)
    return Chem.MolToSmiles(m) if m else None


def check(row: dict) -> tuple[dict | None, str | None]:
    """One row -> (price row, rejection reason). Exactly one of the two is None."""
    ppg = num(row.get("price_per_g"))
    pack_g = num(row.get("pack_size_g"))
    pack_price = num(row.get("pack_price"))
    supplier = (row.get("supplier") or "").strip()
    url = (row.get("url") or "").strip()

    if ppg is None and pack_price is None:
        return None, "empty"                      # row not filled in; skip silently

    # From here on the row has a price. Without a source it cannot be imported
    if not supplier:
        return None, "a price with no supplier"
    if not url:
        return None, "a price with no link to the page it was read from"
    if not url.startswith(("http://", "https://")):
        return None, f"the url is not a link: {url!r}"

    # If only one of the two is given, compute the other; people need not enter both
    if ppg is None and pack_g and pack_price is not None:
        ppg = pack_price / pack_g
    if pack_price is None and pack_g and ppg is not None:
        pack_price = ppg * pack_g

    if ppg is not None and ppg <= 0:
        return None, f"price_per_g is {ppg}, which cannot be right"
    if pack_g is not None and pack_g <= 0:
        return None, f"pack_size_g is {pack_g}, which cannot be right"
    if pack_g is None:
        return None, "a price with no pack size (the purchase total needs it)"

    smi = canon(row.get("smiles", ""))
    if not smi:
        return None, f"RDKit cannot read the SMILES: {row.get('smiles')!r}"

    return {
        "smiles": smi,
        "name": (row.get("name") or "").strip(),
        "price_per_g": round(ppg, 4),
        "pack_size_g": pack_g,
        "pack_price": round(pack_price, 2) if pack_price is not None else "",
        "currency": (row.get("currency") or "USD").strip(),
        "supplier": supplier,
        "catalog_no": (row.get("catalog_no") or "").strip(),
        "url": url,
        "as_of_date": dt.date.today().isoformat(),
        "is_mock": "false",
    }, None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--sheet", type=Path, default=SHEET)
    ap.add_argument("--prices", type=Path, default=PRICES)
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--drop-examples", action="store_true",
                    help="drop every example (is_mock) row instead of keeping it — a material with no real "
                         "price then has no row at all and its cost shows as —")
    a = ap.parse_args()

    if not a.sheet.exists():
        raise SystemExit(f"No sheet at {a.sheet}. Run scripts/make_price_sheet.py first.")

    new: dict[str, dict] = {}
    rejected: list[tuple[str, str]] = []
    blank = 0
    for row in csv.DictReader(a.sheet.open(newline="")):
        rec, why = check(row)
        if rec:
            new[rec["smiles"]] = rec
        elif why == "empty":
            blank += 1
        else:
            rejected.append((row.get("name") or row.get("smiles", ""), why))

    # Read the existing file first. Same SMILES is replaced; the rest stays as is (example rows stay examples)
    existing: dict[str, dict] = {}
    if a.prices.exists():
        for row in csv.DictReader(a.prices.open(newline="")):
            smi = canon(row.get("smiles", "")) or row.get("smiles", "")
            existing[smi] = {c: row.get(c, "") for c in COLUMNS}

    dropped = 0
    if a.drop_examples:
        examples = [s for s, r in existing.items()
                    if str(r.get("is_mock", "")).strip().lower() in ("true", "1", "yes")]
        for s in examples:
            del existing[s]
        dropped = len(examples)
        print(f"dropped:  {dropped} example rows (no real price on record; they will show as —)")

    replaced = sum(1 for s in new if s in existing)
    merged = {**existing, **new}

    print(f"sheet:    {len(new)} priced, {blank} left blank, {len(rejected)} rejected")
    for name, why in rejected:
        print(f"  rejected  {name[:40]:40} — {why}")
    print(f"prices:   {len(existing)} rows now → {len(merged)} "
          f"({replaced} replaced, {len(new) - replaced} added)")
    real = sum(1 for r in merged.values() if str(r.get("is_mock", "")).lower() in ("false", "0", "no", ""))
    print(f"          {real} real, {len(merged) - real} still example values")

    if a.dry_run:
        print("\n--dry-run, nothing written.")
        return 0
    if not new and not dropped:
        print("\nNothing to import. Fill in price_per_g / pack_size_g / pack_price, supplier and url.")
        return 0

    if a.prices.exists():
        backup = a.prices.with_suffix(".csv.bak")
        shutil.copy2(a.prices, backup)
        print(f"\nbackup:   {backup.relative_to(ROOT)}")
    with a.prices.open("w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=COLUMNS)
        w.writeheader()
        for smi in sorted(merged, key=lambda s: (merged[s].get("is_mock", "") != "false", s)):
            w.writerow({c: merged[smi].get(c, "") for c in COLUMNS})
    print(f"wrote:    {a.prices.relative_to(ROOT)}")
    print("\nRestart the backend (or it reloads on its own) and re-run /cost to see them.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
