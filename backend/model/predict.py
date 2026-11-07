"""추론: 반응 → (plausibility_raw, plausibility_calibrated).

모델 파일이 없거나 입력을 정규화할 수 없으면 (None, None)을 돌려준다 — UI는 —로 띄운다.
추정값으로 채우지 않는다 (절대 규칙 3).

calibrated 값의 의미: 보류해 둔 USPTO 실제 반응 vs 템플릿 생성 decoy 사이에서 캘리브레이션된 확률.
**구조적 타당성이지 실험 성공 확률이 아니다 — 이건 추측이 아니라 측정값이다.**
scripts/validate_external.py가 ORD의 기록된 실제 결과(모든 조건에서 실패한 반응 vs 어떤 조건에선
성공한 반응)에 대고 재보면 ROC-AUC가 0.47로, 우연보다 못하다. 즉 이 점수로 "실험이 될지"를
말하면 안 된다. 이 점수가 잡아내는 것은 "템플릿이 엉뚱하게 적용된 스텝"이다.
"""
from __future__ import annotations

import pickle
import traceback
from pathlib import Path

from .featurize import featurize, normalize_rxn

DATA = Path(__file__).resolve().parents[1] / "data"
MODEL_PATH = DATA / "model.pkl"
CALIBRATOR_PATH = DATA / "calibrator.pkl"

_state: dict | None = None


def _load() -> dict | None:
    global _state
    if _state is None:
        if not (MODEL_PATH.exists() and CALIBRATOR_PATH.exists()):
            return None
        with open(MODEL_PATH, "rb") as f:
            bundle = pickle.load(f)          # {"model": LGBMClassifier, "kind": "drfp", ...}
        with open(CALIBRATOR_PATH, "rb") as f:
            calibrator = pickle.load(f)      # CalibratedClassifierCV(FrozenEstimator(model))
        _state = {**bundle, "calibrator": calibrator}
    return _state


def score_many(rxn_smiles: list[str]) -> list[tuple[float | None, float | None]]:
    """정방향 'reactants>>product' 리스트 → [(raw, calibrated), ...]. 실패한 항목은 (None, None)."""
    out: list[tuple[float | None, float | None]] = [(None, None)] * len(rxn_smiles)
    st = _load()
    if st is None:
        return out
    norm = [normalize_rxn(r) for r in rxn_smiles]
    idx = [i for i, r in enumerate(norm) if r]
    if not idx:
        return out
    try:
        X = featurize([norm[i] for i in idx], st["kind"])
        raw = st["model"].predict_proba(X)[:, 1]
        cal = st["calibrator"].predict_proba(X)[:, 1]
    except Exception:
        # 값은 None으로 돌려주되(절대 규칙 3), 조용히 삼키지는 않는다.
        # 점수가 전부 —로 뜨는 게 "모델 없음"인지 버그인지 구분할 수 있어야 한다.
        traceback.print_exc()
        return out
    for j, i in enumerate(idx):
        out[i] = (float(raw[j]), float(cal[j]))
    return out


def score(rxn_smiles: str) -> tuple[float | None, float | None]:
    return score_many([rxn_smiles])[0]
