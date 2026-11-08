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

from cost import rank as cost_rank
from evidence import analogs, provenance
from evidence.tiers import ANALOGOUS_MIN_PRECEDENTS, decide
from model.predict import score_many

from .balance import missing_atoms
from .resolve import describe
from .stock import label as stock_label

CONFIG = Path(__file__).resolve().parents[1] / "data/aizynth/config.yml"
ASSUMED_YIELD = 0.70          # 문헌값이 없을 때만. 반드시 assumed로 표시한다
MAX_ROUTES = 5
DEFAULT_TIME_LIMIT_S = 45
SEARCH_SEED = 0               # 같은 분자는 언제 검색해도 같은 경로가 나와야 한다 (finder() 참조)

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
                import random

                import numpy as np
                from aizynthfinder.aizynthfinder import AiZynthFinder

                from .stock import use_with_zinc
                # MCTS가 확장할 노드를 random.choice / np.random.choice로 고른다. 씨앗을 안 박으면
                # 같은 분자를 두 번 검색했을 때 다른 경로가 나올 수 있다 — 화학자가 "아까 있던 화합물이
                # 사라졌다"고 느끼는 원인이다. 결과가 매번 같아야 검증도 된다.
                random.seed(SEARCH_SEED)
                np.random.seed(SEARCH_SEED)
                f = AiZynthFinder(configfile=str(CONFIG))
                # ZINC만으로는 EtOH·MeI·CS2를 못 사서 탐색이 그걸 "합성"한다 (chem/stock.py)
                use_with_zinc(f)
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
        leaves[c["smiles"]] = {**c, "in_stock": bool(node.get("in_stock")),
                               **stock_label(c["smiles"], bool(node.get("in_stock")))}
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
        "missing_atoms": missing_atoms([r["smiles"] for r in reactants], product["smiles"]),
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
            # 반응물 목록이 생성물의 원자를 다 대지 못하면 빠진 원소 수 (chem/balance.py). 비용이 하한이 된다
            "missing_atoms": s.get("missing_atoms"),
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


DEEP = Path(__file__).resolve().parents[1] / "data/deep"


def _demo_payload(smiles: str) -> dict | None:
    """데모 타겟 5개는 밤새 미리 계산한 결과(scripts/score_deep_targets.py)를 그대로 돌려준다.

    기록된 경로(모든 스텝이 ORD 레코드) + 깊게 돌린 AiZynth 경로, 두 모델의 순위가 들어 있다.
    파일이 없으면 None — 라이브 검색으로 간다.
    """
    from model.holdout import DEMO_TARGETS
    from rdkit import Chem
    m = Chem.MolFromSmiles(smiles)
    if m is None:
        return None
    key = Chem.MolToSmiles(m, isomericSmiles=False)
    for name, s in DEMO_TARGETS.items():
        if Chem.MolToSmiles(Chem.MolFromSmiles(s), isomericSmiles=False) == key:
            p = DEEP / f"demo_{name.lower()}.json"
            if p.exists():
                import json
                return json.loads(p.read_text())
    return None


def search(smiles: str, max_depth: int = 4, *, time_limit_s: int = DEFAULT_TIME_LIMIT_S,
           max_routes: int = MAX_ROUTES) -> dict:
    """타겟 SMILES → {routes, search}. 경로를 못 찾으면 routes는 빈 리스트다."""
    demo = _demo_payload(smiles)
    if demo is not None:
        for r in demo["routes"]:
            ROUTES[r["id"]] = r
        return {"routes": demo["routes"], "search": demo["search"]}

    f = finder()
    with _lock:
        f.config.search.time_limit = time_limit_s
        # AiZynthFinder 4.x의 필드 이름은 max_transforms다. max_depth를 넣으면 조용히 무시된다
        f.config.search.max_transforms = max_depth
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
    # AiZynth 점수는 짧고 다 살 수 있는 경로면 거의 다 0.998이라 순서를 못 정한다.
    # 비용 엔진의 g당 재료비(수율 반영)로 정렬한다 (cost/rank.py)
    routes = cost_rank.rank(routes)[:max_routes]
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
