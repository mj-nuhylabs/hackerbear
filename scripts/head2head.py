"""Score the SAME held-out rows with both models.

The two metrics.json files were measured on different test sets, so their AUCs
cannot be compared. This reproduces the big run's split and scores it with both
the big model and the archived 50k baseline.
"""
import pickle
import sys

import numpy as np
import pandas as pd
import scipy.sparse as sp

sys.path.insert(0, "/Users/mj/Desktop/HackFM/backend")
D = "/Users/mj/Desktop/HackFM/backend/data"

ds = pd.read_parquet(f"{D}/ml/dataset.parquet", columns=["rxn", "label", "group", "corpus"])
X = sp.load_npz(f"{D}/ml/X_drfp.npz")
y = ds.label.to_numpy()
print(f"dataset {X.shape[0]:,} rows")

from sklearn.model_selection import GroupShuffleSplit          # noqa: E402
g = ds.group.to_numpy()
idx = np.arange(len(g))
tr, rest = next(GroupShuffleSplit(1, train_size=0.6, random_state=0).split(idx, groups=g))
a, b = next(GroupShuffleSplit(1, train_size=0.5, random_state=0).split(rest, groups=g[rest]))
te = rest[b]
print(f"test split {len(te):,} rows ({(y[te]==1).sum():,} pos / {(y[te]==0).sum():,} neg)")

# the 50k baseline trained on USPTO-50K positives — how much of this test set did it see?
u = pd.concat([pd.read_parquet(p) for p in
               sorted(__import__("pathlib").Path(f"{D}/uspto50k").glob("*.parquet"))])
from model.featurize import normalize_rxn                      # noqa: E402
seen = {n for n in (normalize_rxn(s) for s in u.rxn_smiles) if n}
test_rxns = ds.rxn.to_numpy()[te]
contam = np.fromiter((r in seen for r in test_rxns), bool, len(te))
print(f"of those, seen by the 50k baseline during training: {contam.sum():,}")

from sklearn.metrics import roc_auc_score                      # noqa: E402
Xte, yte = X[te], y[te]
for name, path in (("ord_all (1.33M)", f"{D}/model.pkl"),
                   ("uspto50k (50k)", f"{D}/runs/uspto50k/model.pkl")):
    with open(path, "rb") as f:
        m = pickle.load(f)["model"]
    p = m.predict_proba(Xte)[:, 1]
    auc = roc_auc_score(yte, p)
    clean = ~contam
    auc_clean = roc_auc_score(yte[clean], p[clean])
    print(f"  {name:18s} ROC-AUC {auc:.4f}   (excluding rows it saw: {auc_clean:.4f}, n={clean.sum():,})")

# per corpus, to see where the difference lives
corp = ds.corpus.to_numpy()[te]
print("\nby corpus (big model):")
with open(f"{D}/model.pkl", "rb") as f:
    big = pickle.load(f)["model"]
pb = big.predict_proba(Xte)[:, 1]
with open(f"{D}/runs/uspto50k/model.pkl", "rb") as f:
    small = pickle.load(f)["model"]
ps = small.predict_proba(Xte)[:, 1]
for c in np.unique(corp):
    m_ = corp == c
    if len(np.unique(yte[m_])) == 2:
        print(f"  {c:10s} n={m_.sum():>7,}  big {roc_auc_score(yte[m_], pb[m_]):.4f}  "
              f"small {roc_auc_score(yte[m_], ps[m_]):.4f}")
