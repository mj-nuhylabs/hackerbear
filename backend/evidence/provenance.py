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
        # 생성물이 그 레코드의 반응물에 이미 들어 있으면 그 레코드는 이 결합을 만든 게 아니다 —
        # 제형·재결정·염 교환 기록이다 (US05154930: 아스피린을 레시틴에 녹인 제형 특허)
        if want <= have and p not in have:
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


def _catalyst(rec: dict) -> dict:
    """The catalyst as the record names it, and its structure only where the two agree.

    US07544831B2 names its catalyst "zirconia" and attaches a tetramethoxy diaryl oxane to it.
    Drawing that is worse than drawing nothing: the name is right and the structure is a
    resolver's mistake, so the name is kept and the structure dropped (evidence/identity.py).
    """
    from .identity import mismatch

    name = next((r.get("name") for r in ((rec.get("procedure") or {}).get("reagents") or [])
                 if (r.get("role") or "").upper() == "CATALYST" and r.get("name")), None)
    smiles = rec.get("catalysts") if isinstance(rec.get("catalysts"), str) else None
    why = mismatch(name, smiles)
    return {"catalyst": None if why else smiles, "catalyst_name": name,
            "catalyst_structure_dropped": why}


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

    def read(r: dict) -> dict:
        return {k: (r.get(col) if col in r else r.get(k)) or None for k, col in fields.items()}

    def stated(r: dict) -> int:
        return sum(1 for v in read(r).values() if v is not None)

    def worked(r: dict) -> float:
        y = r.get("yield_pct")
        return float(y) if y is not None and 0 < y <= 100 else -1.0

    def lean(r: dict) -> float:
        """Negated solvent per mmol of substrate, so that less of it sorts first.

        A record that exists is not a record of the best way. US07842696B2 acetylates salicylic
        acid in 10 mL of dichloromethane per 0.72 mmol with 1.1 equivalents of pyridine, for 4
        hours, and gets 76% — which at a gram of aspirin is about 113 mL of dichloromethane before
        the extraction. The classic preparation uses the acetic anhydride as its own solvent, three
        drops of phosphoric acid and 15 minutes. They are not competing on how well they work; one
        is making aspirin and the other is acetylating something on the way to a different paper.
        How much material a run consumes per mmol is the part of that difference a record states.
        """
        t = r.get("table") or {}
        lim = t.get("limiting_recorded_mmol")
        if not lim:
            return 0.0
        # Only what the record calls a solvent. Counting every non-substrate volume made a
        # reactant charged by volume look like solvent burden, and the classic aspirin
        # preparation - whose acetic anhydride is both reagent and medium - lost to a record
        # that simply states no volumes at all.
        vol = sum((row.get("volume_ml") or 0.0) for row in (t.get("rows") or [])
                  if (row.get("role") or "").upper() == "SOLVENT")
        return -(vol * (t.get("scale_mmol") or 1.0) / lim)

    def timed(r: dict) -> int:
        """A procedure with no time cannot be run; one that states it can."""
        return 1 if read(r)["time_h"] is not None else 0

    # A reported yield comes first, then a stated time, then least material, then how much the
    # entry happens to carry.
    #
    # The yield leads because the cost engine is already using one. When the conditions came from a
    # record with no yield, the yield pushed through the route had to come from somewhere else, and
    # aspirin ended up with the quantities and temperature of a teaching-lab preparation that
    # reports no yield beside 76% taken from a patent nobody else on the sheet ran. That is two
    # experiments presented as one. Whatever record the sheet shows, the number the cost rests on
    # has to be that record's own, so a run that says what it gave is preferred to one that does
    # not — and the leaner run only wins among those that do.
    best = max(records, key=lambda r: (worked(r), timed(r), lean(r), stated(r))) if records else None
    if best is None or stated(best) == 0:
        return None
    out = {**read(best), "catalyst_loading": None,
           "source_id": best.get("reaction_id"), "mixed": False, **_catalyst(best)}

    # 다른 레코드가 적어 둔 **다른** 조건은 대안으로 따로 보여준다. 항목별로 긁어다 합치면
    # 서로 다른 실험 네 개가 조건 하나로 뜬다 — 아스피린 스텝이 그랬다: 무용매 90 °C(지르코니아)에
    # 5분과 다이클로로메테인(얼음욕 피리딘 반응)이 섞여서, 아무도 돌린 적 없는 절차가 됐다.
    alts = []
    for r in records:
        if r is best or not r.get("reaction_id"):
            continue
        v = read(r)
        if stated(r) and any(v[k] is not None and v[k] != out[k] for k in fields):
            alts.append({**v, "source_id": r["reaction_id"],
                         "patent": r.get("patent"), "doi": r.get("doi")})
        if len(alts) >= 4:
            break
    out["alternatives"] = alts
    out["by_source"] = _by_source(records, read)
    return out


def _by_source(records: list[dict], read) -> list[dict]:
    """One row per patent or paper, not per record.

    Counting records lets a single patent's screening table drown out every other source. What a
    chemist wants from eleven records is how many independent groups ran this and what each of them
    did, so the sources are collapsed and each keeps the range it reports.
    """
    groups: dict[str, dict] = {}
    for r in records:
        key = (r.get("patent") or r.get("doi")
               or ((r.get("procedure") or {}).get("organization"))
               or r.get("dataset"))
        if not key:
            continue
        v = read(r)
        g = groups.setdefault(key, {"source": key, "records": 0, "temperatures": [], "times": [],
                                    "yields": [], "catalysts": set(), "solvents": set(),
                                    "url": r.get("url")})
        g["records"] += 1
        if v["temperature_c"] is not None:
            g["temperatures"].append(v["temperature_c"])
        if v["time_h"] is not None:
            g["times"].append(v["time_h"])
        y = r.get("yield_pct")
        if y is not None and 0 < y <= 100:
            g["yields"].append(float(y))
        cat = next((x.get("name") for x in ((r.get("procedure") or {}).get("reagents") or [])
                    if (x.get("role") or "").upper() == "CATALYST" and x.get("name")), None)
        if cat:
            g["catalysts"].add(cat)
        if v["solvent"]:
            g["solvents"].add(str(v["solvent"]))
    out = []
    for g in groups.values():
        out.append({
            "source": g["source"], "url": g["url"], "records": g["records"],
            "temperature_c": _span(g["temperatures"]), "time_h": _span(g["times"]),
            "yield_pct": _span(g["yields"]),
            "catalysts": sorted(g["catalysts"]), "solvents": sorted(g["solvents"]),
        })
    # most informative source first: one that reports a yield, then one that reports conditions
    out.sort(key=lambda g: (g["yield_pct"] is not None, g["temperature_c"] is not None,
                            g["records"]), reverse=True)
    return out


def _span(vals: list[float]) -> dict | None:
    if not vals:
        return None
    return {"min": min(vals), "max": max(vals), "n": len(vals)}


def reported_yield(records: list[dict]) -> float | None:
    """문헌 수율. 0 < y <= 100 범위 밖은 레코드 오류로 보고 버린다 (ORD에 37,578건 있다)."""
    for r in records:
        y = r.get("yield_pct")
        if y is not None and 0 < y <= 100:
            return float(y)
    return None
