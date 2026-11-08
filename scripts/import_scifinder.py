"""SciFinder (or any supplier of reaction records) → a second corpus the evidence layer reads.

ORD covers 2,360,460 reactions and still misses most of what the demo routes do: of the 144 steps
in the five targets' routes, 114 have no exact record, and for 72 of those ORD has no record of the
product being made at all. No amount of better matching reaches those — they need literature we do
not have. This is the way in.

What it is NOT: a way for the model to write chemistry. Every row here comes from an export the
chemist made from a licensed search; this script only reshapes it. A row with no citation is
rejected, the same way scripts/import_prices.py rejects a price with no source.

Input (--in, a file or a directory of them):
  *.csv / *.tsv / *.xlsx   one reaction per row, columns named below (case and spaces ignored)
  *.rdf / *.rxn            MDL reaction files; $DTYPE/$DATUM pairs become the fields below

Columns, all optional but one of product_smiles / product_cas required, and one citation required:
  product_smiles     product structure            reactant_smiles   dot-separated, or several columns
  product_cas        CAS RN, resolved via PubChem reactant_cas      semicolon-separated
  reagents solvents catalysts                     free text, kept verbatim
  temperature_c time_h yield_pct                  numbers; blank stays blank, never a guess
  doi patent citation reference                   the source. At least one must be present
  procedure                                       the experimental text, kept verbatim
  id                                              the supplier's reaction id, else one is derived

Writes backend/data/scifinder/records.parquet (the schema evidence/recorded_routes.RecordIndex
reads) and procedures.jsonl (the verbatim text, the shape evidence/corpus.Procedure.to_json gives).
Both are gitignored: a SciFinder export is licensed to the person who ran the search, so it stays
on their machine and is cited, never redistributed.

    .venv/bin/python -I scripts/import_scifinder.py --in ~/Downloads/export.csv [--dry-run]
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import time
from pathlib import Path

import pandas as pd
from rdkit import Chem, RDLogger

RDLogger.DisableLog("rdApp.*")
ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "backend/data/scifinder"
CAS_RE = re.compile(r"^\d{2,7}-\d{2}-\d$")

# column name → the names an export might use for it
ALIASES = {
    "product_smiles": ["productsmiles", "product", "productstructure", "productsmile"],
    "product_cas": ["productcas", "productcasrn", "productregistrynumber"],
    "reactant_smiles": ["reactantsmiles", "reactants", "reactantstructure", "startingmaterial",
                        "startingmaterials", "reactant"],
    "reactant_cas": ["reactantcas", "reactantcasrn", "reactantregistrynumbers"],
    "reagents": ["reagent", "reagents"],
    "solvents": ["solvent", "solvents"],
    "catalysts": ["catalyst", "catalysts"],
    "temperature_c": ["temperature", "temperaturec", "tempc", "temp"],
    "time_h": ["time", "timeh", "reactiontime", "timehours"],
    "yield_pct": ["yield", "yieldpct", "yieldpercent", "productyield"],
    "doi": ["doi"],
    "patent": ["patent", "patentnumber", "patentno"],
    "citation": ["citation", "reference", "journal", "title", "source"],
    "procedure": ["procedure", "experimental", "notes", "text", "experimentalprocedure"],
    "id": ["id", "reactionid", "rxnid", "answernumber"],
}


def log(m):
    print(m, flush=True)


def _norm(s: str) -> str:
    return re.sub(r"[^a-z0-9]", "", str(s).lower())


def _canon(smiles):
    if not smiles or not str(smiles).strip():
        return None
    m = Chem.MolFromSmiles(str(smiles).strip())
    if m is None:
        return None
    for a in m.GetAtoms():
        a.SetAtomMapNum(0)
    return Chem.MolToSmiles(m)


def _flat(smiles):
    """Non-isomeric canonical form — what RecordIndex keys products on."""
    if not smiles:
        return None
    m = Chem.MolFromSmiles(smiles)
    return Chem.MolToSmiles(m, isomericSmiles=False) if m is not None else None


def _text(v) -> str:
    """A cell as text. pandas gives NaN for an empty cell, and NaN has no .strip()."""
    if v is None or (isinstance(v, float) and pd.isna(v)):
        return ""
    return str(v).strip()


def _num(v):
    if v is None or (isinstance(v, float) and pd.isna(v)):
        return None
    s = str(v).strip().replace("%", "").replace(",", "")
    if not s:
        return None
    m = re.search(r"-?\d+(?:\.\d+)?", s)
    return float(m.group()) if m else None


_pubchem_cache: dict[str, str | None] = {}


def cas_to_smiles(cas: str) -> str | None:
    """CAS RN → SMILES via PubChem, the same free endpoint chem/resolve.py uses."""
    cas = str(cas).strip()
    if not CAS_RE.match(cas):
        return None
    if cas in _pubchem_cache:
        return _pubchem_cache[cas]
    import httpx
    url = f"https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/{cas}/property/SMILES/JSON"
    out = None
    try:
        with httpx.Client(timeout=20, headers={"User-Agent": "SynthPath/1.0"}) as c:
            r = c.get(url)
            if r.status_code == 200:
                props = r.json()["PropertyTable"]["Properties"][0]
                out = _canon(props.get("SMILES") or props.get("CanonicalSMILES"))
    except Exception:
        out = None
    _pubchem_cache[cas] = out
    time.sleep(0.22)                       # PubChem asks for <= 5 requests/second
    return out


def read_table(path: Path) -> list[dict]:
    if path.suffix.lower() in (".xlsx", ".xls"):
        df = pd.read_excel(path, dtype=str)
    else:
        sep = "\t" if path.suffix.lower() == ".tsv" else None
        df = pd.read_csv(path, dtype=str, sep=sep, engine="python")
    found = {}
    for want, names in ALIASES.items():
        for col in df.columns:
            if _norm(col) in names or _norm(col) == want:
                found[want] = col
                break
    log(f"  {path.name}: {len(df)} rows, columns matched: {', '.join(sorted(found)) or 'NONE'}")
    return [{k: row.get(col) for k, col in found.items()} for _, row in df.iterrows()]


def read_rdf(path: Path) -> list[dict]:
    """MDL RDF/RXN: each record is a $RXN block plus $DTYPE/$DATUM pairs."""
    text = path.read_text(errors="replace")
    chunks = re.split(r"^\$RFMT.*$", text, flags=re.M)[1:] or [text]
    out = []
    for ch in chunks:
        rec: dict = {}
        for dtype, datum in re.findall(r"^\$DTYPE\s+(.+?)\s*$\n^\$DATUM\s+(.*?)\s*$", ch, flags=re.M):
            key = _norm(dtype.split(":")[-1])
            for want, names in ALIASES.items():
                if key in names or key == want:
                    rec[want] = datum
                    break
        m = re.search(r"\$RXN.*?(?=^\$DTYPE|\Z)", ch, flags=re.S | re.M)
        if m:
            try:
                rxn = Chem.rdChemReactions.ReactionFromRxnBlock(m.group())
                if rxn is not None:
                    rec.setdefault("reactant_smiles",
                                   ".".join(Chem.MolToSmiles(x) for x in rxn.GetReactants()))
                    prods = [Chem.MolToSmiles(x) for x in rxn.GetProducts()]
                    if prods:
                        rec.setdefault("product_smiles", max(prods, key=len))
            except Exception:
                pass
        if rec:
            out.append(rec)
    log(f"  {path.name}: {len(out)} reaction records")
    return out


def to_record(raw: dict, n: int, label: str = "SciFinder export",
              prefix: str = "scifinder", verbatim: bool = False) -> tuple[dict | None, dict | None, str]:
    """One export row → (index row, procedure row, reason it was rejected)."""
    product = _canon(_text(raw.get("product_smiles"))) or (
        cas_to_smiles(_text(raw.get("product_cas"))) if _text(raw.get("product_cas")) else None)
    if not product:
        return None, None, "no product structure (need product_smiles or a resolvable product_cas)"

    reactants = [c for c in (_canon(x) for x in _text(raw.get("reactant_smiles")).split(".")) if c]
    if not reactants and _text(raw.get("reactant_cas")):
        for cas in re.split(r"[;,]", _text(raw["reactant_cas"])):
            s = cas_to_smiles(cas)
            if s:
                reactants.append(s)
    if not reactants:
        return None, None, "no reactant structures"

    doi = _text(raw.get("doi")) or None
    patent = _text(raw.get("patent")) or None
    citation = _text(raw.get("citation")) or None
    if not (doi or patent or citation):
        return None, None, "no citation — a record with no source is not evidence (absolute rule 2)"

    rid = _text(raw.get("id")) or f"{n:06d}"
    if not rid.startswith(f"{prefix}-"):
        rid = f"{prefix}-{rid}"
    y, temp, t_h = _num(raw.get("yield_pct")), _num(raw.get("temperature_c")), _num(raw.get("time_h"))
    if y is not None and not (0 < y <= 100):
        y = None                           # same guard as evidence/provenance.reported_yield
    url = f"https://doi.org/{doi}" if doi else None
    row = {
        "reaction_id": rid, "dataset_id": prefix, "dataset_name": label,
        "yield_pct": y, "temperature_c": temp, "time_h": t_h,
        "solvents": _text(raw.get("solvents")) or None, "catalysts": _text(raw.get("catalysts")) or None,
        "reagents": _text(raw.get("reagents")) or None,
        "patent": patent, "doi": doi, "publication_url": url,
        "reactants_can": reactants, "reactants_flat": [_flat(x) for x in reactants],
        "product_can": product, "product_main": product, "product_main_flat": _flat(product),
        "product_heavy_atoms": Chem.MolFromSmiles(product).GetNumHeavyAtoms(),
        "is_noop": product in reactants,
        "citation": citation,
    }
    proc = None
    text = _text(raw.get("procedure"))
    if text:
        proc = {"reaction_id": rid, "rxn_smiles": ".".join(reactants) + ">>" + product,
                "reactants": reactants, "product": product, "text": text, "reagents": [],
                "workups": [], "temperature_c": temp, "time_h": t_h, "yield_pct": y,
                "url": url, "organization": citation or patent or doi,
                # the UI must not call a retyped procedure verbatim (frontend Procedure.jsx)
                "transcribed": not verbatim}
    return row, proc, ""


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--in", dest="src", type=Path, required=True, help="export file or directory")
    ap.add_argument("--out", type=Path, default=OUT_DIR)
    ap.add_argument("--source-label", default="SciFinder export",
                    help="what this export is, shown as the dataset name (e.g. 'Open-access literature')")
    ap.add_argument("--id-prefix", default="scifinder",
                    help="prefix for reaction ids, so a record says where it came from")
    ap.add_argument("--verbatim", action="store_true",
                    help="the procedure column holds the source's own words, extracted not retyped. "
                         "Off by default: a transcription is marked as one, because 'verbatim' is a "
                         "claim about how the text was produced, not about whether its numbers are right")
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args()

    files = sorted(p for p in ([a.src] if a.src.is_file() else a.src.rglob("*"))
                   if p.suffix.lower() in (".csv", ".tsv", ".xlsx", ".xls", ".rdf", ".rxn"))
    if not files:
        raise SystemExit(f"no .csv/.tsv/.xlsx/.rdf under {a.src}")
    log(f"reading {len(files)} file(s)")
    raws: list[dict] = []
    for p in files:
        raws += read_rdf(p) if p.suffix.lower() in (".rdf", ".rxn") else read_table(p)

    rows, procs, rejected = [], [], {}
    for i, raw in enumerate(raws, 1):
        row, proc, why = to_record(raw, i, a.source_label, a.id_prefix, a.verbatim)
        if row is None:
            rejected[why] = rejected.get(why, 0) + 1
            continue
        rows.append(row)
        if proc:
            procs.append(proc)
    log(f"\n{len(rows)} records accepted, {len(procs)} with procedure text, {len(raws) - len(rows)} rejected")
    for why, n in sorted(rejected.items(), key=lambda kv: -kv[1]):
        log(f"   {n:4d}  {why}")
    if not rows:
        raise SystemExit("nothing to write")
    if a.dry_run:
        log("\n--dry-run, nothing written. Sample:")
        log(json.dumps({k: v for k, v in rows[0].items() if k != "reactants_flat"}, indent=1)[:700])
        return 0

    a.out.mkdir(parents=True, exist_ok=True)
    df = pd.DataFrame(rows).drop_duplicates("reaction_id")
    df.to_parquet(a.out / "records.parquet", index=False)
    with (a.out / "procedures.jsonl").open("w") as f:
        for p in procs:
            f.write(json.dumps(p, default=str) + "\n")
    log(f"\nwrote {a.out.relative_to(ROOT)}/records.parquet  ({len(df)} records)")
    log(f"wrote {a.out.relative_to(ROOT)}/procedures.jsonl ({len(procs)} procedures)")
    log("\nNext:  .venv/bin/python -I scripts/build_deep_targets.py --stage steps"
        "\n       .venv/bin/python -I scripts/score_deep_targets.py")
    return 0


if __name__ == "__main__":
    sys.exit(main())
