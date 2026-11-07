"""공급사에서 읽어 둔 가격 기록 → 가격 시트 채우기.

입력은 backend/data/price_sources/*.json이다. 그 파일은 공급사 제품 페이지에서 읽은
값 그대로다 — 정가, 팩 크기, 밀도, 제품 URL. 이 스크립트는 거기서 **계산만** 한다:

    부피 팩 → 그램      mass_g = qty_mL * density      (밀도는 같은 제품 페이지의 값)
    대표 팩 선택         1 g 이상인 가장 작은 팩, 없으면 가장 큰 팩
    price_per_g         pack_price / pack_size_g       (같은 팩에서 나온다)

대표 팩을 "가장 작은 것"으로 두는 이유: 1 g을 만드는 데 4 L짜리 아세트산을 사지 않는다.
반대로 mg 팩만 있는 화합물은 가장 큰 팩을 쓴다 — 100 mg짜리를 30번 사는 계산이 되면
구매액이 현실과 멀어진다.

**밀도 없는 부피 팩은 건너뛴다.** mL을 그램으로 바꿀 방법이 없으면 추정하지 않는다 (절대 규칙 3).

    .venv/bin/python -I scripts/prices_from_source.py [--source ...] [--dry-run]
"""
from __future__ import annotations

import argparse
import csv
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "backend/data/price_sources/sigmaaldrich_2026-11-07.json"
SHEET = ROOT / "backend/data/prices_to_fill.csv"

TO_GRAM = {"mg": 0.001, "g": 1.0, "kg": 1000.0}      # 질량 단위는 그대로 환산된다
VOLUME = {"mL": 1.0, "L": 1000.0}                     # 부피는 밀도가 있어야 환산된다


def pack_grams(pack: dict, density: float | None) -> float | None:
    """팩 하나 → 그램. 부피인데 밀도가 없으면 None (버린다)."""
    unit, qty = pack["unit"], float(pack["qty"])
    if unit in TO_GRAM:
        return qty * TO_GRAM[unit]
    if unit in VOLUME:
        if density is None:
            return None
        return qty * VOLUME[unit] * float(density)
    return None


def choose(packs: list[dict], density: float | None) -> dict | None:
    """대표 팩. 1 g 이상인 것 중 가장 작은 것, 그런 게 없으면 가장 큰 것."""
    sized = []
    for p in packs:
        g = pack_grams(p, density)
        if g and g > 0:
            sized.append({**p, "grams": g})
    if not sized:
        return None
    big = [p for p in sized if p["grams"] >= 1.0]
    return min(big, key=lambda p: p["grams"]) if big else max(sized, key=lambda p: p["grams"])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--source", type=Path, default=SOURCE)
    ap.add_argument("--sheet", type=Path, default=SHEET)
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args()

    src = json.loads(a.source.read_text())
    site, products = src["site"], src["products"]

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
        pick = choose(prod["packs"], prod.get("density_g_per_ml"))
        if not pick:
            print(f"  volume pack with no density, skipped   {r['name'][:40]}")
            skipped += 1
            continue
        grams = round(pick["grams"], 4)
        r["price_per_g"] = f"{pick['usd'] / grams:.4f}"
        r["pack_size_g"] = f"{grams:g}"
        r["pack_price"] = f"{pick['usd']:.2f}"
        r["currency"] = src.get("currency", "USD")
        r["supplier"] = prod.get("brand") or ""
        r["catalog_no"] = pick.get("sku") or prod["href"].rsplit("/", 1)[-1]
        r["url"] = site + prod["href"]
        filled += 1
        unit = f"{pick['qty']:g}{pick['unit']}"
        conv = "" if pick["unit"] in TO_GRAM else f" = {grams:g} g at {prod['density_g_per_ml']} g/mL"
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
