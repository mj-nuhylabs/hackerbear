"""Inference: reaction -> (plausibility_raw, plausibility_calibrated).

If the model files are missing or the input cannot be normalized, return (None, None); the UI shows —.
Never fill in an estimate (absolute rule 3).

Meaning of the calibrated value: calibrated probability of a held-out real USPTO reaction vs a template-generated decoy.
**It is structural plausibility, not the probability of experimental success. This is a measurement, not a guess.**
Measured by scripts/validate_external.py against recorded real outcomes in ORD (reactions that failed under all
conditions vs reactions that succeeded under some), ROC-AUC is 0.47, worse than chance. So this score must not be used
to say whether an experiment will work. What it catches is "a step where the template was applied nonsensically".
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
    """Forward 'reactants>>product' list -> [(raw, calibrated), ...]. Failed entries are (None, None)."""
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
        # Return None for the value (absolute rule 3), but do not swallow it silently.
        # You must be able to tell whether scores all showing — means "no model" or a bug.
        traceback.print_exc()
        return out
    for j, i in enumerate(idx):
        out[i] = (float(raw[j]), float(cal[j]))
    return out


def score(rxn_smiles: str) -> tuple[float | None, float | None]:
    return score_many([rxn_smiles])[0]
