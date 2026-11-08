"""Canonical ORD index — one row per ORD record, every molecule in RDKit canonical form.

The recorded-route search (evidence/recorded_routes.py), the patent reference routes that
Model B learns from, and the deep demo builder all ask the same question: "which recorded
reactions produce this molecule?" That needs products and reactants written the same way
as AiZynthFinder writes them, so this canonicalises every record once and saves it.

Nothing is inferred here. A record's molecules are the ones ORD lists; we only rewrite
their SMILES. Two flags are computed:

  product_main  the largest fragment of the recorded product (salts are written as
                "drug.CS(=O)(=O)O" — the drug is the product a chemist means)
  is_noop       the product's main fragment already appears among the reactants, so no
                bond was formed: salt formations, recrystallisations, free-basing.
                These are real records but they are not synthesis steps.

    .venv/bin/python -I scripts/build_ord_canon.py [--limit N]

Writes backend/data/ord_canon.parquet.
"""
from __future__ import annotations

import argparse
import os
import sys
import time
from multiprocessing import Pool
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
ORD_FLAT = ROOT / "backend/data/ord_flat.parquet"
OUT = ROOT / "backend/data/ord_canon.parquet"
WORKERS = os.cpu_count() or 4
CHUNK = 5000

COLUMNS = ["reaction_id", "dataset_id", "dataset_name", "reactants", "product", "yield_pct",
           "temperature_c", "time_h", "solvents", "catalysts", "reagents", "patent", "doi",
           "publication_url"]


def log(m: str):
    print(f"[{time.strftime('%H:%M:%S')}] {m}", flush=True)


def _canon_one(smi: str):
    from rdkit import Chem
    m = Chem.MolFromSmiles(smi)
    if m is None:
        return None, None, 0
    for a in m.GetAtoms():
        a.SetAtomMapNum(0)
    return Chem.MolToSmiles(m), Chem.MolToSmiles(m, isomericSmiles=False), m.GetNumHeavyAtoms()


def _chunk(rows):
    from rdkit import RDLogger
    RDLogger.DisableLog("rdApp.*")
    cache: dict[str, tuple] = {}

    def c(s):
        if s not in cache:
            cache[s] = _canon_one(s)
        return cache[s]

    out = []
    for reac, prod in rows:
        if not isinstance(reac, str) or not isinstance(prod, str) or not reac or not prod:
            out.append(None)
            continue
        r = [c(x) for x in reac.split(".") if x]
        p = [c(x) for x in prod.split(".") if x]
        if not r or not p or any(x[0] is None for x in p):
            out.append(None)
            continue
        r = [x for x in r if x[0] is not None]
        main = max(p, key=lambda x: x[2])
        r_flat = {x[1] for x in r}
        out.append((
            [x[0] for x in r],
            [x[1] for x in r],
            ".".join(x[0] for x in p),
            main[0],
            main[1],
            main[2],
            main[1] in r_flat,
        ))
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--out", default=str(OUT))
    a = ap.parse_args()

    log(f"reading {ORD_FLAT.name}")
    df = pd.read_parquet(ORD_FLAT, columns=COLUMNS)
    if a.limit:
        df = df.sample(a.limit, random_state=0)
    log(f"  rows: {len(df):,}")

    pairs = list(zip(df.reactants.tolist(), df["product"].tolist()))
    chunks = [pairs[i:i + CHUNK] for i in range(0, len(pairs), CHUNK)]
    log(f"canonicalising ({WORKERS} workers, {len(chunks)} chunks)")
    t0 = time.time()
    with Pool(WORKERS) as pool:
        res = [x for part in pool.imap(_chunk, chunks, chunksize=1) for x in part]
    log(f"  done in {time.time() - t0:.0f} s")

    ok = np.array([x is not None for x in res])
    df = df[ok].reset_index(drop=True)
    res = [x for x in res if x is not None]
    df["reactants_can"] = [x[0] for x in res]
    df["reactants_flat"] = [x[1] for x in res]
    df["product_can"] = [x[2] for x in res]
    df["product_main"] = [x[3] for x in res]
    df["product_main_flat"] = [x[4] for x in res]
    df["product_heavy_atoms"] = np.array([x[5] for x in res], dtype=np.int16)
    df["is_noop"] = np.array([x[6] for x in res], dtype=bool)
    bad = df.yield_pct.notna() & ((df.yield_pct <= 0) | (df.yield_pct > 100))
    df.loc[bad, "yield_pct"] = np.nan
    df = df.drop(columns=["reactants", "product"])
    log(f"  readable records: {len(df):,}  no-op (salt/recrystallisation): {int(df.is_noop.sum()):,}  "
        f"with patent: {int(df.patent.notna().sum()):,}")
    df.to_parquet(a.out, index=False)
    log(f"wrote {a.out}")


if __name__ == "__main__":
    main()
