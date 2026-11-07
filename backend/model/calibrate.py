"""isotonic 캘리브레이션 + reliability diagram PNG + metrics.json.

- calibrator는 calib셋으로만 fit한다.
- reliability diagram과 모든 지표는 test셋에서만 계산한다. calib셋으로 그리면 isotonic이
  자기가 맞춘 데이터를 보여주는 그림이 되어 항상 좋아 보인다.
- 그림과 metrics.json의 숫자는 전부 여기서 코드로 계산한 값이다 (절대 규칙 2).
"""
from __future__ import annotations

import json
import pickle
from datetime import date
from pathlib import Path

import numpy as np
from sklearn.calibration import CalibratedClassifierCV
from sklearn.frozen import FrozenEstimator
from sklearn.metrics import average_precision_score, brier_score_loss, roc_auc_score

DATA = Path(__file__).resolve().parents[1] / "data"
N_BINS = 10

# dataviz 기본 팔레트 (light surface). PNG라 테마 전환 없음
SURFACE, INK, INK2, GRID = "#fcfcfb", "#0b0b0b", "#52514e", "#e4e3df"
CALIBRATED, RAW, HIST = "#2a78d6", "#eb6834", "#9ec5f4"


def ece(y: np.ndarray, p: np.ndarray, n_bins: int = N_BINS) -> float:
    """Expected calibration error, 등간격 bin, 표본 수 가중."""
    edges = np.linspace(0, 1, n_bins + 1)
    idx = np.clip(np.digitize(p, edges[1:-1]), 0, n_bins - 1)
    total = 0.0
    for b in range(n_bins):
        m = idx == b
        if m.any():
            total += m.mean() * abs(y[m].mean() - p[m].mean())
    return float(total)


def reliability(y: np.ndarray, p: np.ndarray, n_bins: int = N_BINS):
    """비어 있지 않은 bin마다 (평균 예측값, 실제 양성 비율, 개수)."""
    edges = np.linspace(0, 1, n_bins + 1)
    idx = np.clip(np.digitize(p, edges[1:-1]), 0, n_bins - 1)
    rows = [(p[idx == b].mean(), y[idx == b].mean(), int((idx == b).sum()))
            for b in range(n_bins) if (idx == b).any()]
    return [np.array(c) for c in zip(*rows)]


def _metrics(y, p) -> dict:
    return {"roc_auc": float(roc_auc_score(y, p)), "pr_auc": float(average_precision_score(y, p)),
            "brier": float(brier_score_loss(y, p)), "ece": ece(y, p)}


def plot(y, p_raw, p_cal, m: dict, out_png: Path):
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    plt.rcParams.update({"font.size": 9, "text.color": INK, "axes.labelcolor": INK2,
                         "xtick.color": INK2, "ytick.color": INK2, "axes.edgecolor": GRID})
    fig, (ax, axh) = plt.subplots(2, 1, figsize=(6.4, 7.0), dpi=150, sharex=True,
                                  gridspec_kw={"height_ratios": [3, 1], "hspace": 0.08})
    fig.patch.set_facecolor(SURFACE)
    for a in (ax, axh):
        a.set_facecolor(SURFACE)
        a.grid(True, color=GRID, linewidth=0.6)
        a.set_axisbelow(True)
        for s in ("top", "right"):
            a.spines[s].set_visible(False)

    ax.plot([0, 1], [0, 1], linestyle=(0, (2, 3)), color=INK2, linewidth=1, label="Perfect calibration")
    for p, color, name, key in ((p_raw, RAW, "Model raw score", "raw"),
                                (p_cal, CALIBRATED, "Calibrated (isotonic)", "calibrated")):
        mp, fp, _ = reliability(y, p)
        ax.plot(mp, fp, color=color, linewidth=2, marker="o", markersize=5,
                markeredgecolor=SURFACE, markeredgewidth=1.2,
                label=f"{name}  ·  ECE {m[key]['ece']:.3f}")
    ax.set_xlim(0, 1)
    ax.set_ylim(0, 1)
    ax.set_ylabel("Observed fraction of real reactions")
    ax.legend(loc="upper left", frameon=False)

    axh.hist(p_cal, bins=np.linspace(0, 1, N_BINS + 1), color=HIST, edgecolor=SURFACE, linewidth=2)
    axh.set_ylabel("Test reactions")
    axh.set_xlabel("Predicted plausibility")

    c = m["calibrated"]
    fig.suptitle("Reaction plausibility: calibration on held-out test set", x=0.08, y=0.975,
                 ha="left", fontsize=11, fontweight="bold")
    fig.text(0.08, 0.935,
             f"n = {m['test_n']:,}  ·  real-reaction share {m['test_base_rate']:.2f}  ·  "
             f"ROC-AUC {c['roc_auc']:.3f}  ·  Brier {m['raw']['brier']:.3f} → {c['brier']:.3f}",
             ha="left", color=INK2)
    fig.text(0.08, 0.02,
             "Positives: real corpus reactions. Negatives: products of other templates applied to the same "
             "reactants.\nThis measures structural plausibility. It does NOT predict laboratory success — "
             "on held-out ORD reactions with\nrecorded outcomes it scores at chance (see "
             f"external_validation.png).  Generated {m['generated']}.",
             ha="left", color=INK2, fontsize=7.5)
    fig.subplots_adjust(left=0.1, right=0.97, top=0.9, bottom=0.12)
    fig.savefig(out_png, facecolor=SURFACE)
    plt.close(fig)


def run(model, X_cal, y_cal, X_test, y_test, cls_test, meta: dict, out_dir: Path = DATA) -> dict:
    calibrator = CalibratedClassifierCV(FrozenEstimator(model), method="isotonic").fit(X_cal, y_cal)
    with open(out_dir / "calibrator.pkl", "wb") as f:
        pickle.dump(calibrator, f)

    p_raw = model.predict_proba(X_test)[:, 1]
    p_cal = calibrator.predict_proba(X_test)[:, 1]
    m = {
        **meta,
        "generated": date.today().isoformat(),
        "test_n": int(len(y_test)),
        "test_base_rate": float(y_test.mean()),
        "raw": _metrics(y_test, p_raw),
        "calibrated": _metrics(y_test, p_cal),
        "roc_auc_by_class": {},
    }
    for c in sorted(set(cls_test)):
        sel = cls_test == c
        if len(set(y_test[sel])) == 2:
            m["roc_auc_by_class"][str(c)] = {"n": int(sel.sum()), "roc_auc": float(roc_auc_score(y_test[sel], p_cal[sel]))}
    (out_dir / "metrics.json").write_text(json.dumps(m, indent=2))
    plot(y_test, p_raw, p_cal, m, out_dir / "calibration.png")
    return m
