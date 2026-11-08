"""Price records read from suppliers -> fill the price sheet.

Input is every file in backend/data/price_sources/*.json. Those files hold values exactly as read from supplier
product pages: list price, pack size, density, product URL. This script does **only computation** on them:

    volume pack -> grams     mass_g = qty_mL * density      (density from the same product page)
    solution -> compound g   mass_g *= content_wt_frac      (concentration also from the same page, e.g. formalin 37 wt%)
    pick representative pack the smallest pack of 1 g or more, else the largest pack
    price_per_g              pack_price / pack_size_g       (comes from the same pack)

If the same CAS appears in two files, it stops. The code does not choose which price is right.

Why the representative pack is "the smallest": nobody buys a 4 L bottle of acetic acid to make 1 g.
Conversely, a compound that only comes in mg packs uses the largest pack; computing 30 purchases of a 100 mg pack
would put the purchase cost far from reality.

**Volume packs without a density are skipped.** If there is no way to convert mL to grams, we do not estimate (absolute rule 3).

    .venv/bin/python -I scripts/prices_from_source.py [--source ...] [--dry-run]
"""
from __future__ import annotations

import argparse
import csv
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCES = ROOT / "backend/data/price_sources"
SHEET = ROOT / "backend/data/prices_to_fill.csv"

TO_GRAM = {"mg": 0.001, "g": 1.0, "kg": 1000.0}      # mass units convert directly
VOLUME = {"mL": 1.0, "L": 1000.0}                     # volumes convert only if a density is given


def pack_grams(pack: dict, density: float | None, wt_frac: float | None = None) -> float | None:
    """One pack -> grams of that compound. If it is a volume with no density, None (discarded).

    For a solution (wt_frac), multiply the solution mass by the concentration stated on the page; water and stabilizer are not counted as compound.
    """
    unit, qty = pack["unit"], float(pack["qty"])
    if unit in TO_GRAM:
        g = qty * TO_GRAM[unit]
    elif unit in VOLUME:
        if density is None:
            return None
        g = qty * VOLUME[unit] * float(density)
    else:
        return None
    return g * float(wt_frac) if wt_frac else g


def choose(packs: list[dict], density: float | None, wt_frac: float | None = None) -> dict | None:
    """Representative pack: the smallest one of 1 g or more; if none, the largest."""
    sized = []
    for p in packs:
        g = pack_grams(p, density, wt_frac)
        if g and g > 0:
            sized.append({**p, "grams": g})
    if not sized:
        return None
    big = [p for p in sized if p["grams"] >= 1.0]
    return min(big, key=lambda p: p["grams"]) if big else max(sized, key=lambda p: p["grams"])


def load_sources(paths: list[Path]) -> dict[str, dict]:
    """CAS -> product. Each product gets the site and currency of its record file. Stops if the same CAS appears twice."""
    products: dict[str, dict] = {}
    for path in paths:
        src = json.loads(path.read_text())
        for cas, prod in src["products"].items():
            if cas in products:
                raise SystemExit(f"CAS {cas} is in both {products[cas]['_file']} and {path.name}. "
                                 "Keep one — the code does not pick between two prices.")
            products[cas] = {**prod, "_site": src["site"], "_currency": src.get("currency", "USD"),
                             "_file": path.name}
    return products


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--source", type=Path, nargs="*",
                    help="price record(s); default: every *.json in backend/data/price_sources/")
    ap.add_argument("--sheet", type=Path, default=SHEET)
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args()

    paths = a.source or sorted(SOURCES.glob("*.json"))
    products = load_sources(paths)
    print(f"{len(products)} products on record in {', '.join(p.name for p in paths)}\n")

    rows = list(csv.DictReader(a.sheet.open(newline="")))
    if not rows:
        raise SystemExit(f"{a.sheet} is empty. Run scripts/make_price_sheet.py first.")
    cols = list(rows[0].keys())

    filled = skipped = 0
    for r in rows:
        cas = (r.get("cas") or "").strip()
        prod = products.get(cas)
        if not prod:
            print(f"  no price on record   {r['name'][:46]}")
            skipped += 1
            continue
        wt = prod.get("content_wt_frac")
        pick = choose(prod["packs"], prod.get("density_g_per_ml"), wt)
        if not pick:
            print(f"  volume pack with no density, skipped   {r['name'][:40]}")
            skipped += 1
            continue
        grams = round(pick["grams"], 4)
        r["price_per_g"] = f"{pick['usd'] / grams:.4f}"
        r["pack_size_g"] = f"{grams:g}"
        r["pack_price"] = f"{pick['usd']:.2f}"
        r["currency"] = prod["_currency"]
        r["supplier"] = prod.get("brand") or ""
        r["catalog_no"] = pick.get("sku") or prod["href"].rsplit("/", 1)[-1]
        r["url"] = prod["_site"] + prod["href"]
        filled += 1
        unit = f"{pick['qty']:g}{pick['unit']}"
        conv = "" if pick["unit"] in TO_GRAM else f" = {grams:g} g at {prod['density_g_per_ml']} g/mL"
        if wt:
            conv += f" x {wt:g}"
        print(f"  {r['name'][:40]:42} {unit:>8}{conv:<24} ${pick['usd']:>8.2f}  ${pick['usd']/grams:>8.3f}/g")

    print(f"\n{filled} filled, {skipped} left blank")
    if a.dry_run:
        print("--dry-run, nothing written.")
        return 0
    with a.sheet.open("w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=cols)
        w.writeheader()
        w.writerows(rows)
    print(f"wrote {a.sheet.relative_to(ROOT)}\nNext:  .venv/bin/python -I scripts/import_prices.py")
    return 0


if __name__ == "__main__":
    sys.exit(main())
