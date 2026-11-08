"""Training data for Model A — which recorded procedure to adapt to a step.

    .venv/bin/python -I scripts/build_transfer_dataset.py --stage rows
    .venv/bin/python -I scripts/build_transfer_dataset.py --stage pairs [--queries 150000] [--workers 4]

rows   one pass over the analog index (backend/data/analogs/, 756,776 distinct ORD reactions):
       per-row fingerprints, descriptors, record metadata and the recorded condition set
       (model/transfer_features.py). Writes backend/data/transfer/*.npy + rows.parquet.

pairs  sample query reactions; describe each by its substrates and product only (what a route
       step gives us); retrieve its nearest recorded reactions by DRFP Tanimoto exactly as
       evidence/analogs.py does; drop the query itself, any record from the query's patent
       (patents copy one procedure across many examples — keeping them would teach the model to
       spot the copy) and anything model/holdout.py flags; keep the top K. Label each candidate
       0–3 by how closely its recorded conditions match the query's own recorded conditions.
       Split by product Murcko scaffold, 70/15/15, as model/train.py does.
       Writes backend/data/transfer/pairs_{train,val,test}.npz.

The label is what was recorded for the query; the query's conditions are never a feature.
"""
from __future__ import annotations

import argparse
import hashlib
import os
import sys
import time
from multiprocessing import Pool
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from model import transfer_features as tf  # noqa: E402

ANALOGS = ROOT / "backend/data/analogs"
OUT = tf.TRANSFER
CHUNK = 4000
K = 50
OVERFETCH = 40


def log(m: str):
    print(f"[{time.strftime('%H:%M:%S')}] {m}", flush=True)


# ------------------------------------------------------------------ rows
def _components(x) -> list[str]:
    if x is None or (isinstance(x, float) and np.isnan(x)):
        return []
    return [tf.canon_component(s) for s in str(x).split(".") if s]


def _rows_chunk(items):
    from rdkit import Chem, RDLogger
    RDLogger.DisableLog("rdApp.*")
    from model.featurize import normalize_rxn
    from model.holdout import held_out_molecules, is_held_out
    held = held_out_molecules()

    out = []
    for rxn, solv, cat, reag in items:
        left, _, right = rxn.partition(">>")
        lm = [(s, Chem.MolFromSmiles(s)) for s in left.split(".") if s]
        rm = [(s, Chem.MolFromSmiles(s)) for s in right.split(".") if s]
        lm = [(s, m) for s, m in lm if m is not None]
        rm = [(s, m) for s, m in rm if m is not None]
        if not lm or not rm:
            out.append(None)
            continue
        iso = {Chem.MolToSmiles(m, isomericSmiles=False): s for s, m in lm}
        p_iso, p_mol = max(rm, key=lambda x: x[1].GetNumHeavyAtoms())
        p_flat = Chem.MolToSmiles(p_mol, isomericSmiles=False)
        subs, others, _ = tf.describe_reaction(list(iso), p_flat)
        cond = sorted(set(others) | set(_components(solv)) | set(_components(cat)) | set(_components(reag)))
        s1 = Chem.MolFromSmiles(subs[0]) if subs else None
        s2 = Chem.MolFromSmiles(subs[1]) if len(subs) > 1 else None
        q = normalize_rxn(".".join(iso[s] for s in subs) + ">>" + p_iso) if subs else None
        held_out = is_held_out(p_flat) or any(s in held for s in subs)
        out.append((tf.packed_fp(p_mol), tf.packed_fp(s1), tf.packed_fp(s2), s2 is not None,
                    tf.descriptors(p_mol), len(subs), cond, tf.scaffold(p_mol), q, held_out))
    return out


def stage_rows(workers: int):
    OUT.mkdir(parents=True, exist_ok=True)
    meta = pd.read_parquet(ANALOGS / "reactions.parquet")
    log(f"rows: {len(meta):,} analog index reactions, {workers} workers")
    items = list(zip(meta.rxn, meta.solvents, meta.catalysts, meta.reagents))
    chunks = [items[i:i + CHUNK] for i in range(0, len(items), CHUNK)]
    t0 = time.time()
    res = []
    with Pool(workers) as pool:
        for n, part in enumerate(pool.imap(_rows_chunk, chunks, chunksize=1), 1):
            res.extend(part)
            if n % 20 == 0:
                log(f"  {n}/{len(chunks)} chunks, {time.time() - t0:.0f} s")
    N = len(res)
    zero = np.zeros(tf.N_BYTES, dtype=np.uint8)
    nan_desc = np.full(len(tf.DESC_NAMES), np.nan, dtype=np.float32)
    ok = np.array([r is not None for r in res])
    fp_prod = np.stack([r[0] if r else zero for r in res])
    fp_sub1 = np.stack([r[1] if r else zero for r in res])
    fp_sub2 = np.stack([r[2] if r else zero for r in res])
    has_sub2 = np.array([bool(r and r[3]) for r in res])
    desc = np.stack([r[4] if r else nan_desc for r in res]).astype(np.float32)

    vocab: dict[str, int] = {}
    ptr = np.zeros(N + 1, dtype=np.int64)
    ids: list[int] = []
    for i, r in enumerate(res):
        for c in (r[6] if r else []):
            ids.append(vocab.setdefault(c, len(vocab)))
        ptr[i + 1] = len(ids)
    for i in range(N):                      # sorted ids per row (jaccard_matrix needs unique values)
        seg = np.unique(np.array(ids[ptr[i]:ptr[i + 1]], dtype=np.int32))
        ids[ptr[i]:ptr[i] + len(seg)] = seg.tolist()
    cond_ids = np.array(ids, dtype=np.int32)
    n_cond = np.diff(ptr).astype(np.float32)

    def col(c):
        return pd.to_numeric(meta[c], errors="coerce").to_numpy(dtype=np.float32)

    meta_arr = np.column_stack([
        col("n_records"), col("n_yields"), col("yield_median"), col("temperature_c"), col("time_h"),
        meta.solvents.notna().to_numpy(np.float32), meta.catalysts.notna().to_numpy(np.float32),
        meta.patent.notna().to_numpy(np.float32),
        np.array([r[5] if r else 0 for r in res], dtype=np.float32), n_cond,
    ]).astype(np.float32)

    for name, arr in [("fp_prod", fp_prod), ("fp_sub1", fp_sub1), ("fp_sub2", fp_sub2), ("has_sub2", has_sub2),
                      ("desc", desc), ("meta", meta_arr), ("cond_ptr", ptr), ("cond_ids", cond_ids)]:
        np.save(OUT / f"{name}.npy", arr)
    pd.DataFrame({
        "ok": ok,
        "patent": meta.patent.values,
        "scaffold": [r[7] if r else None for r in res],
        "query_rxn": [r[8] if r else None for r in res],
        "held_out": [bool(r[9]) if r else False for r in res],
    }).to_parquet(OUT / "rows.parquet", index=False)
    pd.Series(list(vocab)).to_frame("component").to_parquet(OUT / "cond_vocab.parquet", index=False)
    log(f"  wrote rows: ok={int(ok.sum()):,}  held out={sum(bool(r and r[9]) for r in res):,}  "
        f"cond vocab={len(vocab):,}  rows with cond={int((n_cond > 0).sum()):,}  {time.time() - t0:.0f} s")


# ------------------------------------------------------------------ pairs
_W: dict = {}


def _init_worker():
    import scipy.sparse as sp
    X = sp.load_npz(ANALOGS / "fingerprints.npz").astype(np.float32).tocsr()
    _W["X"] = X
    _W["XT"] = X.T.tocsr()
    _W["bits"] = np.asarray(X.sum(axis=1)).ravel().astype(np.float32)
    _W["store"] = tf.load_store(mmap=True)
    rows = pd.read_parquet(OUT / "rows.parquet", columns=["patent", "held_out"])
    _W["patent"] = rows.patent.values
    _W["held_out"] = rows.held_out.values.astype(bool)


def _pairs_batch(batch):
    from model.featurize import featurize
    qrows, qrxns = batch
    st, X = _W["store"], _W["X"]
    Q = featurize(list(qrxns), "drfp")
    Q.data[:] = 1.0
    Q = Q.astype(np.float32)
    inter = (Q @ _W["XT"]).toarray()                      # float32: 64 x 756k = 194 MB per batch
    qb = np.asarray(Q.sum(axis=1)).ravel().astype(np.float32)[:, None]
    S = inter / (qb + _W["bits"][None, :] - inter + np.float32(1e-9))
    del inter
    temps = st["meta"][:, 3]
    feats, labels, groups, qids, cands = [], [], [], [], []
    for j, qr in enumerate(qrows):
        row = S[j]
        kk = K + OVERFETCH
        best = np.argpartition(-row, kk - 1)[:kk]
        best = best[np.argsort(-row[best])]
        qp = _W["patent"][qr]
        keep = [b for b in best
                if b != qr and not _W["held_out"][b] and (qp is None or _W["patent"][b] != qp)][:K]
        if len(keep) < 5:
            continue
        keep = np.array(keep)
        sims = row[keep].astype(np.float32)
        q = {"fp_prod": st["fp_prod"][qr], "fp_sub1": st["fp_sub1"][qr], "fp_sub2": st["fp_sub2"][qr],
             "has_sub2": bool(st["has_sub2"][qr]), "desc": st["desc"][qr],
             "n_substrates": float(st["meta"][qr, 8])}
        F = tf.pair_features(q, keep, sims, st)
        y = tf.relevance(st["cond_ids"][st["cond_ptr"][qr]:st["cond_ptr"][qr + 1]],
                         tf.cond_sets(keep, st["cond_ptr"], st["cond_ids"]),
                         float(temps[qr]), temps[keep])
        feats.append(F)
        labels.append(y)
        groups.append(len(keep))
        qids.append(qr)
        cands.append(keep)
    if not feats:
        return None
    return np.vstack(feats), np.concatenate(labels), np.array(groups), np.array(qids), np.concatenate(cands)


def _split_of(scaffold: str) -> str:
    h = int(hashlib.md5((scaffold or "").encode()).hexdigest(), 16) % 100
    return "train" if h < 70 else ("val" if h < 85 else "test")


def stage_pairs(n_queries: int, workers: int, batch: int):
    rows = pd.read_parquet(OUT / "rows.parquet")
    meta = np.load(OUT / "meta.npy", mmap_mode="r")
    eligible = np.flatnonzero(rows.ok.values & ~rows.held_out.values & rows.query_rxn.notna().values
                              & (meta[:, 9] > 0))
    rng = np.random.default_rng(0)
    pick = np.sort(rng.choice(eligible, size=min(n_queries, len(eligible)), replace=False))
    split = np.array([_split_of(s) for s in rows.scaffold.values[pick]])
    log(f"pairs: {len(eligible):,} eligible queries, using {len(pick):,} "
        f"(train {int((split == 'train').sum()):,} / val {int((split == 'val').sum()):,} / "
        f"test {int((split == 'test').sum()):,}), K={K}, {workers} workers")
    qrx = rows.query_rxn.values
    for name in ("train", "val", "test"):
        sel = pick[split == name]
        batches = [(sel[i:i + batch], qrx[sel[i:i + batch]]) for i in range(0, len(sel), batch)]
        t0 = time.time()
        parts = []
        with Pool(workers, initializer=_init_worker) as pool:
            for n, r in enumerate(pool.imap(_pairs_batch, batches, chunksize=1), 1):
                if r is not None:
                    parts.append(r)
                if n % 25 == 0 or n == len(batches):
                    el = time.time() - t0
                    log(f"  {name}: {n}/{len(batches)} batches, {el:.0f} s, ETA {el / n * (len(batches) - n):.0f} s")
        X = np.vstack([p[0] for p in parts])
        y = np.concatenate([p[1] for p in parts])
        g = np.concatenate([p[2] for p in parts])
        np.savez(OUT / f"pairs_{name}.npz", X=X, y=y, group=g,
                 qid=np.concatenate([p[3] for p in parts]), cand=np.concatenate([p[4] for p in parts]),
                 names=np.array(tf.PAIR_NAMES))
        log(f"  wrote pairs_{name}.npz: {len(g):,} queries, {len(y):,} pairs, label mean {y.mean():.2f}, "
            f"queries with a rel>=2 candidate: {np.mean([x.max() >= 2 for x in np.split(y, np.cumsum(g)[:-1])]):.2%}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--stage", required=True, choices=["rows", "pairs"])
    ap.add_argument("--queries", type=int, default=150_000)
    ap.add_argument("--workers", type=int, default=max(1, (os.cpu_count() or 4) // 2))
    ap.add_argument("--batch", type=int, default=64)
    a = ap.parse_args()
    if a.stage == "rows":
        stage_rows(a.workers)
    else:
        stage_pairs(a.queries, a.workers, a.batch)


if __name__ == "__main__":
    main()
