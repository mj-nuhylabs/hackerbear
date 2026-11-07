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

from evidence import provenance
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
    if not node.get("children"):
        c = describe(node["smiles"], svg=False)
        leaves[c["smiles"]] = {**c, "in_stock": bool(node.get("in_stock"))}
        return
    rxn = node["children"][0]
    for child in rxn.get("children", []):
        _walk(child, steps, leaves)
    md = rxn.get("metadata", {}) or {}
    reactants = [describe(m["smiles"], svg=False) for m in rxn.get("children", [])]
    product = describe(node["smiles"], svg=False)
    steps.append({
        "rxn_smiles": ".".join(r["smiles"] for r in reactants) + ">>" + product["smiles"],
        "template_id": md.get("template_hash"),
        "classification": md.get("classification"),
        "reactants": reactants,
        "product": product,
        "precedent_count": int(md.get("library_occurence") or 0),
    })


def _finish_steps(steps: list[dict]) -> list[dict]:
    """타당성 점수(배치) + 증거 등급 + 출처·조건·수율을 붙인다."""
    scores = score_many([s["rxn_smiles"] for s in steps])
    out = []
    for s, (raw, cal) in zip(steps, scores):
        records = provenance.match([r["smiles"] for r in s["reactants"]], s["product"]["smiles"])
        tier = decide(has_corpus_record=bool(records),
                      precedent_count=s["precedent_count"],
                      plausibility_calibrated=cal)
        lit_yield = provenance.reported_yield(records)
        out.append({
            "rxn_smiles": s["rxn_smiles"],
            "template_id": s["template_id"],
            "classification": s["classification"],
            "reactants": s["reactants"],
            "product": s["product"],
            "evidence": provenance.evidence_from(records, s["precedent_count"], tier),
            "conditions": provenance.conditions_from(records),
            "reported_yield": lit_yield,
            # 계산에 쓰는 값. 문헌값이 있으면 그것, 없으면 가정값이고 플래그로 표시한다
            "assumed_yield": (lit_yield / 100.0) if lit_yield is not None else ASSUMED_YIELD,
            "yield_is_assumed": lit_yield is None,
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
        },
    }
