"""외부 검증 — decoy로 학습한 모델이 **진짜 실패한 반응**도 낮게 보는가?

학습의 negative는 우리가 템플릿으로 만들어낸 decoy다. 그래서 테스트 AUC 0.94는
"우리가 만든 가짜와 진짜를 가른다"는 뜻이지, 실험이 될지 안 될지를 맞춘다는 뜻이 아니다.
이 스크립트는 그 질문을 따로 묻는다.

데이터: ORD의 비-USPTO 레코드(HTE·문헌·ELN). 같은 반응이 여러 조건으로 기록돼 있다.
  실패   기록된 모든 조건에서 최대 수율 < FAIL_PCT       → 그 반응은 되지 않았다
  성공   최대 수율 >= WORK_PCT                          → 어떤 조건에서는 됐다

주의: 이건 "조건 실패"가 아니라 "모든 조건에서 실패"만 센다. 우리 모델은 조건을 보지 않으므로
조건별 실패를 물으면 애초에 대답할 수 없는 질문이 된다.

오염 검사: 학습 positive(data/ml/positives_*.parquet)와 겹치는 반응은 세어서 따로 보고한다.

usage: .venv/bin/python scripts/validate_external.py
"""
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from model.featurize import normalize_rxn          # noqa: E402
from model.predict import score_many               # noqa: E402

ORD_FLAT = ROOT / "backend/data/ord_flat.parquet"
OUT_JSON = ROOT / "backend/data/external_validation.json"
OUT_PNG = ROOT / "backend/data/external_validation.png"
# 이 반응들은 학습에서 빼야 외부 검증이 성립한다. train.py가 이 파일을 읽어 positive에서 제외한다.
HOLDOUT = ROOT / "backend/data/external_holdout.txt"
FAIL_PCT, WORK_PCT = 5.0, 20.0

SURFACE, INK, INK2, GRID = "#fcfcfb", "#0b0b0b", "#52514e", "#e4e3df"
WORKED, FAILED = "#2a78d6", "#eb6834"


def main():
    d = pd.read_parquet(ORD_FLAT, columns=["dataset_name", "rxn_smiles", "yield_pct"])
    d = d[~d.dataset_name.fillna("").str.startswith("uspto")]
    d = d.dropna(subset=["rxn_smiles", "yield_pct"])

    # **정규화를 먼저 하고 그 다음에 묶는다.** 원본 SMILES로 묶으면 같은 반응이 표기 차이로
    # 여러 그룹에 흩어지고, 그러면 한쪽 그룹의 최대 수율만 보고 "모든 조건에서 실패"라고
    # 잘못 판정한다. 실제로 그렇게 8건이 실패와 성공 양쪽에 동시에 들어가 있었다.
    uniq = {r: normalize_rxn(r) for r in d.rxn_smiles.unique()}
    d = d.assign(rxn=d.rxn_smiles.map(uniq)).dropna(subset=["rxn"])
    g = d.groupby("rxn").yield_pct.max()
    failed = g[g < FAIL_PCT].index.tolist()
    worked = g[g >= WORK_PCT].index.tolist()
    assert not (set(failed) & set(worked)), "a reaction cannot be both"
    print(f"ORD non-USPTO: {len(g):,} distinct reactions with a yield (grouped after normalization)")
    print(f"  failed under every recorded condition (<{FAIL_PCT:g}%): {len(failed):,}")
    print(f"  worked under some condition (>={WORK_PCT:g}%):         {len(worked):,}")

    rxns = failed + worked
    y = np.array([0] * len(failed) + [1] * len(worked))

    # 다음 학습이 이걸 외워버리지 않도록 홀드아웃 목록을 남긴다 (train.py가 읽는다)
    HOLDOUT.write_text("\n".join(rxns))
    print(f"  wrote {HOLDOUT.name} ({len(rxns):,} reactions to keep out of training)")

    # 오염 검사 — **지금 model.pkl이 실제로 학습한 행**과 겹치는가.
    # positives_*.parquet은 '다음 학습에 쓸 후보'지 이번 모델이 본 것이 아니다. 그걸로 재면
    # 아직 학습하지도 않은 데이터를 오염으로 세게 된다. 실제로 본 행은 ml/dataset.parquet에 있다.
    seen = None
    ds_path = ROOT / "backend/data/ml/dataset.parquet"
    if ds_path.exists():
        ds = pd.read_parquet(ds_path, columns=["rxn", "label"])
        seen = set(ds.loc[ds.label == 1, "rxn"])
    contaminated = sum(1 for r in rxns if r in seen) if seen is not None else None
    print(f"  overlap with THIS model's training positives: "
          f"{'unknown (ml/dataset.parquet missing)' if contaminated is None else f'{contaminated:,} of {len(rxns):,}'}")
    # 참고용 — 다음 학습 후보와의 겹침. 홀드아웃이 걸리면 0이 되어야 한다.
    next_overlap = {}
    for cache in sorted((ROOT / "backend/data/ml").glob("positives_*.parquet")):
        train = set(pd.read_parquet(cache, columns=["rxn"]).rxn)
        next_overlap[cache.name] = sum(1 for r in rxns if r in train)
        print(f"  (next run candidate set {cache.name}: {next_overlap[cache.name]:,} — "
              f"train.py drops these via external_holdout.txt)")

    scored = score_many(rxns)
    ok = [i for i, (raw, cal) in enumerate(scored) if cal is not None]
    if not ok:
        raise SystemExit("no reaction could be scored — is backend/data/model.pkl present?")
    p = np.array([scored[i][1] for i in ok])
    yy = y[ok]
    print(f"  scored: {len(p):,}")

    from sklearn.metrics import roc_auc_score
    auc = float(roc_auc_score(yy, p))
    med_f, med_w = float(np.median(p[yy == 0])), float(np.median(p[yy == 1]))
    res = {
        "question": "does a model trained on template decoys also rank real literature failures below real successes?",
        "source": "ORD non-USPTO records (HTE / literature / ELN)",
        "failed_under_every_condition_pct": FAIL_PCT, "worked_under_some_condition_pct": WORK_PCT,
        "n_failed": int((yy == 0).sum()), "n_worked": int((yy == 1).sum()),
        "roc_auc": auc, "median_score_failed": med_f, "median_score_worked": med_w,
        # 이번에 재고 있는 모델이 실제로 학습한 행과의 겹침. 0이면 깨끗한 홀드아웃이다.
        "overlap_with_this_model_training": contaminated,
        # 다음 학습 후보 집합과의 겹침(참고). train.py가 external_holdout.txt로 떨궈서 0이 된다.
        "overlap_with_next_run_candidates": next_overlap,
        "caveat": ("The model never sees reaction conditions, so this only asks about reactions that failed "
                   "under every condition on record, not condition-level failures."),
    }
    OUT_JSON.write_text(json.dumps(res, indent=2))
    print(f"\n  ROC-AUC on real outcomes: {auc:.4f}")
    print(f"  median score — failed {med_f:.3f} | worked {med_w:.3f}")

    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    plt.rcParams.update({"font.size": 9, "text.color": INK, "axes.labelcolor": INK2,
                         "xtick.color": INK2, "ytick.color": INK2, "axes.edgecolor": GRID})
    fig, ax = plt.subplots(figsize=(6.4, 3.8), dpi=150)
    fig.patch.set_facecolor(SURFACE)
    ax.set_facecolor(SURFACE)
    bins = np.linspace(0, 1, 26)
    for mask, color, label in ((yy == 1, WORKED, f"Worked somewhere (n={int((yy==1).sum()):,})"),
                               (yy == 0, FAILED, f"Failed everywhere (n={int((yy==0).sum()):,})")):
        ax.hist(p[mask], bins=bins, density=True, color=color, alpha=0.55,
                edgecolor=SURFACE, linewidth=1.2, label=label)
    ax.grid(True, color=GRID, linewidth=0.6)
    ax.set_axisbelow(True)
    for s in ("top", "right"):
        ax.spines[s].set_visible(False)
    ax.set_xlabel("Calibrated plausibility")
    ax.set_ylabel("Density")
    ax.legend(frameon=False, loc="upper center")
    fig.suptitle("Held-out real outcomes, never used in training", x=0.02, y=0.99, ha="left",
                 fontsize=11, fontweight="bold")
    fig.text(0.02, 0.90, f"ORD non-USPTO reactions  ·  ROC-AUC {auc:.3f}  ·  "
                         f"median {med_f:.2f} failed vs {med_w:.2f} worked", ha="left", color=INK2)
    fig.subplots_adjust(left=0.1, right=0.97, top=0.8, bottom=0.14)
    fig.savefig(OUT_PNG, facecolor=SURFACE)
    print(f"  wrote {OUT_JSON.name} and {OUT_PNG.name}")


if __name__ == "__main__":
    main()
