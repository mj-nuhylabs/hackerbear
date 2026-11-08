"""Common reagents the ZINC stock leaves out — counted from ORD, not chosen by hand.

ZINC is a virtual-screening library of drug-like compounds. As a "can I buy this?" list for
synthesis it misses the bulk reagents every route uses: ethanol, methanol, MeCN, DCM, MeI, CS2,
cyanamide, NaH, K2CO3, EDC, HATU, Pd(PPh3)4 ... 69 of the 122 molecules ORD records use most.
Without them the route search cannot stop at those molecules, so it "makes" them instead: ethanol
from acetic acid at a recorded 10 %, ethylamine from acetaldoxime, methylamine from methyl
isocyanate. Every route with an ethyl or methyl group pays for that detour.

A molecule is listed here if it is a reactant in >= MIN_RECORDS ORD records from >= MIN_SOURCES
different patents or papers. Being used that widely, by that many groups, is the evidence that it
is bought rather than made. The sources bar keeps out an intermediate that one patent family
reuses in hundreds of examples. This says "commonly bought", not a price: prices come only from
data/prices.csv.

    .venv/bin/python -I scripts/build_commodity_stock.py

Writes backend/data/commodity_stock.csv (inchi_key, smiles, ord_records, ord_sources).
"""
from collections import Counter, defaultdict
from pathlib import Path

import pandas as pd
from rdkit import Chem, RDLogger

RDLogger.DisableLog("rdApp.*")
ROOT = Path(__file__).resolve().parents[1]
MIN_RECORDS = 1000
MIN_SOURCES = 100

df = pd.read_parquet(ROOT / "backend/data/ord_canon.parquet",
                     columns=["reactants_flat", "is_noop", "patent", "doi"])
df = df[~df.is_noop]
records: Counter = Counter()
sources: dict[str, set] = defaultdict(set)
for rs, patent, doi in zip(df.reactants_flat, df.patent, df.doi):
    src = patent if isinstance(patent, str) and patent else (doi if isinstance(doi, str) and doi else None)
    for m in set(rs):
        records[m] += 1
        if src:
            sources[m].add(src)

rows = []
for m, n in records.most_common():
    if n < MIN_RECORDS:
        break
    k = len(sources[m])
    mol = Chem.MolFromSmiles(m)
    if k < MIN_SOURCES or mol is None:
        continue
    rows.append({"inchi_key": Chem.MolToInchiKey(mol), "smiles": m, "ord_records": n, "ord_sources": k})

out = ROOT / "backend/data/commodity_stock.csv"
pd.DataFrame(rows).drop_duplicates("inchi_key").to_csv(out, index=False)
print(f"{len(df):,} records, {len(records):,} distinct reactants -> {len(rows)} with >= {MIN_RECORDS} records "
      f"from >= {MIN_SOURCES} sources. Wrote {out.relative_to(ROOT)}")
