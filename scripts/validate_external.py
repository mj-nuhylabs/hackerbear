"""External validation: does a model trained on decoys also score **truly failed reactions** low?

The training negatives are decoys we generated from templates. So a test AUC of 0.94 means
"it separates our fakes from the real thing", not that it predicts whether an experiment will work.
This script asks that question separately.

Data: non-USPTO ORD records (HTE, literature, ELN). The same reaction is recorded under multiple conditions.
  failure  max yield over all recorded conditions < FAIL_PCT       -> the reaction did not work
  success  max yield >= WORK_PCT                                    -> it worked under some condition

Note: this counts only "failed under all conditions", not "failed under a given condition". Our model does not look at conditions,
so asking about per-condition failure would be a question it cannot answer in the first place.

Contamination check: reactions overlapping the training positives (data/ml/positives_*.parquet) are counted and reported separately.

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
# These reactions must be removed from training for the external validation to hold. train.py reads this file and excludes them from the positives.
HOLDOUT = ROOT / "backend/data/external_holdout.txt"
FAIL_PCT, WORK_PCT = 5.0, 20.0

SURFACE, INK, INK2, GRID = "#fcfcfb", "#0b0b0b", "#52514e", "#e4e3df"
WORKED, FAILED = "#2a78d6", "#eb6834"


def main():
    d = pd.read_parquet(ORD_FLAT, columns=["dataset_name", "rxn_smiles", "yield_pct"])
    d = d[~d.dataset_name.fillna("").str.startswith("uspto")]
    d = d.dropna(subset=["rxn_smiles", "yield_pct"])

    # **Normalize first, then group.** Grouping on raw SMILES scatters the same reaction across
    # several groups because of notation differences, and then we look only at one group's max yield and
    # wrongly call it "failed under all conditions". In fact 8 cases were in both failure and success at once.
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

    # Leave a holdout list so the next training run does not memorize these (train.py reads it)
    HOLDOUT.write_text("\n".join(rxns))
    print(f"  wrote {HOLDOUT.name} ({len(rxns):,} reactions to keep out of training)")

    # Contamination check: overlap with the rows **the current model.pkl actually trained on**.
    # positives_*.parquet are "candidates for the next training run", not what this model saw. Measuring against them
    # would count data it has not been trained on as contamination. The rows it really saw are in ml/dataset.parquet.
    seen = None
    ds_path = ROOT / "backend/data/ml/dataset.parquet"
    if ds_path.exists():
        ds = pd.read_parquet(ds_path, columns=["rxn", "label"])
        seen = set(ds.loc[ds.label == 1, "rxn"])
    contaminated = sum(1 for r in rxns if r in seen) if seen is not None else None
    print(f"  overlap with THIS model's training positives: "
          f"{'unknown (ml/dataset.parquet missing)' if contaminated is None else f'{contaminated:,} of {len(rxns):,}'}")
    # For reference: overlap with the next training candidates. Should be 0 once the holdout is applied.
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
        # Overlap with rows the model being measured actually trained on. 0 means a clean holdout.
        "overlap_with_this_model_training": contaminated,
        # Overlap with the next training candidate set (for reference). Becomes 0 because train.py drops them via external_holdout.txt.
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
