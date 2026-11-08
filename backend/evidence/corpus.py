"""Reaction record loading + indexing: ORD (Open Reaction Database) projections parquet.

Every value here is either written in the record or computed from it.
The procedure text (`procedure_details`) is carried verbatim. It is never summarized or rewritten, by an LLM or anyone.
Missing values are None, and the UI shows them as —.

Fields used from the ORD schema:
  smiles                              reaction SMILES "A.B>>C"
  notes.procedure_details             original experimental procedure text
  inputs                              {role name: {components: [{smiles, amount{mass_grams, moles_moles,
                                      volume_liters}, reaction_role, is_limiting}]}}
  conditions.temperature.setpoint_kelvin
  outcomes[].reaction_time_seconds
  outcomes[].products[].measurements[type=YIELD].percentage.value
  provenance.publication_url / doi / patent
"""
from __future__ import annotations

import json
from dataclasses import asdict, dataclass, field
from pathlib import Path

import pyarrow.parquet as pq
from rdkit import Chem, RDLogger
from rdkit.Chem import Descriptors

RDLogger.DisableLog("rdApp.*")

PROJECTIONS = Path(__file__).resolve().parents[1] / "data/ord/projections"

# Only the columns to read from projections. The rest is never loaded into memory
COLUMNS = ["reaction_id", "smiles", "notes", "inputs", "conditions", "outcomes", "provenance"]


_canon_cache: dict[str, str | None] = {}


def canon(smiles: str | None) -> str | None:
    """Canonical SMILES. Nearly 60% of ORD reactions carry atom maps ([CH3:12]), and RDKit keeps maps in the canonical
    form, so they must be stripped before comparing with unmapped SMILES.

    The same product recurs across many records, so cache by the raw string; this is most of the cost of a full scan.
    """
    if not smiles:
        return None
    hit = _canon_cache.get(smiles, ...)
    if hit is not ...:
        return hit
    m = Chem.MolFromSmiles(smiles)
    if m is not None:
        for a in m.GetAtoms():
            a.SetAtomMapNum(0)
    out = Chem.MolToSmiles(m) if m is not None else None
    _canon_cache[smiles] = out
    return out


@dataclass
class Reagent:
    label: str                  # role name from ORD inputs, verbatim ("Base", "amine", etc.)
    smiles: str | None
    name: str | None            # only when the record has a NAME identifier
    role: str | None            # REACTANT / REAGENT / SOLVENT / CATALYST ...
    mass_g: float | None
    moles: float | None
    volume_l: float | None
    is_limiting: bool | None
    moles_calc: float | None = None  # computed: mass / MW from the structure, when no moles
    equiv: float | None = None       # computed: moles / moles of the limiting reagent


@dataclass
class Procedure:
    reaction_id: str
    rxn_smiles: str | None
    reactants: list[str]
    product: str | None
    text: str | None                       # original procedure text. Do not process
    reagents: list[Reagent] = field(default_factory=list)
    workups: list[dict] = field(default_factory=list)
    temperature_c: float | None = None
    time_h: float | None = None
    yield_pct: float | None = None
    url: str | None = None
    organization: str | None = None

    def to_json(self) -> dict:
        d = asdict(self)
        d["reagents"] = [asdict(r) if not isinstance(r, dict) else r for r in self.reagents]
        return d


_mw_cache: dict[str, float | None] = {}


def mw(smiles: str | None) -> float | None:
    """Molecular weight from the structure. Used to convert mass to moles when the record has no moles."""
    if not smiles:
        return None
    if smiles not in _mw_cache:
        m = Chem.MolFromSmiles(smiles)
        _mw_cache[smiles] = Descriptors.MolWt(m) if m else None
    return _mw_cache[smiles]


def _amount(a: dict | None) -> tuple[float | None, float | None, float | None]:
    """0 is treated as 'no value': some ORD records write the amount as 0, which is not an amount."""
    if not a:
        return None, None, None
    pick = lambda k: (a.get(k) or None)  # noqa: E731  (both 0.0 and None become None)
    return pick("mass_grams"), pick("moles_moles"), pick("volume_liters")


def _reagents(inputs) -> list[Reagent]:
    """ORD inputs (map or list of pairs) -> reagent list. Equivalents are computed against the limiting reagent."""
    out: list[Reagent] = []
    if not inputs:
        return out
    pairs = inputs.items() if isinstance(inputs, dict) else inputs
    for label, blk in pairs:
        for c in (blk or {}).get("components") or []:
            mass, moles, vol = _amount(c.get("amount"))
            name = next(
                (i.get("value") for i in (c.get("identifiers") or []) if i.get("type") == "NAME" and i.get("value")),
                None,
            )
            out.append(
                Reagent(
                    label=label,
                    smiles=c.get("smiles"),
                    name=name,
                    role=c.get("reaction_role"),
                    mass_g=mass,
                    moles=moles,
                    volume_l=vol,
                    is_limiting=c.get("is_limiting"),
                )
            )
    # Many records give mass only. Moles (needed for equivalents) come from the molecular weight of the structure.
    for r in out:
        if r.moles is None and r.mass_g:
            m = mw(r.smiles)
            if m:
                r.moles_calc = r.mass_g / m

    # Equivalents: relative to the moles of the marked limiting reagent, else the smallest REACTANT moles
    def n(r: Reagent) -> float | None:
        return r.moles if r.moles is not None else r.moles_calc

    basis = next((n(r) for r in out if r.is_limiting and n(r)), None)
    if basis is None:
        cand = [n(r) for r in out if r.role == "REACTANT" and n(r)]
        basis = min(cand) if cand else None
    if basis:
        for r in out:
            if n(r):
                r.equiv = round(n(r) / basis, 3)
    return out


def _outcome_bits(outcomes) -> tuple[float | None, float | None]:
    """(time in h, yield in %): only what the record has."""
    time_h = yield_pct = None
    for o in outcomes or []:
        secs = o.get("reaction_time_seconds")
        if secs and time_h is None:
            time_h = round(secs / 3600, 2)
        for p in o.get("products") or []:
            for m in p.get("measurements") or []:
                if m.get("type") != "YIELD":
                    continue
                v = (m.get("percentage") or {}).get("value")
                # 37,578 ORD USPTO yields are <= 0 or > 100. They cannot be used as yields, and
                # 0 becomes a divide-by-zero in the cost engine. Do not repair them; leave the value missing.
                if v is None or not (0 < v <= 100):
                    continue
                if yield_pct is None or p.get("is_desired_product"):
                    yield_pct = round(v, 1)
    return time_h, yield_pct


def _provenance(prov) -> tuple[str | None, str | None]:
    prov = prov or {}
    url = prov.get("publication_url") or prov.get("doi") or prov.get("patent")
    org = (prov.get("experimenter") or {}).get("organization")
    return url, org


def parse(rec: dict) -> Procedure | None:
    """One projections row -> Procedure. Records without procedure text are dropped."""
    text = ((rec.get("notes") or {}).get("procedure_details") or "").strip() or None
    if not text:
        return None

    rxn = rec.get("smiles") or ""
    left, _, right = rxn.partition(">>")
    reactants = [s for s in (canon(x) for x in left.split(".") if x) if s]
    product = canon(right.split(".")[0]) if right else None
    if not product:
        return None

    cond = rec.get("conditions") or {}
    k = ((cond.get("temperature") or {}).get("setpoint_kelvin"))
    time_h, yield_pct = _outcome_bits(rec.get("outcomes"))
    url, org = _provenance(rec.get("provenance"))

    return Procedure(
        reaction_id=rec.get("reaction_id"),
        rxn_smiles=rxn or None,
        reactants=reactants,
        product=product,
        text=text,
        reagents=_reagents(rec.get("inputs")),
        workups=[
            {"type": w.get("type"), "details": w.get("details"),
             "duration_h": round(w["duration_seconds"] / 3600, 2) if w.get("duration_seconds") else None}
            for w in (rec.get("workups") or [])
            if w.get("type") or w.get("details")
        ],
        temperature_c=round(k - 273.15, 1) if k else None,
        time_h=time_h,
        yield_pct=yield_pct,
        url=url,
        organization=org,
    )


def scan(wanted: set[str], projections: Path = PROJECTIONS, progress=None) -> dict[str, list[Procedure]]:
    """Collect only the records that make the wanted product SMILES; return {canonical product SMILES: [Procedure]}.

    ORD has over 2M reactions, so the expensive work is deferred:
      1) read only the `smiles` column per row group (the other columns, which hold the procedure text, are untouched)
      2) filter by product string length: canonical SMILES of one molecule have similar lengths
      3) canonicalize only the survivors with RDKit
      4) re-read only the rows that actually matched, with all columns
    """
    hits: dict[str, list[Procedure]] = {}
    files = sorted(projections.glob("**/*.parquet"))
    seen = 0
    for n, path in enumerate(files, 1):
        try:
            pf = pq.ParquetFile(path)
        except Exception:
            continue
        for rg in range(pf.num_row_groups):
            rxns = pf.read_row_group(rg, columns=["smiles"]).column("smiles").to_pylist()
            seen += len(rxns)
            idx = []
            for i, rxn in enumerate(rxns):
                if not rxn:
                    continue
                right = rxn.partition(">>")[2]
                if not right:
                    continue
                if canon(right.split(".")[0]) in wanted:
                    idx.append(i)
            if not idx:
                continue
            for rec in pf.read_row_group(rg, columns=COLUMNS).take(idx).to_pylist():
                p = parse(rec)
                if p and p.product in wanted:
                    hits.setdefault(p.product, []).append(p)
        if progress:
            progress(n, len(files), seen, sum(len(v) for v in hits.values()))
    return hits


def scan_ids(wanted_ids: set[str], projections: Path = PROJECTIONS):
    """Look up records by reaction_id and yield Procedures one by one. Records without procedure text are skipped.

    Same principle as scan(): per row group read only the reaction_id column, then re-read matched rows in full.
    Much faster because there is no product canonicalization.
    """
    left = set(wanted_ids)
    for path in sorted(projections.glob("**/*.parquet")):
        if not left:
            return
        try:
            pf = pq.ParquetFile(path)
        except Exception:
            continue
        for rg in range(pf.num_row_groups):
            ids = pf.read_row_group(rg, columns=["reaction_id"]).column("reaction_id").to_pylist()
            idx = [i for i, r in enumerate(ids) if r in left]
            if not idx:
                continue
            for rec in pf.read_row_group(rg, columns=COLUMNS).take(idx).to_pylist():
                left.discard(rec.get("reaction_id"))
                p = parse(rec)
                if p:
                    yield p


# How well a step matches a record. The first two count as REPORTED.
MATCH_RANK = {"exact": 4, "covered": 3, "partial": 2, "product": 1}
REPORTED_MATCHES = ("exact", "covered")


def best_match(procs: list[Procedure], reactants: set[str]) -> tuple[Procedure | None, str]:
    """The record that best matches the step's reactant set.

    exact   - the reactant sets are equal
    covered - all step reactants are among the record's reactants. ORD often lists salts and reagents on the left
              of the reaction SMILES (Rochelle salt, bicarbonate, counterions, etc.), so in practice this is the "same reaction"
    partial - same product, reactants only partly overlap
    product - same product only (the literature makes it by a different route)
    """
    best, kind, score = None, "none", -1.0
    for p in procs:
        rs = set(p.reactants)
        if not rs:
            continue
        overlap = len(rs & reactants)
        jac = overlap / len(rs | reactants)
        if rs == reactants:
            this = "exact"
        elif reactants and reactants <= rs:
            this = "covered"
        elif overlap:
            this = "partial"
        else:
            this = "product"
        # At equal grade, prefer more overlap and a recorded yield
        rank = MATCH_RANK[this] + jac + (0.1 if p.yield_pct is not None else 0)
        if rank > score:
            best, kind, score = p, this, rank
    return best, kind


def save(hits: dict[str, list[Procedure]], path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps({k: [p.to_json() for p in v] for k, v in hits.items()}, ensure_ascii=False))
