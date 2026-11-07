"""가격 조회 — data/prices.csv 정적 스냅샷.

**이 파일의 가격은 실제 공급사 가격이 아니다.** 실시간 공급사 API는 범위 밖이라
(CLAUDE_HACKFNM.md 데이터 소스), prices.csv의 모든 행에 `is_mock` 컬럼이 있고
데모 스냅샷은 전부 true다. 그 플래그는 BOM 줄까지 그대로 전달돼 UI가 배지를 붙인다.

실제 가격을 넣을 때는 같은 스키마로 행을 바꾸고 is_mock=false, as_of_date를 갱신하면 된다.
계산(cost/stoich.py)은 진짜다 — 가정값은 가격뿐이다.

CSV 컬럼: smiles,name,price_per_g,pack_size_g,pack_price,currency,supplier,as_of_date,is_mock
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
    """정규 SMILES → 가격 행. 파일이 없으면 빈 dict (모든 비용이 None이 된다)."""
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
                "as_of_date": row.get("as_of_date") or None,
                "is_mock": str(row.get("is_mock", "")).strip().lower() in ("1", "true", "yes"),
            }
    return out


def lookup(smiles_list: list[str]) -> dict[str, dict]:
    """찾은 것만 돌려준다. 없는 SMILES는 키가 없고, 비용은 None이 된다."""
    t = table()
    return {s: t[s] for s in smiles_list if s in t}
