"""Build the analog retrieval index from ORD.

For every step of a proposed route we want the closest reactions anyone has actually
run, so the conditions, the yield and the sources shown beside that step are records
rather than assumptions. This builds the index those lookups read.

What goes in: ORD reactions that carry at least one value worth showing — a usable
yield, a temperature, a time or a solvent. A record with none of those tells a chemist
nothing, and keeping it would only crowd the neighbours.

Records are grouped by normalized reaction, so one row is one distinct reaction with
everything recorded about it: how many times it appears, the spread of reported yields,
and the first conditions and source found. The spread matters — the same reaction run
five times at 40-80% is a different thing from one run at 60%.

Fingerprints are DRFP, the same featurizer model/ uses, so an index row and a route step
are described the same way. Similarity is Tanimoto over those bits, computed at lookup.

    .venv/bin/python -I scripts/build_analog_index.py [--limit N] [--out DIR]

Writes <out>/fingerprints.npz and <out>/reactions.parquet (default backend/data/analogs/).
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
from multiprocessing import Pool
from pathlib import Path

import numpy as np
import pandas as pd
import scipy.sparse as sp

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from model.featurize import featurize, normalize_rxn  # noqa: E402

ORD_FLAT = ROOT / "backend/data/ord_flat.parquet"
OUT = ROOT / "backend/data/analogs"
WORKERS = os.cpu_count() or 4
CHUNK = 2000
MAX_IDS = 5          # reaction ids kept per distinct reaction — enough to cite, not a dump

COLUMNS = ["reaction_id", "dataset_id", "rxn_smiles", "yield_pct", "temperature_c",
           "time_h", "solvents", "catalysts", "reagents", "patent", "doi",
           "publication_url", "organization"]


def log(m: str):
    print(f"[{time.strftime('%H:%M:%S')}] {m}", flush=True)


def _norm_chunk(xs):
    return [normalize_rxn(s) for s in xs]


def _feat_chunk(xs):
    return featurize(xs, "drfp")


def par(fn, items, chunk=CHUNK):
    """Map fn over chunks across all cores. Small inputs stay in-process."""
    if len(items) < 4 * chunk:
        return [fn(items)]
    chunks = [items[i:i + chunk] for i in range(0, len(items), chunk)]
    with Pool(WORKERS) as pool:
        return pool.map(fn, chunks)


def first(s: pd.Series):
    """First value that is actually there, else None."""
    s = s.dropna()
    return s.iloc[0] if len(s) else None


def load(limit: int = 0) -> pd.DataFrame:
    log(f"reading {ORD_FLAT.name}")
    df = pd.read_parquet(ORD_FLAT, columns=COLUMNS).dropna(subset=["rxn_smiles"])
    log(f"  rows: {len(df):,}")

    # A usable yield means the same thing here as in provenance.reported_yield():
    # ORD holds records outside 0-100 and they are errors, not measurements.
    bad_yield = df.yield_pct.notna() & ((df.yield_pct <= 0) | (df.yield_pct > 100))
    df.loc[bad_yield, "yield_pct"] = np.nan
    log(f"  yields dropped as out of range: {int(bad_yield.sum()):,}")

    keep = (df.yield_pct.notna() | df.temperature_c.notna()
            | df.time_h.notna() | df.solvents.notna())
    df = df[keep]
    log(f"  rows carrying a yield, temperature, time or solvent: {len(df):,}")
    if limit and len(df) > limit:
        df = df.sample(limit, random_state=0)
        log(f"  limited to: {len(df):,}")
    return df


def group(df: pd.DataFrame) -> pd.DataFrame:
    log(f"normalizing ({WORKERS} workers)")
    t0 = time.time()
    df = df.assign(rxn=[r for part in par(_norm_chunk, df.rxn_smiles.tolist()) for r in part])
    df = df.dropna(subset=["rxn"])
    log(f"  normalized in {time.time() - t0:.0f} s, {len(df):,} rows readable by RDKit")

    log("grouping by reaction")
    t0 = time.time()
    g = df.groupby("rxn", sort=False)
    out = pd.DataFrame({
        "n_records": g.size(),
        "n_yields": g.yield_pct.count(),
        "yield_median": g.yield_pct.median(),
        "yield_min": g.yield_pct.min(),
        "yield_max": g.yield_pct.max(),
        "temperature_c": g.temperature_c.apply(first),
        "time_h": g.time_h.apply(first),
        "solvents": g.solvents.apply(first),
        "catalysts": g.catalysts.apply(first),
        "reagents": g.reagents.apply(first),
        "patent": g.patent.apply(first),
        "doi": g.doi.apply(first),
        "url": g.publication_url.apply(first),
        "organization": g.organization.apply(first),
        "dataset_id": g.dataset_id.apply(first),
        "reaction_ids": g.reaction_id.apply(lambda s: list(s.dropna()[:MAX_IDS])),
    }).reset_index()
    log(f"  {len(out):,} distinct reactions in {time.time() - t0:.0f} s "
        f"({len(df) / max(len(out), 1):.1f} records each)")
    return out


def fingerprint(rxns: list[str]) -> sp.csr_matrix:
    log(f"fingerprinting ({WORKERS} workers, drfp)")
    t0 = time.time()
    X = sp.vstack(par(_feat_chunk, rxns), format="csr")
    X.data[:] = 1.0                       # DRFP is a bit vector; keep it one
    log(f"  {X.shape} with {X.nnz / X.shape[0]:.1f} bits per row in {time.time() - t0:.0f} s")
    return X


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=0, help="sample this many records first (0 = all)")
    ap.add_argument("--out", default=str(OUT))
    a = ap.parse_args()
    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)

    meta = group(load(a.limit))
    X = fingerprint(meta.rxn.tolist())

    # Rows with no bits set can never match anything and would divide by zero in Tanimoto.
    bits = np.asarray(X.sum(axis=1)).ravel()
    if (bits == 0).any():
        keep = bits > 0
        log(f"  dropping {int((~keep).sum()):,} reactions whose fingerprint is empty")
        X, meta = X[keep], meta[keep].reset_index(drop=True)

    sp.save_npz(out / "fingerprints.npz", X.astype(np.uint8))
    meta.to_parquet(out / "reactions.parquet", index=False)
    stats = {
        "reactions": int(len(meta)),
        "records": int(meta.n_records.sum()),
        "with_yield": int((meta.n_yields > 0).sum()),
        "with_temperature": int(meta.temperature_c.notna().sum()),
        "with_time": int(meta.time_h.notna().sum()),
        "bits_per_row": round(float(X.nnz / X.shape[0]), 1),
        "built": time.strftime("%Y-%m-%d"),
        "source": "Open Reaction Database (CC BY-SA 4.0)",
    }
    (out / "stats.json").write_text(json.dumps(stats, indent=2))
    log(f"wrote {out}/")
    for k, v in stats.items():
        log(f"  {k}: {v:,}" if isinstance(v, int) else f"  {k}: {v}")


if __name__ == "__main__":
    main()
