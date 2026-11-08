"""가격 조회 — data/prices.csv 정적 스냅샷.

prices.csv의 모든 행은 공급사 제품 페이지에서 읽은 정가다. 읽은 값 그대로는
data/price_sources/*.json에 있고, prices.csv는 거기서 계산만 해서 만든다:

    data/price_sources/*.json → scripts/prices_from_source.py → scripts/import_prices.py --drop-examples

행마다 supplier·catalog_no·url·as_of_date가 있다 — 숫자에는 출처가 있어야 한다 (절대 규칙 2).
가격을 못 찾은 물질은 행이 없다. lookup()이 키를 안 돌려주고, 비용은 None, UI는 —다.
예시 가격(is_mock=true) 행은 없다. 플래그 처리는 남아 있지만 지금 데이터에는 쓰이지 않는다.

실시간 공급사 API는 범위 밖이다 (CLAUDE_HACKFNM.md 데이터 소스). 이건 as_of_date 시점의 스냅샷이다.

CSV 컬럼: smiles,name,price_per_g,pack_size_g,pack_price,currency,supplier,catalog_no,url,as_of_date,is_mock
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
                # 출처. 가격은 숫자고, 숫자에는 출처가 있어야 한다 (절대 규칙 2).
                # 예시 행에는 비어 있고, 실제 행에는 읽어 온 제품 페이지 주소가 들어 있다
                "catalog_no": row.get("catalog_no") or None,
                "url": row.get("url") or None,
                "as_of_date": row.get("as_of_date") or None,
                "is_mock": str(row.get("is_mock", "")).strip().lower() in ("1", "true", "yes"),
            }
    return out


def lookup(smiles_list: list[str]) -> dict[str, dict]:
    """찾은 것만 돌려준다. 없는 SMILES는 키가 없고, 비용은 None이 된다."""
    t = table()
    return {s: t[s] for s in smiles_list if s in t}
