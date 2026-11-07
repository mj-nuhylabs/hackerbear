"""스텝 → 원본 레코드 역매핑.

AiZynthFinder 템플릿 테이블에는 출처가 없다(컬럼이 retro_template, template_hash,
classification, library_occurence 넷뿐). 그래서 특허번호를 거기서 얻을 수는 없고,
ORD 레코드 쪽에서 같은 반응을 찾아 붙인다. scripts/attach_procedures.py가 미리 긁어둔
data/ord_hits.json(생성물 SMILES → 레코드 리스트)을 읽는다.

매칭 규칙: 생성물이 같고, 스텝의 반응물이 레코드 반응물의 **부분집합**일 것.
집합 상등을 쓰면 0건이 나온다 — ORD는 반응 왼쪽에 염·짝이온·시약까지 적기 때문이다.
"""
from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path

from rdkit import Chem, RDLogger

RDLogger.DisableLog("rdApp.*")

HITS = Path(__file__).resolve().parents[1] / "data/ord_hits.json"


def canon(smiles: str | None) -> str | None:
    if not smiles:
        return None
    m = Chem.MolFromSmiles(smiles)
    if m is None:
        return None
    for a in m.GetAtoms():
        a.SetAtomMapNum(0)
    return Chem.MolToSmiles(m)


@lru_cache(maxsize=1)
def _records() -> dict[str, list[dict]]:
    """생성물 정규 SMILES → ORD 레코드 리스트. 파일이 없으면 빈 dict (기능만 꺼진다)."""
    if not HITS.exists():
        return {}
    raw = json.loads(HITS.read_text())
    out: dict[str, list[dict]] = {}
    for prod, recs in (raw.get("records") or {}).items():
        c = canon(prod)
        if c:
            out.setdefault(c, []).extend(recs)
    return out


def _completeness(r: dict) -> tuple:
    """조건·수율이 있는 레코드를 앞으로. 값이 많은 쪽이 UI에서 쓸모 있다."""
    return (r.get("yield_pct") is not None, r.get("temperature_c") is not None,
            r.get("time_h") is not None, bool(r.get("text")))


def match(reactants: list[str], product: str) -> list[dict]:
    """이 스텝과 같은 반응의 ORD 레코드. 없으면 빈 리스트 — 지어내지 않는다."""
    p = canon(product)
    if not p:
        return []
    want = {c for c in (canon(r) for r in reactants) if c}
    if not want:
        return []
    hits = []
    for rec in _records().get(p, []):
        have = {c for c in (canon(r) for r in (rec.get("reactants") or [])) if c}
        if want <= have:
            hits.append(rec)
    return sorted(hits, key=_completeness, reverse=True)


def procedure_from(records: list[dict], reactants: list[str]) -> dict | None:
    """절차 패널에 띄울 레코드 하나 — 가장 완전한 것, 원문 그대로. 없으면 None.

    match()를 통과한 레코드만 들어오므로 짝은 둘뿐이다: 반응물 집합이 같으면 exact, 레코드가
    염·시약을 더 적었으면 covered.
    """
    if not records:
        return None
    r = records[0]
    want = {c for c in (canon(x) for x in reactants) if c}
    have = {c for c in (canon(x) for x in (r.get("reactants") or [])) if c}
    return {**r, "match": "exact" if have == want else "covered"}


def evidence_from(records: list[dict], precedent_count: int, tier: str) -> dict:
    """Evidence 블록. source_ids·url은 레코드에 있는 것만."""
    return {
        "tier": tier,
        "source_ids": [r["reaction_id"] for r in records[:5] if r.get("reaction_id")],
        "precedent_count": precedent_count,
        "url": next((r["url"] for r in records if r.get("url")), None),
    }


def conditions_from(records: list[dict]) -> dict | None:
    """가장 완전한 레코드의 조건. 없는 항목은 None이고, 전부 비면 None을 돌려준다."""
    for r in records:
        c = {
            "solvent": None,            # ORD는 용매를 역할로만 적는다 — 여기서 단정하지 않는다
            "temperature_c": r.get("temperature_c"),
            "time_h": r.get("time_h"),
            "catalyst": None,
            "catalyst_loading": None,
            "source_id": r.get("reaction_id"),
        }
        if c["temperature_c"] is not None or c["time_h"] is not None:
            return c
    return None


def reported_yield(records: list[dict]) -> float | None:
    """문헌 수율. 0 < y <= 100 범위 밖은 레코드 오류로 보고 버린다 (ORD에 37,578건 있다)."""
    for r in records:
        y = r.get("yield_pct")
        if y is not None and 0 < y <= 100:
            return float(y)
    return None
