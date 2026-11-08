"""Training script (run once, save pkl).

usage (from backend/):  ../.venv/bin/python -m model.train [--kind drfp|diff] [--k-templates 2000] [--fresh]

Data
  Positive  USPTO-50K (data/uspto50k/*.parquet). source_id = patent number
  Negative  products of applying a different AiZynth template forward to the same reactants
            (up to --max-decoys per positive)
            - template pool: top K by library_occurence, R>>P flipped from P>>R to (R)>>P and run with RDChiral
            - kept if: largest fragment, sanitizes, no radicals, at least 50% of the real product's heavy atoms,
              differs from every recorded product of the same reactant set (ignoring stereo), is not the reactant itself
Split      group split by product Murcko scaffold, train/calib/test = 60/20/20. A decoy follows its own positive's group
Output     data/model.pkl, data/calibrator.pkl, data/calibration.png, data/metrics.json
Cache      data/ml/ (positives -> dataset -> features). --fresh rebuilds
"""
from __future__ import annotations

import argparse
import json
import os
import pickle
import random
import time
from datetime import datetime
from multiprocessing import Pool
from pathlib import Path

import numpy as np
import pandas as pd
import scipy.sparse as sp
from rdkit import Chem, RDLogger
from rdkit.Chem import Descriptors
from rdkit.Chem.Scaffolds import MurckoScaffold

from .featurize import N_BITS, featurize, normalize_rxn
# calibrate (= sklearn) and lightgbm are imported late, inside main().
# So a machine that only runs decoys via --shard needs just rdkit/pandas/scipy.

RDLogger.DisableLog("rdApp.*")

DATA = Path(__file__).resolve().parents[1] / "data"
ML = DATA / "ml"
USPTO50K = DATA / "uspto50k"
ORD_FLAT = DATA / "ord_flat.parquet"
TEMPLATES = DATA / "aizynth/uspto_templates.csv.gz"
SEED = 0
WORKERS = 10
ORD_FAILED_YIELD_PCT = 5.0   # if all recorded yields are below this, it was a failed attempt; drop it from positives


def log(msg: str):
    print(f"[{datetime.now():%H:%M:%S}] {msg}", flush=True)


def _flat(smi: str) -> str | None:
    m = Chem.MolFromSmiles(smi)
    return Chem.MolToSmiles(m, isomericSmiles=False) if m else None


# ---------- 1. positives ----------

def _norm_chunk(rxns: list[str]) -> list[str | None]:
    return [normalize_rxn(s) for s in rxns]


def _normalize_parallel(rxns: list[str]) -> list[str | None]:
    if len(rxns) < 20_000:
        return _norm_chunk(rxns)
    chunks = [rxns[i:i + 5000] for i in range(0, len(rxns), 5000)]
    with Pool(WORKERS) as pool:
        return [r for part in pool.map(_norm_chunk, chunks) for r in part]


def _load_uspto50k() -> pd.DataFrame:
    df = pd.concat([pd.read_parquet(p) for p in sorted(USPTO50K.glob("*.parquet"))], ignore_index=True)
    return pd.DataFrame({"rxn_smiles": df.rxn_smiles, "source_id": df["id"],
                         "rxn_class": df["class"].astype(int), "corpus": "uspto50k"})


def _load_ord() -> pd.DataFrame:
    """Positive candidates from ORD. Reactions whose recorded yields are all below ORD_FAILED_YIELD_PCT are dropped.

    Those are failed attempts, not successful reactions. Using them as positives would make the label a lie.
    ORD has no rxn_class: set to 0 ('unclassified'), which shows up separately in the per-class AUC.
    """
    df = pd.read_parquet(ORD_FLAT, columns=["rxn_smiles", "yield_pct", "patent", "doi", "reaction_id"])
    df = df.dropna(subset=["rxn_smiles"])
    worked = df.groupby("rxn_smiles").yield_pct.transform("max")
    df = df[worked.isna() | (worked >= ORD_FAILED_YIELD_PCT)]
    source = df.patent.fillna(df.doi).fillna(df.reaction_id)
    return pd.DataFrame({"rxn_smiles": df.rxn_smiles, "source_id": source,
                         "rxn_class": 0, "corpus": "ord"})


def load_positives(source: str = "uspto50k") -> pd.DataFrame:
    """source: uspto50k | ord | all. Dedup by normalized SMILES, so overlapping corpora count once."""
    parts = []
    if source in ("uspto50k", "all"):
        parts.append(_load_uspto50k())
    if source in ("ord", "all"):
        parts.append(_load_ord())
    if not parts:
        raise ValueError(f"unknown source {source!r}")
    df = pd.concat(parts, ignore_index=True)
    log(f"  raw candidates: {len(df):,}")
    df["rxn"] = _normalize_parallel(df.rxn_smiles.tolist())
    df = df.dropna(subset=["rxn"])
    # uspto50k comes first, so keep='first' keeps the curated side's class for overlapping reactions
    df = df.drop_duplicates("rxn", keep="first").reset_index(drop=True)
    return df[["rxn", "source_id", "rxn_class", "corpus"]]


# ---------- 2. decoys ----------

_FWD: list | None = None


def _init_templates(k: int):
    global _FWD
    t = pd.read_csv(TEMPLATES, sep="\t", usecols=["retro_template", "library_occurence"])
    _FWD = []
    for rt in t.nlargest(k, "library_occurence").retro_template:
        prod, reac = rt.split(">>")
        q = Chem.MolFromSmarts(reac)
        if q is not None:
            _FWD.append([f"({reac})>>{prod}", q, None])   # rdchiralReaction is built on first use


def _decoys_for(args: tuple[str, frozenset]) -> list[str]:
    from rdchiral.main import rdchiralReactants, rdchiralReaction, rdchiralRun
    rxn, known = args
    reac, prod = rxn.split(">>")
    rmol, pmol = Chem.MolFromSmiles(reac), Chem.MolFromSmiles(prod)
    if rmol is None or pmol is None:
        return []
    min_ha = 0.5 * pmol.GetNumHeavyAtoms()
    reactant_flat = {_flat(s) for s in reac.split(".")}
    rr, out = None, set()
    for entry in _FWD:
        if not rmol.HasSubstructMatch(entry[1]):
            continue
        try:
            if entry[2] is None:
                entry[2] = rdchiralReaction(entry[0])
            if rr is None:
                rr = rdchiralReactants(reac)
            outs = rdchiralRun(entry[2], rr)
        except Exception:
            continue
        for o in outs:
            m = Chem.MolFromSmiles(o)
            if m is None:
                continue
            big = max(Chem.GetMolFrags(m, asMols=True), key=lambda f: f.GetNumHeavyAtoms())
            if big.GetNumHeavyAtoms() < min_ha or Descriptors.NumRadicalElectrons(big):
                continue
            flat = Chem.MolToSmiles(big, isomericSmiles=False)
            if flat in known or flat in reactant_flat:
                continue
            out.add(Chem.MolToSmiles(big))
    return sorted(out)


def _flat_chunk(smis: list[str]) -> list[str | None]:
    return [_flat(s) for s in smis]


def build_dataset(pos: pd.DataFrame, k: int, max_decoys: int, timebox_s: int,
                  rows_idx: np.ndarray | None = None) -> tuple[pd.DataFrame, dict]:
    """Build the set of 'already known products' from all of pos, and generate decoys only for the rows_idx rows.

    Why known is always built from all of pos: even when split into shards, a real product recorded in
    another shard must not come out as a decoy.
    """
    reac = pos.rxn.str.split(">>").str[0].tolist()
    prods = pos.rxn.str.split(">>").str[1].tolist()
    if len(prods) >= 20_000:
        chunks = [prods[i:i + 5000] for i in range(0, len(prods), 5000)]
        with Pool(WORKERS) as pool:
            prod_flat = [p for part in pool.map(_flat_chunk, chunks) for p in part]
    else:
        prod_flat = _flat_chunk(prods)
    known: dict[str, set] = {}
    for r, p in zip(reac, prod_flat):
        known.setdefault(r, set()).add(p)

    idx = np.arange(len(pos)) if rows_idx is None else np.asarray(rows_idx)
    jobs = [(pos.rxn.iat[int(i)], frozenset(known[reac[int(i)]])) for i in idx]

    rng = random.Random(SEED)
    rows, done, n_with = [], 0, 0
    t0 = time.time()
    with Pool(WORKERS, initializer=_init_templates, initargs=(k,)) as pool:
        for j, decoys in enumerate(pool.imap(_decoys_for, jobs, chunksize=32)):
            gi = int(idx[j])
            p = pos.iloc[gi]
            rows.append({"rxn": p.rxn, "label": 1, "parent": gi, "source_id": p.source_id,
                         "rxn_class": p.rxn_class, "corpus": p.corpus})
            if decoys:
                n_with += 1
            for d in rng.sample(decoys, min(max_decoys, len(decoys))):
                rows.append({"rxn": p.rxn.split(">>")[0] + ">>" + d, "label": 0, "parent": gi,
                             "source_id": p.source_id, "rxn_class": p.rxn_class, "corpus": p.corpus})
            done = j + 1
            if done % 5000 == 0:
                rate = done / (time.time() - t0)
                log(f"  decoys: {done:,}/{len(jobs):,} positives, {sum(r['label'] == 0 for r in rows):,} decoys, "
                    f"{rate:.0f}/s, eta {(len(jobs) - done) / rate / 60:.0f} min")
            if time.time() - t0 > timebox_s:
                log(f"  timebox hit after {done:,} positives — the rest are left out")
                pool.terminate()
                break
    ds = pd.DataFrame(rows)
    stats = {"positives_processed": done, "positives_requested": len(jobs), "positives_pool": len(pos),
             "positives_with_decoys": n_with, "decoys": int((ds.label == 0).sum()),
             "templates_k": k, "max_decoys_per_positive": max_decoys, "timebox_hit": done < len(jobs),
             "decoy_seconds": round(time.time() - t0, 1)}
    return ds, stats


# ---------- 3. groups / features ----------

def scaffold_group(rxn: str) -> str:
    prod = rxn.split(">>")[1]
    m = Chem.MolFromSmiles(prod)
    if m is None:
        return "invalid:" + prod
    s = MurckoScaffold.MurckoScaffoldSmiles(mol=m)
    return s if s else "acyclic:" + Chem.MolToSmiles(m)


def _scaffold_chunk(rxns: list[str]) -> list[str]:
    return [scaffold_group(r) for r in rxns]


def scaffold_groups(rxns: list[str]) -> list[str]:
    if len(rxns) < 20_000:
        return _scaffold_chunk(rxns)
    chunks = [rxns[i:i + 5000] for i in range(0, len(rxns), 5000)]
    with Pool(WORKERS) as pool:
        return [g for part in pool.map(_scaffold_chunk, chunks) for g in part]


def _feat_chunk(args):
    rxns, kind = args
    return featurize(rxns, kind)


def build_features(rxns: list[str], kind: str) -> sp.csr_matrix:
    chunks = [(rxns[i:i + 2000], kind) for i in range(0, len(rxns), 2000)]
    out = []
    with Pool(WORKERS) as pool:
        for i, part in enumerate(pool.imap(_feat_chunk, chunks), 1):
            out.append(part)
            if i % 50 == 0:
                log(f"  featurize: {min(i * 2000, len(rxns)):,}/{len(rxns):,}")
    return sp.vstack(out, format="csr")


def split(groups: np.ndarray) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    from sklearn.model_selection import GroupShuffleSplit
    idx = np.arange(len(groups))
    tr, rest = next(GroupShuffleSplit(1, train_size=0.6, random_state=SEED).split(idx, groups=groups))
    a, b = next(GroupShuffleSplit(1, train_size=0.5, random_state=SEED).split(rest, groups=groups[rest]))
    return tr, rest[a], rest[b]


# ---------- main ----------

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--kind", default="drfp", choices=["drfp", "diff"])
    ap.add_argument("--k-templates", type=int, default=2000)
    ap.add_argument("--max-decoys", type=int, default=2)
    ap.add_argument("--timebox-min", type=int, default=60)
    ap.add_argument("--fresh", action="store_true")
    ap.add_argument("--limit", type=int, default=0, help="smoke test: use only the first N positives")
    ap.add_argument("--positives", default="uspto50k", choices=["uspto50k", "ord", "all"])
    ap.add_argument("--max-positives", type=int, default=0, help="0 = all")
    ap.add_argument("--shard", default="", metavar="i/n",
                    help="generate decoys for shard i/n only, save, and exit (for splitting work across machines)")
    ap.add_argument("--merge-shards", action="store_true", help="gather shards into dataset.parquet, then train")
    ap.add_argument("--workers", type=int, default=0, help="0 = CPU cores (differs per machine)")
    a = ap.parse_args()
    global WORKERS
    WORKERS = a.workers or os.cpu_count() or 4
    log(f"workers: {WORKERS}")
    ML.mkdir(parents=True, exist_ok=True)
    shards_dir = ML / "shards"

    ds_path, stats_path = ML / "dataset.parquet", ML / "dataset_stats.json"
    need_pos = a.shard or a.merge_shards or a.fresh or not ds_path.exists()
    if need_pos:
        # Cache the normalization result. Normalizing 2M rows takes minutes, and the second machine needs only this file
        # (no need to move the 1.4GB ORD original).
        pos_cache = ML / f"positives_{a.positives}.parquet"
        if pos_cache.exists() and not a.fresh:
            pos = pd.read_parquet(pos_cache)
            log(f"positives from cache {pos_cache.name}")
        else:
            log(f"loading positives ({a.positives})")
            pos = load_positives(a.positives)
            pos.to_parquet(pos_cache, index=False)
        if a.limit:
            pos = pos.sample(min(a.limit, len(pos)), random_state=SEED).reset_index(drop=True)
        elif a.max_positives and len(pos) > a.max_positives:
            pos = pos.sample(a.max_positives, random_state=SEED).reset_index(drop=True)
        log(f"positives: {len(pos):,} unique reactions  {pos.corpus.value_counts().to_dict()}")

    if a.shard:
        i, n = (int(x) for x in a.shard.split("/"))
        rows_idx = np.arange(len(pos))[i::n]
        log(f"shard {i}/{n}: {len(rows_idx):,} positives of {len(pos):,}")
        ds, stats = build_dataset(pos, a.k_templates, a.max_decoys, a.timebox_min * 60, rows_idx)
        shards_dir.mkdir(exist_ok=True)
        ds.to_parquet(shards_dir / f"decoys_{i}_of_{n}.parquet", index=False)
        (shards_dir / f"decoys_{i}_of_{n}.json").write_text(json.dumps(stats, indent=2))
        log(f"wrote shard {i}/{n} — copy it to the main machine's {shards_dir}/ and run --merge-shards")
        return

    if a.merge_shards:
        files = sorted(shards_dir.glob("decoys_*_of_*.parquet"))
        if not files:
            raise SystemExit(f"no shards in {shards_dir}")
        ds = pd.concat([pd.read_parquet(f) for f in files], ignore_index=True).drop_duplicates(["rxn", "label"])
        parts = [json.loads(f.with_suffix(".json").read_text()) for f in files]
        stats = {"shards": len(files), "positives_processed": sum(p["positives_processed"] for p in parts),
                 "positives_pool": parts[0]["positives_pool"], "decoys": int((ds.label == 0).sum()),
                 "templates_k": parts[0]["templates_k"], "max_decoys_per_positive": parts[0]["max_decoys_per_positive"],
                 "timebox_hit": any(p["timebox_hit"] for p in parts)}
        log(f"merged {len(files)} shards: {len(ds):,} rows")
    elif a.fresh or not ds_path.exists():
        ds, stats = build_dataset(pos, a.k_templates, a.max_decoys, a.timebox_min * 60)
    if a.merge_shards or a.fresh or not ds_path.exists():
        # Remove the whole external-validation holdout. Removing only positives would leave their decoys and skew labels.
        # Done here because a shard's parent indexes the full positive list; filtering earlier would misalign indices.
        holdout_path = DATA / "external_holdout.txt"
        if holdout_path.exists():
            held = set(holdout_path.read_text().split("\n")) - {""}
            bad = set(ds.loc[(ds.label == 1) & ds.rxn.isin(held), "parent"])
            before = len(ds)
            ds = ds[~ds.parent.isin(bad)].reset_index(drop=True)
            log(f"external holdout: dropped {before - len(ds):,} rows ({len(bad):,} positives + their decoys) "
                f"so scripts/validate_external.py stays honest")
            stats["external_holdout_positives"] = len(bad)
        log(f"scaffold groups for {len(ds):,} rows")
        ds["group"] = scaffold_groups(ds.rxn.tolist())
        # a decoy follows its own positive's group
        ds["group"] = ds.groupby("parent").group.transform("first")
        ds.to_parquet(ds_path, index=False)
        stats_path.write_text(json.dumps(stats, indent=2))
    ds, stats = pd.read_parquet(ds_path), json.loads(stats_path.read_text())
    log(f"dataset: {len(ds):,} rows ({(ds.label == 1).sum():,} pos / {(ds.label == 0).sum():,} neg) {stats}")

    X_path = ML / f"X_{a.kind}.npz"
    if a.fresh or not X_path.exists() or sp.load_npz(X_path).shape[0] != len(ds):
        log(f"featurizing ({a.kind}, {N_BITS} bits)")
        sp.save_npz(X_path, build_features(ds.rxn.tolist(), a.kind))
    X = sp.load_npz(X_path)
    log(f"features: {X.shape[0]:,} x {X.shape[1]} CSR, {X.nnz / X.shape[0]:.1f} nnz/row, "
        f"{(X.data.nbytes + X.indices.nbytes + X.indptr.nbytes) / 1e6:.0f} MB")
    y = ds.label.to_numpy()

    tr, ca, te = split(ds.group.to_numpy())
    log(f"split train/calib/test = {len(tr):,}/{len(ca):,}/{len(te):,} rows")

    from lightgbm import LGBMClassifier
    model = LGBMClassifier(random_state=SEED, n_jobs=WORKERS, verbose=-1)
    model.fit(X[tr], y[tr])
    with open(DATA / "model.pkl", "wb") as f:
        pickle.dump({"model": model, "kind": a.kind, "n_bits": N_BITS,
                     "trained_at": datetime.now().isoformat(timespec="seconds")}, f)
    log("saved data/model.pkl")

    meta = {"featurizer": a.kind, "n_bits": N_BITS, "model": "LGBMClassifier (defaults)",
            "split": "product Murcko scaffold groups, 60/20/20",
            "train_n": int(len(tr)), "calib_n": int(len(ca)), "dataset": stats}
    from . import calibrate
    m = calibrate.run(model, X[ca], y[ca], X[te], y[te], ds.rxn_class.to_numpy()[te], meta)
    log(f"test ROC-AUC {m['calibrated']['roc_auc']:.3f} | Brier {m['raw']['brier']:.3f}→{m['calibrated']['brier']:.3f}"
        f" | ECE {m['raw']['ece']:.3f}→{m['calibrated']['ece']:.3f}")
    log("saved data/calibrator.pkl, data/calibration.png, data/metrics.json")


if __name__ == "__main__":
    main()
