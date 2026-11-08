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
    """이 반응의 조건. 항목마다 그 값을 적어 둔 첫 레코드에서 가져오고, 출처도 항목별로 단다.

    예전에는 온도나 시간 중 **하나라도** 있는 첫 레코드를 통째로 돌려줬다. 그래서 온도만 적힌
    레코드가 앞에 오면 뒤에 시간이 적힌 레코드가 있어도 시간이 —로 떴다. 아스피린 아세틸화가
    그 경우다: 90–120 °C짜리 레코드가 6건, 시간(5분)이 적힌 레코드가 1건인데 시간이 안 나왔다.

    항목을 따로 채우면 한 화면의 값들이 서로 다른 실험에서 올 수 있다 (같은 반응의 다른 기록이다).
    그래서 항목마다 source_id를 달고 mixed=True로 표시한다 — UI가 값 옆에 출처를 보여줘야 한다.
    한 실험의 조건인 척하면 안 된다.
    """
    fields = {"temperature_c": "temperature_c", "time_h": "time_h",
              "solvent": "solvents", "catalyst": "catalysts"}
    out: dict = {"catalyst_loading": None}
    sources: dict[str, str] = {}
    for key, col in fields.items():
        out[key] = None
        for r in records:
            v = r.get(col) if col in r else r.get(key)
            if v is not None and v != "":
                out[key] = v
                if r.get("reaction_id"):
                    sources[key] = r["reaction_id"]
                break
    if all(out[k] is None for k in fields):
        return None
    ids = set(sources.values())
    out["sources"] = sources
    out["source_id"] = next(iter(ids)) if len(ids) == 1 else None
    # 값들이 한 레코드에서 온 게 아니다 — UI가 반드시 구분해 보여줘야 한다
    out["mixed"] = len(ids) > 1
    return out


def reported_yield(records: list[dict]) -> float | None:
    """문헌 수율. 0 < y <= 100 범위 밖은 레코드 오류로 보고 버린다 (ORD에 37,578건 있다)."""
    for r in records:
        y = r.get("yield_pct")
        if y is not None and 0 < y <= 100:
            return float(y)
    return None
