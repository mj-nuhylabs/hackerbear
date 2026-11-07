"""AiZynthFinder 래핑 → Route 객체.

경로·템플릿·선례 수는 AiZynthFinder와 USPTO 템플릿 라이브러리가 준 값이고,
타당성 점수는 model/predict.py, 증거 등급은 evidence/tiers.py, 출처·조건·수율은
evidence/provenance.py가 ORD 레코드에서 찾은 값이다. 이 파일이 만들어내는 숫자는 없다.

assumed_yield만 가정값이다 — 문헌값이 있으면 그것을 쓰고, 없으면 ASSUMED_YIELD를 쓰되
스텝에 yield_is_assumed=True로 표시해 UI가 라벨을 붙일 수 있게 한다.
"""
from __future__ import annotations

import threading
from pathlib import Path

from evidence import analogs, provenance
from evidence.tiers import ANALOGOUS_MIN_PRECEDENTS, decide
from model.predict import score_many

from .resolve import describe

CONFIG = Path(__file__).resolve().parents[1] / "data/aizynth/config.yml"
ASSUMED_YIELD = 0.70          # 문헌값이 없을 때만. 반드시 assumed로 표시한다
MAX_ROUTES = 5
DEFAULT_TIME_LIMIT_S = 45

_finder = None
_lock = threading.Lock()
# /cost, /explain이 route_id로 다시 찾을 수 있게 들고 있다 (DB 없음 — 메모리)
ROUTES: dict[str, dict] = {}


def finder():
    """AiZynthFinder 1회 로드. ONNX 모델이 커서 첫 호출이 느리다."""
    global _finder
    if _finder is None:
        with _lock:
            if _finder is None:
                from aizynthfinder.aizynthfinder import AiZynthFinder
                f = AiZynthFinder(configfile=str(CONFIG))
                f.stock.select("zinc")
                f.expansion_policy.select("uspto")
                f.filter_policy.select("uspto")
                _finder = f
    return _finder


def _walk(node: dict, steps: list, leaves: dict):
    """AiZynth route dict(타겟→말단)를 후위 순회 → steps는 출발물질→타겟 위상 순서."""
    if node.get("type") != "mol":
        return
    # SVG는 UI가 스킴·스텝·BOM에 그대로 꽂는다 (RDKit 렌더)
    if not node.get("children"):
        c = describe(node["smiles"])
        leaves[c["smiles"]] = {**c, "in_stock": bool(node.get("in_stock"))}
        return
    rxn = node["children"][0]
    for child in rxn.get("children", []):
        _walk(child, steps, leaves)
    md = rxn.get("metadata", {}) or {}
    reactants = [describe(m["smiles"]) for m in rxn.get("children", [])]
    product = describe(node["smiles"])
    steps.append({
        "rxn_smiles": ".".join(r["smiles"] for r in reactants) + ">>" + product["smiles"],
        "template_id": md.get("template_hash"),
        "classification": md.get("classification"),
        "reactants": reactants,
        "product": product,
        "precedent_count": int(md.get("library_occurence") or 0),
    })


def _finish_steps(steps: list[dict]) -> list[dict]:
    """타당성 점수(배치) + 증거 등급 + 출처·조건·수율 + 유사 반응을 붙인다.

    값의 우선순위는 **증거가 가까운 순서**다:
      1. 이 반응 자체의 레코드 (provenance) — 같은 반응이 기록돼 있다
      2. 가까운 유사 반응 (analogs)        — 다른 기질로 돌려본 기록이 있다
      3. 가정값 ASSUMED_YIELD              — 아무것도 없다
    어느 쪽을 썼는지는 yield_basis에 남겨 UI가 라벨을 붙인다. 2번은 유사도 문턱을 넘을 때만
    쓴다 (evidence/analogs.py의 측정표 참조).
    """
    scores = score_many([s["rxn_smiles"] for s in steps])
    neighbours = analogs.search_many([s["rxn_smiles"] for s in steps])
    out = []
    for s, (raw, cal), hits in zip(steps, scores, neighbours):
        records = provenance.match([r["smiles"] for r in s["reactants"]], s["product"]["smiles"])
        tier = decide(has_corpus_record=bool(records),
                      precedent_count=s["precedent_count"],
                      plausibility_calibrated=cal)
        evidence = provenance.evidence_from(records, s["precedent_count"], tier)
        lit_pct = provenance.reported_yield(records)              # 레코드의 퍼센트 값
        lit_yield = lit_pct / 100.0 if lit_pct is not None else None  # assumed_yield·UI와 같은 0–1 비율

        analog_yield, analog_basis = analogs.yield_from(hits)
        if lit_yield is not None:
            used, basis = lit_yield, {"basis": "reported", "source_ids": evidence["source_ids"]}
        elif analog_yield is not None:
            used, basis = analog_yield, analog_basis
        else:
            used, basis = ASSUMED_YIELD, {"basis": "assumed", "value": ASSUMED_YIELD}

        out.append({
            "rxn_smiles": s["rxn_smiles"],
            "template_id": s["template_id"],
            "classification": s["classification"],
            "reactants": s["reactants"],
            "product": s["product"],
            "evidence": evidence,
            # 조건도 같은 순서. 유사 반응 조건은 from_analog=True로 표시돼 UI가 구분한다
            "conditions": (provenance.conditions_from(records)
                           or analogs.conditions_from(hits)),
            "procedure": provenance.procedure_from(records, [r["smiles"] for r in s["reactants"]]),
            "analogs": hits,
            "reported_yield": lit_yield,
            # 계산에 쓰는 값. 출처는 yield_basis가 말해 준다
            "assumed_yield": used,
            "yield_is_assumed": lit_yield is None,
            "yield_basis": basis,
            "plausibility_raw": raw,
            "plausibility_calibrated": cal,
        })
    return out


def search(smiles: str, max_depth: int = 4, *, time_limit_s: int = DEFAULT_TIME_LIMIT_S,
           max_routes: int = MAX_ROUTES) -> dict:
    """타겟 SMILES → {routes, search}. 경로를 못 찾으면 routes는 빈 리스트다."""
    f = finder()
    with _lock:
        f.config.search.time_limit = time_limit_s
        f.config.search.max_depth = max_depth
        f.target_smiles = smiles
        f.tree_search()
        f.build_routes()
        stats = f.extract_statistics()
        dicts, scores = list(f.routes.dicts), list(f.routes.scores)

    routes = []
    for i, (rd, sc) in enumerate(zip(dicts, scores)):
        raw_steps, leaves = [], {}
        _walk(rd, raw_steps, leaves)
        if not raw_steps:
            continue
        rid = f"R{i + 1}"
        routes.append({
            "id": rid,
            "steps": _finish_steps(raw_steps),
            "leaf_materials": list(leaves.values()),
            "aizynth_score": round(float(sc.get("state score", next(iter(sc.values())))), 3),
        })
    routes.sort(key=lambda r: -r["aizynth_score"])
    routes = routes[:max_routes]
    for r in routes:
        ROUTES[r["id"]] = r
    return {
        "routes": routes,
        "search": {
            "solved": bool(stats.get("is_solved")),
            "search_time_s": round(float(stats.get("search_time", 0.0)), 1),
            "analogous_min_precedents": ANALOGOUS_MIN_PRECEDENTS,
            # 유사 반응 인덱스가 없으면 analogs가 전부 빈 리스트다. UI가 "꺼짐"과 "못 찾음"을
            # 구분할 수 있어야 한다 — 둘 다 빈 화면으로 보이면 안 된다
            "analog_index": analogs.stats() or None,
        },
    }
