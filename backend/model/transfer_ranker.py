"""Model A — rank the recorded procedures nearest a step by how likely they fit this substrate.

The question: of the recorded reactions closest to this step, whose recorded conditions are the
ones a chemist actually used for a substrate like this one? Training pairs come from
scripts/build_transfer_dataset.py: a recorded reaction is the query (described only by its
substrates and product), its nearest recorded neighbours are the candidates, and each candidate
is labelled 0–3 by how well its recorded conditions match the query's own recorded conditions.

The model only orders records that exist. It writes no conditions, amounts or yields; the UI shows
the chosen record's procedure verbatim, with its citation, and code rescales its amounts.

    .venv/bin/python -m model.transfer_ranker --train        (from backend/)

Writes data/transfer_ranker.pkl and data/transfer_ranker_metrics.json. The metrics compare the
model with the order the app uses today (nearest by DRFP similarity), with a consensus-only
order, and with random, on held-out scaffolds. They are reported as measured.
"""
from __future__ import annotations

import argparse
import json
import pickle
import time
from datetime import date
from functools import lru_cache

import numpy as np

from . import transfer_features as tf

MODEL_PATH = tf.DATA / "transfer_ranker.pkl"
METRICS_PATH = tf.DATA / "transfer_ranker_metrics.json"


def log(m: str):
    print(f"[{time.strftime('%H:%M:%S')}] {m}", flush=True)


def _load_split(name: str):
    z = np.load(tf.TRANSFER / f"pairs_{name}.npz", allow_pickle=False)
    return z["X"], z["y"], z["group"]


def _groups(y: np.ndarray, g: np.ndarray):
    return np.split(np.arange(len(y)), np.cumsum(g)[:-1])


def _dcg(rel: np.ndarray, k: int) -> float:
    rel = rel[:k]
    return float(np.sum((2.0 ** rel - 1) / np.log2(np.arange(2, len(rel) + 2))))


def evaluate(scores: np.ndarray, y: np.ndarray, g: np.ndarray, top_sim: np.ndarray | None = None) -> dict:
    """Top-1 relevance and NDCG for one ordering (higher score = shown first)."""
    t1, ndcg1, ndcg5, hit2 = [], [], [], []
    for idx in _groups(y, g):
        order = idx[np.argsort(-scores[idx], kind="stable")]
        rel = y[order].astype(float)
        ideal = np.sort(y[idx].astype(float))[::-1]
        t1.append(rel[0])
        hit2.append(rel[0] >= 2)
        d1, d5 = _dcg(ideal, 1), _dcg(ideal, 5)
        ndcg1.append(_dcg(rel, 1) / d1 if d1 else np.nan)
        ndcg5.append(_dcg(rel, 5) / d5 if d5 else np.nan)
    t1, hit2 = np.array(t1), np.array(hit2)
    out = {
        "queries": int(len(t1)),
        "top1_relevance_mean": round(float(t1.mean()), 4),
        "top1_relevance_ge2_rate": round(float(hit2.mean()), 4),
        "top1_relevance_ge1_rate": round(float((t1 >= 1).mean()), 4),
        "ndcg_at_1": round(float(np.nanmean(ndcg1)), 4),
        "ndcg_at_5": round(float(np.nanmean(ndcg5)), 4),
    }
    if top_sim is not None:
        bands = {}
        for lo, hi in [(0.8, 1.01), (0.6, 0.8), (0.4, 0.6), (0.0, 0.4)]:
            m = (top_sim >= lo) & (top_sim < hi)
            if m.sum():
                bands[f"{lo:.1f}-{min(hi, 1.0):.1f}"] = {"queries": int(m.sum()),
                                                         "top1_relevance_ge2_rate": round(float(hit2[m].mean()), 4)}
        out["by_nearest_similarity"] = bands
    return out


def train():
    import lightgbm as lgb

    names = list(tf.PAIR_NAMES)
    Xtr, ytr, gtr = _load_split("train")
    Xva, yva, gva = _load_split("val")
    Xte, yte, gte = _load_split("test")
    log(f"train {len(gtr):,} queries / {len(ytr):,} pairs; val {len(gva):,}; test {len(gte):,}")
    log(f"label distribution (train): {np.bincount(ytr, minlength=4).tolist()}")

    model = lgb.LGBMRanker(objective="lambdarank", n_estimators=1500, learning_rate=0.05,
                           num_leaves=63, min_child_samples=50, subsample=0.8, subsample_freq=1,
                           colsample_bytree=0.8, n_jobs=6, verbose=-1, random_state=0)
    t0 = time.time()
    model.fit(Xtr, ytr, group=gtr, eval_set=[(Xva, yva)], eval_group=[gva], eval_at=[1, 5],
              feature_name=names,
              callbacks=[lgb.early_stopping(50, verbose=True), lgb.log_evaluation(50)])
    log(f"trained in {time.time() - t0:.0f} s, best iteration {model.best_iteration_}")

    i_sim = names.index("sim")
    i_cons = names.index("cons_wmean")
    starts = np.concatenate([[0], np.cumsum(gte)[:-1]])
    top_sim = Xte[starts, i_sim]
    rng = np.random.default_rng(0)
    methods = {
        "model": model.predict(Xte),
        "nearest_similarity (current app)": Xte[:, i_sim] - 1e-6 * Xte[:, names.index("rank")],
        "consensus_only": Xte[:, i_cons],
        "random": rng.random(len(yte)),
        "oracle (ceiling)": yte.astype(float) + 1e-6 * Xte[:, i_sim],
    }
    test = {k: evaluate(v, yte, gte, top_sim) for k, v in methods.items()}
    # the same numbers on queries where at least one candidate is a real match (rel >= 2)
    has_match = np.array([yte[idx].max() >= 2 for idx in _groups(yte, gte)])
    keep_rows = np.repeat(has_match, gte)
    test_matchable = {k: evaluate(v[keep_rows], yte[keep_rows], gte[has_match]) for k, v in methods.items()}

    imp = model.booster_.feature_importance(importance_type="gain")
    importance = sorted(zip(names, imp.tolist()), key=lambda x: -x[1])
    metrics = {
        "model": "LGBMRanker(lambdarank)",
        "question": "of the nearest recorded reactions, whose recorded conditions match what was recorded for this substrate",
        "label": {"relevance": "0-3 from Jaccard of recorded condition sets (solvents, catalysts, reagents, "
                               "non-substrate reactants) at 0.25/0.5/0.75; minus 1 if both temperatures "
                               f"recorded and differ by > {tf.TEMP_TOLERANCE_C:.0f} C"},
        "candidates": "top 50 by DRFP Tanimoto, excluding the query itself, its patent and held-out demo molecules",
        "split": "query product Murcko scaffold, 70/15/15",
        "train_queries": int(len(gtr)), "val_queries": int(len(gva)), "test_queries": int(len(gte)),
        "best_iteration": int(model.best_iteration_ or model.n_estimators),
        "test": test,
        "test_queries_with_a_match": {"queries": int(has_match.sum()), "results": test_matchable},
        "feature_importance_gain_top15": [[n, round(v, 1)] for n, v in importance[:15]],
        "holdout": "the 5 demo targets and their recorded route molecules (model/holdout.py)",
        "generated": date.today().isoformat(),
    }
    with open(MODEL_PATH, "wb") as fh:
        pickle.dump({"model": model, "features": names, "generated": metrics["generated"]}, fh)
    METRICS_PATH.write_text(json.dumps(metrics, indent=2))
    log(f"wrote {MODEL_PATH.name}, {METRICS_PATH.name}")
    for k, v in test.items():
        log(f"  {k:34s} top1 rel>=2 {v['top1_relevance_ge2_rate']:.3f}  ndcg@1 {v['ndcg_at_1']:.3f}  ndcg@5 {v['ndcg_at_5']:.3f}")


# ------------------------------------------------------------------ inference
@lru_cache(maxsize=1)
def _bundle():
    if not MODEL_PATH.exists():
        return None
    with open(MODEL_PATH, "rb") as fh:
        return pickle.load(fh)


@lru_cache(maxsize=1)
def _store():
    return tf.load_store(mmap=True)


def available() -> bool:
    return _bundle() is not None and (tf.TRANSFER / "fp_prod.npy").exists()


def rank(step_rxn: str, cand_rows: list[int], sims: list[float]) -> list[float] | None:
    """Model A scores for analog index rows retrieved for a step (any order in; scores out, same order).

    None when the model or the row store is missing — the caller keeps similarity order and says so.
    """
    b = _bundle()
    if b is None or not cand_rows:
        return None
    q = tf.query_row(step_rxn)
    if q is None:
        return None
    rows = np.asarray(cand_rows, dtype=np.int64)
    s = np.asarray(sims, dtype=np.float32)
    order = np.argsort(-s, kind="stable")
    F = tf.pair_features(q, rows[order], s[order], _store())
    scores = np.empty(len(rows), dtype=np.float64)
    scores[order] = b["model"].predict(F)
    return scores.tolist()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--train", action="store_true")
    a = ap.parse_args()
    if a.train:
        train()


if __name__ == "__main__":
    main()
