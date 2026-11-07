"""가장 가까운 ORD 반응 조회 — 스텝 하나에 "실제로 돌려본 반응"을 붙인다.

여기서 나오는 값은 전부 레코드에 적힌 것이거나 코드 계산값이다. 유사도는 DRFP 비트의
Tanimoto이고, 조건·수율·출처는 scripts/build_analog_index.py가 ORD에서 모아둔 그대로다.
인덱스가 없으면 전부 빈 결과를 돌려준다 — 기능만 꺼지고 앱은 돈다.

**수율 임계값 0.6은 측정값이다.** 전체 인덱스(756,776 반응)에서 홀드아웃 3,000건을 뽑아
상위 5개 유사 반응의 중앙값과 고정 70% 가정을 비교한 결과 (평균절대오차, 포인트):

    최근접 유사도    n     유사 반응   고정 70%
    0.8-1.0       1,152     17.1       20.6
    0.6-0.8         829     18.6       21.6
    0.4-0.6         654     22.9       22.7   ← 여기서 뒤집힌다
    0.0-0.4         312     26.0       22.9

0.6 미만이면 유사 반응 수율을 쓰지 않는다. 임계값을 고른 게 아니라 측정에서 나왔다.

주의: 인덱스 크기를 바꾸면 이 표가 바뀐다. 40만 건 표본으로 재봤을 때는 0.4-0.6 구간에서도
유사 반응이 이겨서(21.3 대 22.2) 임계값을 0.4로 뒀는데, 전수 인덱스에서는 뒤집혔다.
인덱스를 다시 만들면 scripts/validate_analogs.py를 다시 돌리고 이 값을 맞춰야 한다.
"""
from __future__ import annotations

import json
import threading
from pathlib import Path

import numpy as np
import scipy.sparse as sp

DATA = Path(__file__).resolve().parents[1] / "data/analogs"
FINGERPRINTS = DATA / "fingerprints.npz"
REACTIONS = DATA / "reactions.parquet"
STATS = DATA / "stats.json"

TOP_K = 5
# 이 아래로는 유사 반응 수율이 고정 70%보다 못하다 (위 표).
YIELD_MIN_SIMILARITY = 0.6
# 조건은 수율보다 기질에 민감하다. 수율이 쓸모 있는 구간보다 느슨하게 잡을 이유가 없다.
CONDITIONS_MIN_SIMILARITY = 0.6

_index: dict | None = None
_lock = threading.Lock()


def _load() -> dict | None:
    """인덱스 1회 로드. 없으면 None — 호출부는 빈 결과로 처리한다."""
    global _index
    if _index is None:
        with _lock:
            if _index is None:
                if not (FINGERPRINTS.exists() and REACTIONS.exists()):
                    return None
                import pandas as pd
                X = sp.load_npz(FINGERPRINTS).astype(np.float32)
                meta = pd.read_parquet(REACTIONS)
                _index = {
                    "X": X,
                    # 행마다 켜진 비트 수. Tanimoto 분모에 쓰므로 한 번만 센다
                    "bits": np.asarray(X.sum(axis=1)).ravel(),
                    "meta": meta,
                    "stats": json.loads(STATS.read_text()) if STATS.exists() else {},
                }
    return _index


def available() -> bool:
    return _load() is not None


def stats() -> dict:
    ix = _load()
    return dict(ix["stats"]) if ix else {}


def _similarity(Q: sp.csr_matrix, ix: dict) -> np.ndarray:
    """(n_query, n_index) Tanimoto. 0/1 벡터라 내적이 곧 공통 비트 수다."""
    inter = (Q @ ix["X"].T).toarray()
    q_bits = np.asarray(Q.sum(axis=1)).ravel()[:, None]
    return inter / (q_bits + ix["bits"][None, :] - inter + 1e-9)


def _row(meta_row, similarity: float) -> dict:
    """인덱스 한 행 → UI가 읽는 모양. 없는 값은 None이고 UI가 —로 띄운다."""
    def val(k):
        v = meta_row.get(k)
        if v is None or (isinstance(v, float) and np.isnan(v)):
            return None
        return v

    ids = meta_row.get("reaction_ids")
    ids = list(ids) if ids is not None and len(ids) else []
    patent, doi = val("patent"), val("doi")
    return {
        "rxn_smiles": meta_row["rxn"],
        "similarity": round(float(similarity), 3),
        "n_records": int(meta_row.get("n_records") or 0),
        "n_yields": int(meta_row.get("n_yields") or 0),
        "yield_median": val("yield_median"),
        "yield_min": val("yield_min"),
        "yield_max": val("yield_max"),
        "temperature_c": val("temperature_c"),
        "time_h": val("time_h"),
        "solvent": val("solvents"),
        "catalyst": val("catalysts"),
        "reagents": val("reagents"),
        "reaction_ids": ids,
        "patent": patent,
        "doi": doi,
        "organization": val("organization"),
        "dataset_id": val("dataset_id"),
        "url": val("url") or (f"https://doi.org/{doi}" if doi else None),
    }


def search_many(rxn_smiles: list[str], top_k: int = TOP_K) -> list[list[dict]]:
    """정방향 'reactants>>product' 리스트 → 각 반응의 가까운 ORD 반응들 (유사도 내림차순).

    인덱스가 없거나 정규화에 실패한 항목은 빈 리스트다 — 비슷한 걸 지어내지 않는다.
    """
    out: list[list[dict]] = [[] for _ in rxn_smiles]
    ix = _load()
    if ix is None:
        return out

    from model.featurize import featurize, normalize_rxn

    norm = [normalize_rxn(r) for r in rxn_smiles]
    idx = [i for i, n in enumerate(norm) if n]
    if not idx:
        return out

    Q = featurize([norm[i] for i in idx], "drfp")
    Q.data[:] = 1.0
    S = _similarity(Q.astype(np.float32), ix)

    meta = ix["meta"]
    for j, i in enumerate(idx):
        row = S[j]
        k = min(top_k, row.shape[0])
        best = np.argpartition(-row, k - 1)[:k]
        best = best[np.argsort(-row[best])]
        hits = []
        for b in best:
            # 자기 자신(코퍼스에 있는 바로 그 반응)도 유효한 결과다 — REPORTED 근거가 된다
            hits.append(_row(meta.iloc[int(b)], row[int(b)]))
        out[i] = hits
    return out


def search(rxn_smiles: str, top_k: int = TOP_K) -> list[dict]:
    return search_many([rxn_smiles], top_k)[0]


def yield_from(hits: list[dict]) -> tuple[float | None, dict | None]:
    """유사 반응에서 가져올 수율(0–1 비율)과 그 근거. 쓸 수 없으면 (None, None).

    상위 유사 반응이 YIELD_MIN_SIMILARITY 미만이면 쓰지 않는다 — 그 구간에서는 고정 70%가
    더 정확하다는 게 측정 결과다.
    """
    usable = [h for h in hits
              if h["similarity"] >= YIELD_MIN_SIMILARITY and h["yield_median"] is not None]
    if not usable:
        return None, None
    vals = [float(h["yield_median"]) for h in usable]
    median = float(np.median(vals))
    return median / 100.0, {
        "basis": "analogs",
        "n_analogs": len(usable),
        "top_similarity": usable[0]["similarity"],
        "yield_pct_median": round(median, 1),
        "yield_pct_min": round(min(vals), 1),
        "yield_pct_max": round(max(vals), 1),
        "source_ids": [i for h in usable for i in h["reaction_ids"]][:5],
        "min_similarity": YIELD_MIN_SIMILARITY,
    }


def conditions_from(hits: list[dict]) -> dict | None:
    """가장 가까운 유사 반응의 조건. CONDITIONS_MIN_SIMILARITY 미만이면 None.

    조건은 수율보다 기질에 민감해서 더 높은 문턱을 쓴다. 온도도 시간도 없으면 None이다.
    """
    for h in hits:
        if h["similarity"] < CONDITIONS_MIN_SIMILARITY:
            break
        if h["temperature_c"] is None and h["time_h"] is None and h["solvent"] is None:
            continue
        return {
            "solvent": h["solvent"],
            "temperature_c": h["temperature_c"],
            "time_h": h["time_h"],
            "catalyst": h["catalyst"],
            "catalyst_loading": None,       # ORD는 로딩을 따로 적지 않는다 — 추정하지 않는다
            "source_id": h["reaction_ids"][0] if h["reaction_ids"] else None,
            "from_analog": True,
            "similarity": h["similarity"],
            "min_similarity": CONDITIONS_MIN_SIMILARITY,
        }
    return None
