"""Molecules that appear on the reactant side of thousands of unrelated ORD records.

These are reagents in practice (bases, acids, coupling agents, catalysts, solvents written as
reactants). evidence/recorded_routes.substrates_of reads this list so it does not chase them as
intermediates and model/transfer_features counts them as conditions. Counted, not chosen:
a molecule is listed if it is a reactant in >= MIN_RECORDS records.

    .venv/bin/python -I scripts/build_frequent_reactants.py
"""
from collections import Counter
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
MIN_RECORDS = 5000
df = pd.read_parquet(ROOT / "backend/data/ord_canon.parquet", columns=["reactants_flat", "is_noop"])
df = df[~df.is_noop]
c = Counter(m for rs in df.reactants_flat for m in set(rs))
top = [(m, n) for m, n in c.most_common() if n >= MIN_RECORDS]
out = ROOT / "backend/data/frequent_reactants.tsv"
out.write_text("smiles\trecords\n" + "".join(f"{m}\t{n}\n" for m, n in top))
print(f"{len(df):,} records, {len(c):,} distinct reactant molecules, {len(top)} with >= {MIN_RECORDS} records")
for m, n in top[:25]: print(f"  {n:7d}  {m}")
print("  ...")
for m, n in top[-25:]: print(f"  {n:7d}  {m}")
