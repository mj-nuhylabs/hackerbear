"""채운 가격 시트를 data/prices.csv에 넣는다.

**출처 없는 가격은 거부한다.** 절대 규칙 2 — UI에 뜨는 모든 숫자는 출처가 있어야 한다.
가격만 적혀 있고 supplier와 url이 없으면 그 줄은 들어가지 않고, 왜 거부됐는지 출력한다.
이 검사는 사람이 성실한지 믿지 않기 위해 있다. 새벽 두 시에는 아무도 성실하지 않다.

들어간 줄은 is_mock=false, as_of_date=오늘이 된다. 기존 예시 줄은 건드리지 않는다 —
같은 SMILES면 교체되고, 아니면 예시인 채로 남아 UI에 'example' 배지가 그대로 붙는다.

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

# prices.csv의 컬럼. catalog_no·url은 출처를 적는 칸이다 (cost/prices.py가 읽어 UI로 보낸다)
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
    """한 줄 → (가격 행, 거부 사유). 둘 중 하나는 None이다."""
    ppg = num(row.get("price_per_g"))
    pack_g = num(row.get("pack_size_g"))
    pack_price = num(row.get("pack_price"))
    supplier = (row.get("supplier") or "").strip()
    url = (row.get("url") or "").strip()

    if ppg is None and pack_price is None:
        return None, "empty"                      # 안 채운 줄. 조용히 넘어간다

    # 여기부터는 가격이 적힌 줄이다. 출처가 없으면 들어갈 수 없다
    if not supplier:
        return None, "a price with no supplier"
    if not url:
        return None, "a price with no link to the page it was read from"
    if not url.startswith(("http://", "https://")):
        return None, f"the url is not a link: {url!r}"

    # 둘 중 하나만 적혀 있으면 나머지를 계산한다 — 사람이 둘 다 적을 필요는 없다
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

    # 기존 파일을 읽어 둔다. 같은 SMILES는 교체, 나머지는 그대로 (예시 줄은 예시로 남는다)
    existing: dict[str, dict] = {}
    if a.prices.exists():
        for row in csv.DictReader(a.prices.open(newline="")):
            smi = canon(row.get("smiles", "")) or row.get("smiles", "")
            existing[smi] = {c: row.get(c, "") for c in COLUMNS}

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
    if not new:
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
