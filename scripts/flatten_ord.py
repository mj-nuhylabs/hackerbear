"""ORD projections parquet → one flat table (backend/data/ord_flat.parquet).

It reads one place only: `backend/data/ord/projections/`. The ORD projections artifact is already flattened
(units are folded into column names: setpoint_kelvin, reaction_time_seconds), and molecule identifiers are
also resolved to `smiles`, so we skip protobuf. An earlier version parsed the FileDescriptorProto in reaction.proto
to decode the protobuf in data/*.parquet, but projections holds the same 2,428,291 rows,
so that path is entirely unnecessary. (evidence/corpus.py reads the same projections.)

Every value that comes out is written in the record or converted from it. If absent, it is None.

Note: there are two kinds of reaction SMILES:
  rxn_smiles           assembled from the REACTANT-role components of inputs + the desired product. **No atom mapping.**
  rxn_smiles_reported  the reaction-level identifier of the record. **97-99% carry atom mapping.**
If you join or deduplicate on the latter, strip the mapping first.

usage: .venv/bin/python scripts/flatten_ord.py [--workers 10]
"""
import argparse
import glob
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

import pandas as pd
import pyarrow.parquet as pq

ROOT = Path(__file__).resolve().parents[1]
PROJECTIONS = ROOT / "backend/data/ord/projections"
OUT = ROOT / "backend/data/ord_flat.parquet"
# The projections file metadata has only ord.source_dataset_id, no human-readable name.
# A map of ord.name from data/ (protobuf), extracted in advance. If missing, dataset_name is just None and everything else works.
NAMES = ROOT / "backend/data/ord/dataset_names.json"

COLUMNS = ["reaction_id", "smiles", "inputs", "conditions", "outcomes", "provenance"]


def _items(m):
    """Map columns in projections come out of to_pylist() as [(key, value), ...] or dict."""
    if m is None:
        return []
    return list(m.items()) if isinstance(m, dict) else list(m)


def _row(r: dict) -> dict:
    by_role: dict[str, list[str]] = {}
    missing_reactant_smiles = False
    for _, inp in _items(r.get("inputs")):
        for c in (inp or {}).get("components") or []:
            role = c.get("reaction_role") or "UNSPECIFIED"
            s = c.get("smiles")
            if not s and role == "REACTANT":
                missing_reactant_smiles = True
            if s:
                by_role.setdefault(role, []).append(s)

    product = yield_pct = time_h = None
    for o in r.get("outcomes") or []:
        prods = o.get("products") or []
        desired = ([p for p in prods if p.get("is_desired_product")]
                   or [p for p in prods if p.get("reaction_role") == "PRODUCT"] or prods)
        for p in desired[:1]:
            product = p.get("smiles")
            for m in p.get("measurements") or []:
                if m.get("type") == "YIELD" and (m.get("percentage") or {}).get("value") is not None:
                    yield_pct = m["percentage"]["value"]
                    break
        if o.get("reaction_time_seconds") is not None:
            time_h = o["reaction_time_seconds"] / 3600.0
        if product:
            break

    reactants = by_role.get("REACTANT", [])
    rxn = (".".join(reactants) + ">>" + product) if reactants and product and not missing_reactant_smiles else None

    cond = r.get("conditions") or {}
    k = ((cond.get("temperature") or {}).get("setpoint_kelvin"))
    pv = r.get("provenance") or {}
    return {
        "reaction_id": r.get("reaction_id"),
        "rxn_smiles": rxn,                       # assembled from REACTANT roles. No atom mapping
        "rxn_smiles_reported": r.get("smiles"),  # reaction-level identifier. Mostly atom-mapped
        "reactants": ".".join(reactants) or None,
        "reagents": ".".join(by_role.get("REAGENT", [])) or None,
        "catalysts": ".".join(by_role.get("CATALYST", [])) or None,
        "solvents": ".".join(by_role.get("SOLVENT", [])) or None,
        "product": product,
        "yield_pct": yield_pct,
        "temperature_c": (k - 273.15) if k is not None else None,
        "time_h": time_h,
        "patent": pv.get("patent") or None,
        "doi": pv.get("doi") or None,
        "publication_url": pv.get("publication_url") or None,
        "organization": ((pv.get("experimenter") or {}).get("organization")) or None,
        "is_mined": pv.get("is_mined"),
    }


_names: dict[str, str] | None = None


def dataset_names() -> dict[str, str]:
    global _names
    if _names is None:
        import json
        _names = json.loads(NAMES.read_text()) if NAMES.exists() else {}
    return _names


def flatten_file(path: str) -> pd.DataFrame:
    meta = {k.decode(): v.decode() for k, v in (pq.read_metadata(path).metadata or {}).items()
            if k.startswith(b"ord.")}
    ds_id = meta.get("ord.source_dataset_id") or meta.get("ord.dataset_id")
    rows = [_row(r) for r in pq.read_table(path, columns=COLUMNS).to_pylist()]
    df = pd.DataFrame(rows)
    df.insert(0, "dataset_id", ds_id)
    df.insert(1, "dataset_name", dataset_names().get(ds_id))
    return df


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--workers", type=int, default=10)
    ap.add_argument("--out", default=str(OUT))
    a = ap.parse_args()
    files = sorted(glob.glob(str(PROJECTIONS / "*/*.parquet")))
    if not files:
        raise SystemExit(f"no projections under {PROJECTIONS}")
    with ProcessPoolExecutor(a.workers) as ex:
        dfs = []
        for i, df in enumerate(ex.map(flatten_file, files), 1):
            dfs.append(df)
            print(f"[{i}/{len(files)}] {df.dataset_name.iat[0] if len(df) else '?'}: {len(df)}", flush=True)
    out = pd.concat(dfs, ignore_index=True)
    out.to_parquet(a.out, index=False)
    print(f"wrote {a.out} rows={len(out)}")


if __name__ == "__main__":
    main()
