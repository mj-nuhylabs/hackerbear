"""Is the plausibility model learning chemistry, or just counting atoms?

Fits a deliberately dumb baseline on trivial descriptors (atom counts, ring counts,
mass differences) with the same scaffold-grouped split. If that scores close to the
real model's 0.939, the fingerprint model is adding little and the AUC is mostly an
artifact of how decoys are built.
"""
import sys

import numpy as np
import pandas as pd
from rdkit import Chem, RDLogger
from rdkit.Chem import Descriptors

RDLogger.DisableLog("rdApp.*")
N_GROUPS = int(sys.argv[1]) if len(sys.argv) > 1 else 6000
DS = "/Users/mj/Desktop/HackFM/backend/data/ml/dataset.parquet"


def feats(rxn: str):
    try:
        r, p = rxn.split(">>")
    except ValueError:
        return None
    pm = Chem.MolFromSmiles(p)
    rms = [Chem.MolFromSmiles(x) for x in r.split(".")]
    if pm is None or any(m is None for m in rms):
        return None
    ha_p = pm.GetNumHeavyAtoms()
    ha_r = [m.GetNumHeavyAtoms() for m in rms]
    mw_p = Descriptors.MolWt(pm)
    mw_r = [Descriptors.MolWt(m) for m in rms]
    ri_p = pm.GetRingInfo().NumRings()
    ri_r = sum(m.GetRingInfo().NumRings() for m in rms)
    return [
        ha_p, sum(ha_r), max(ha_r), ha_p - sum(ha_r), ha_p - max(ha_r),
        mw_p, sum(mw_r), mw_p - sum(mw_r), mw_p - max(mw_r),
        ri_p, ri_r, ri_p - ri_r, len(rms),
        Descriptors.NumHAcceptors(pm), Descriptors.NumHDonors(pm),
    ]


def main():
    ds = pd.read_parquet(DS, columns=["rxn", "label", "group"])
    rng = np.random.default_rng(0)
    groups = ds.group.unique()
    pick = set(rng.choice(groups, size=min(N_GROUPS, len(groups)), replace=False))
    sub = ds[ds.group.isin(pick)].reset_index(drop=True)
    print(f"sample: {len(sub):,} rows from {len(pick):,} scaffold groups "
          f"({(sub.label==1).sum():,} pos / {(sub.label==0).sum():,} neg)")

    X, y, g = [], [], []
    for rxn, lab, grp in zip(sub.rxn, sub.label, sub.group):
        f = feats(rxn)
        if f:
            X.append(f); y.append(lab); g.append(grp)
    X = np.array(X, dtype=np.float32); y = np.array(y); g = np.array(g)
    print(f"featurized {len(X):,} rows with {X.shape[1]} trivial descriptors")

    from lightgbm import LGBMClassifier
    from sklearn.metrics import roc_auc_score
    from sklearn.model_selection import GroupShuffleSplit
    tr, te = next(GroupShuffleSplit(1, train_size=0.7, random_state=0).split(X, groups=g))
    m = LGBMClassifier(random_state=0, n_jobs=2, verbose=-1).fit(X[tr], y[tr])
    auc = roc_auc_score(y[te], m.predict_proba(X[te])[:, 1])
    print(f"\nDUMB BASELINE (atom/ring/mass counts only): ROC-AUC {auc:.4f}")
    print(f"REAL MODEL (DRFP 2048-bit fingerprint):      ROC-AUC 0.9390")
    print(f"  gap: {0.9390 - auc:+.4f}")

    names = ["ha_prod", "ha_reac_sum", "ha_reac_max", "ha_diff_sum", "ha_diff_max",
             "mw_prod", "mw_reac_sum", "mw_diff_sum", "mw_diff_max",
             "rings_prod", "rings_reac", "rings_diff", "n_reactants", "hba", "hbd"]
    imp = sorted(zip(names, m.feature_importances_), key=lambda kv: -kv[1])[:5]
    print("  dumb model leans on:", ", ".join(f"{n}" for n, _ in imp))


if __name__ == "__main__":
    main()
