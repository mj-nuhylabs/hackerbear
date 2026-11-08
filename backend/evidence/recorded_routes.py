"""Recorded routes — chain real ORD reactions backward from a target to buyable materials.

AiZynthFinder answers "which kinds of reactions *could* break this molecule apart". This answers
a different question: "how has this molecule (and each of its precursors) actually been made,
according to the records?" Every step here is one or more ORD records — a patent example or a
published dataset — with its own reaction id, so every step can show the procedure that was run.

Nothing is invented. A step exists only if a record produces that molecule from those substrates.
Where the chain runs out (no record, not buyable) the leaf says so and the route is marked
incomplete — a gap the UI must show, or AiZynthFinder can try to fill as a COMPUTED step.

How a record becomes a step:
  * product   = the record's main product fragment (salts are written "drug.acid")
  * no-op records (the product is already a reactant — salt formation, recrystallisation)
    are skipped: they form no bond
  * substrates = recorded reactants that end up in the product. ORD (USPTO especially) lists
    bases, acids and coupling agents on the reactant side, so without atom maps we keep a
    reactant only if >= SUBSTRATE_OVERLAP of its radius-1 Morgan environments appear in the
    product and it has >= 2 heavy atoms. This is a filter on which recorded molecules to chase
    further back; the step's full recorded reactant list is kept untouched for display.
  * records with the same product and the same substrate set are one step with several sources

Search: from the target, expand every molecule that has records, up to MAX_DEPTH steps.
A buyable molecule is a leaf, but an *advanced* buyable intermediate (>= ADVANCED_HEAVY_ATOMS)
is also expanded, so both "buy it" and "make it as recorded" appear as options.
"""
from __future__ import annotations

import itertools
from collections import defaultdict
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path

import numpy as np
import pandas as pd
from rdkit import Chem, RDLogger
from rdkit.Chem import rdFingerprintGenerator

RDLogger.DisableLog("rdApp.*")

DATA = Path(__file__).resolve().parents[1] / "data"
ORD_CANON = DATA / "ord_canon.parquet"
ZINC = DATA / "aizynth/zinc_stock.hdf5"
PRICES = DATA / "prices.csv"

MAX_DEPTH = 6
SUBSTRATE_OVERLAP = 0.6
ADVANCED_HEAVY_ATOMS = 15
OPTIONS_PER_MOLECULE = 8      # recorded steps explored per molecule (most-sourced first)
MAX_MOLECULES = 4000          # explored molecules per target, a hard stop
MAX_ROUTES = 300              # enumerated routes per target
# Small or carbon-free molecules (HNO3, NaN3, MeI...) are reagents, not intermediates worth chasing:
# chasing them leads to records about making nitric acid. They are leaves with status 'small' —
# the UI says "small reagent, stock not checked" rather than calling them buyable.
SMALL_HEAVY_ATOMS = 6

COLUMNS = ["reaction_id", "patent", "doi", "publication_url", "dataset_name", "reactants_can",
           "reactants_flat", "product_main", "product_main_flat", "is_noop", "yield_pct",
           "temperature_c", "time_h", "solvents", "catalysts", "reagents"]

_r1 = rdFingerprintGenerator.GetMorganGenerator(radius=1, fpSize=4096)


def flat(smiles: str | None) -> str | None:
    m = Chem.MolFromSmiles(smiles) if smiles else None
    if m is None:
        return None
    for a in m.GetAtoms():
        a.SetAtomMapNum(0)
    return Chem.MolToSmiles(m, isomericSmiles=False)


# Common reaction solvents. USPTO records put the solvent on the reactant side, and a solvent
# like o-xylene passes the overlap test against any product with a tolyl group. This only
# stops the search from treating them as substrates; they stay in the recorded reactant list.
SOLVENTS = frozenset(flat(s) for s in [
    "Cc1ccccc1C", "Cc1cccc(C)c1", "Cc1ccc(C)cc1", "Cc1ccccc1", "c1ccccc1", "Clc1ccccc1",
    "ClCCl", "ClC(Cl)Cl", "ClCCCl", "CN(C)C=O", "CC(=O)N(C)C", "CS(C)=O", "C1CCOC1", "CC1CCCO1",
    "C1COCCO1", "COCCOC", "CCOCC", "COC(C)(C)C", "CO", "CCO", "CC(C)O", "CCCO", "CCCCO",
    "CC(C)(C)O", "CC#N", "CC(C)=O", "CCC(C)=O", "CCOC(C)=O", "CC(=O)O", "O", "CCCCCC",
    "C1CCCCC1", "CN1CCCC1=O", "OCCO", "c1ccncc1", "CCN(CC)CC", "CCN(C(C)C)C(C)C",
    "ClC(Cl)(Cl)Cl", "OC(=O)C(F)(F)F", "CC(C)CO", "COCCO",
]) - {None}


def _neutral(smiles: str) -> str:
    """Charge-neutral form, so a protonated product counts as the product (no-op check only)."""
    m = Chem.MolFromSmiles(smiles)
    if m is None:
        return smiles
    for a in m.GetAtoms():
        if a.GetFormalCharge() > 0 and a.GetSymbol() == "N" and a.GetTotalNumHs() > 0:
            a.SetFormalCharge(0)
            a.SetNumExplicitHs(max(a.GetTotalNumHs() - 1, 0))
            a.SetNoImplicit(True)
    try:
        Chem.SanitizeMol(m)
        return Chem.MolToSmiles(m, isomericSmiles=False)
    except Exception:
        return smiles


@lru_cache(maxsize=200_000)
def _env(smiles: str) -> tuple[frozenset, int]:
    m = Chem.MolFromSmiles(smiles)
    if m is None:
        return frozenset(), 0
    return frozenset(_r1.GetSparseCountFingerprint(m).GetNonzeroElements()), m.GetNumHeavyAtoms()


FREQUENT_FILE = DATA / "frequent_reactants.tsv"
SHARED_ENVS_MIN = 6
SHARED_ENVS_MIN_FRACTION = 0.4
SUBSTRUCTURE_MIN_HEAVY_ATOMS = 6
# A molecule in this many unrelated records is a reagent, whatever it looks like: triethylamine
# (137,558) shares its ethyls with any N-ethyl product. Benzoyl chloride (5,589) must not be
# caught by the same rule, so between 5,000 and this it only has to clear the strict overlap bar.
VERY_FREQUENT_RECORDS = 20_000
# Catalyst metals. A Pd2(dba)3 or Pd(PPh3)4 shares aryl environments with almost any biaryl
# product, so the overlap test alone would call it a substrate. Organometallic substrates
# (B, Mg, Zn, Li, Sn, Si) are not listed — they do end up in the product.
CATALYST_METALS = frozenset({"Pd", "Pt", "Rh", "Ru", "Ir", "Ni", "Cu", "Co", "Fe", "Au", "Ag", "Os", "Mn", "Cr", "Mo", "W", "Ti", "Sc", "Yb", "In"})


@lru_cache(maxsize=1)
def reactant_counts() -> dict[str, int]:
    """Reactant-side molecule → how many ORD records it appears in, for those in >= 5,000
    (scripts/build_frequent_reactants.py). How common a molecule is across unrelated reactions
    is the evidence that it is a reagent rather than a substrate, and it is a matter of degree:
    triethylamine is in 137,558 records, benzoyl chloride in 5,589."""
    if not FREQUENT_FILE.exists():
        return {}
    df = pd.read_csv(FREQUENT_FILE, sep="\t").dropna(subset=["smiles"])
    return dict(zip(df.smiles, df.records.astype(int)))


@lru_cache(maxsize=1)
def frequent_reactants() -> frozenset[str]:
    return frozenset(reactant_counts())


@lru_cache(maxsize=200_000)
def _mol(smiles: str):
    return Chem.MolFromSmiles(smiles)


def substrates_of(reactants_flat: list[str], product_flat: str) -> list[str]:
    """Recorded reactants that appear to end up in the product. Tested in this order:

      1. a listed solvent, fewer than 2 heavy atoms, or a catalyst metal  → not a substrate
      2. a reactant in >= VERY_FREQUENT_RECORDS unrelated records, or in >= 5,000 while smaller
         than SUBSTRUCTURE_MIN_HEAVY_ATOMS                                → not a substrate.
         Triethylamine, DIPEA and sodium hydride are reagents however much they overlap, and
         without atom maps a small common fragment cannot be told from a leaving group:
         dimethylamine is a substructure of imatinib, but in the recorded ring formation it
         leaves. N-methylpiperazine (8 heavy atoms, 5,370 records) is not caught by either
      3. the whole reactant is a substructure of the product              → substrate (amines
         and alcohols lose only an H: N-methylpiperazine, piperidine, aniline)
      4. >= SUBSTRATE_OVERLAP of its radius-1 environments are in the product. A molecule
         common enough to be listed at all (benzoyl chloride, 5,589) must clear this bar and
         nothing weaker; a rarer one also passes on SHARED_ENVS_MIN shared environments at
         >= 40% (boronate esters lose a pinacol but keep the aryl)
    """
    p_env, _ = _env(product_flat)
    pm = _mol(product_flat)
    counts = reactant_counts()
    out = []
    for r in reactants_flat:
        if r in SOLVENTS:
            continue
        env, ha = _env(r)
        if ha < 2 or not env:
            continue
        rm = _mol(r)
        if rm is not None and any(a.GetSymbol() in CATALYST_METALS for a in rm.GetAtoms()):
            continue
        n_records = counts.get(r, 0)
        if n_records >= VERY_FREQUENT_RECORDS or (n_records and ha < SUBSTRUCTURE_MIN_HEAVY_ATOMS):
            continue
        if ha >= 3 and pm is not None and rm is not None and pm.HasSubstructMatch(rm):
            out.append(r)
            continue
        shared = len(env & p_env)
        frac = shared / len(env)
        if frac >= SUBSTRATE_OVERLAP or (not n_records and shared >= SHARED_ENVS_MIN
                                         and frac >= SHARED_ENVS_MIN_FRACTION):
            out.append(r)
    return sorted(set(out))


def unclassified_reactants(reactants_flat: list[str], substrates: list[str]) -> list[str]:
    """Recorded reactant-side molecules that are neither a substrate nor a recognised reagent.

    substrates_of works on fingerprint overlap, with no atom maps, so it misses a co-substrate
    whose atoms are rearranged on the way into the product: the enaminone that becomes imatinib's
    pyrimidine ring reads as a reagent. Anything left here is organic, not a listed solvent and
    not common enough to be a reagent, so it may well be a co-substrate we failed to see.

    The step keeps it so the UI can say the step may be incomplete and the cost sheet can call
    its total a lower bound. We do not guess that it IS a substrate — we say we do not know.
    """
    subs = set(substrates)
    counts = reactant_counts()
    out = []
    for r in reactants_flat:
        if r in subs or r in SOLVENTS or counts.get(r, 0):
            continue
        m = _mol(r)
        if m is None or m.GetNumHeavyAtoms() < SUBSTRUCTURE_MIN_HEAVY_ATOMS:
            continue
        if any(a.GetSymbol() in CATALYST_METALS for a in m.GetAtoms()):
            continue
        if not any(a.GetAtomicNum() == 6 for a in m.GetAtoms()):
            continue
        out.append(r)
    return sorted(set(out))


class Purchasable:
    """ZINC in-stock (the same stock AiZynthFinder uses) or a row in data/prices.csv."""

    def __init__(self):
        keys = pd.read_hdf(ZINC, key="table")["inchi_key"]
        self._zinc = set(keys.tolist())
        self._priced: set[str] = set()
        if PRICES.exists():
            for s in pd.read_csv(PRICES).get("smiles", pd.Series(dtype=str)).dropna():
                f = flat(s)
                if f:
                    self._priced.add(f)

    @lru_cache(maxsize=200_000)
    def check(self, smiles_flat: str) -> str | None:
        """'zinc' / 'priced' / None."""
        if smiles_flat in self._priced:
            return "priced"
        m = Chem.MolFromSmiles(smiles_flat)
        if m is None:
            return None
        return "zinc" if Chem.MolToInchiKey(m) in self._zinc else None


class RecordIndex:
    """product (non-isomeric main fragment) → ORD records that make it. Loads ~2.4M rows."""

    def __init__(self, path: Path = ORD_CANON):
        df = pd.read_parquet(path, columns=COLUMNS)
        df = df[~df.is_noop].reset_index(drop=True)
        self.df = df
        prod = df.product_main_flat.values
        order = np.argsort(prod, kind="stable")
        keys = prod[order]
        self._by_product: dict[str, np.ndarray] = {}
        bounds = np.flatnonzero(keys[1:] != keys[:-1]) + 1
        for chunk in np.split(order, bounds):
            self._by_product[prod[chunk[0]]] = chunk

    def rows(self, product_flat: str) -> np.ndarray:
        return self._by_product.get(product_flat, np.empty(0, dtype=np.int64))

    def record(self, i: int) -> dict:
        r = self.df.iloc[int(i)]

        def v(k):
            x = r[k]
            if x is None or (isinstance(x, float) and np.isnan(x)):
                return None
            return x.tolist() if isinstance(x, np.ndarray) else x

        return {
            "reaction_id": v("reaction_id"), "patent": v("patent"), "doi": v("doi"),
            "url": v("publication_url") or (f"https://doi.org/{v('doi')}" if v("doi") else None),
            "dataset": v("dataset_name"), "reactants": v("reactants_can"), "product": v("product_main"),
            "yield_pct": v("yield_pct"), "temperature_c": v("temperature_c"), "time_h": v("time_h"),
            "solvents": v("solvents"), "catalysts": v("catalysts"), "reagents": v("reagents"),
        }

    def steps_for(self, product_flat: str) -> list[dict]:
        """Recorded steps that make this product, grouped by substrate set, most-sourced first."""
        groups: dict[tuple, list[int]] = defaultdict(list)
        rf = self.df.reactants_flat.values
        p_neutral = _neutral(product_flat)
        for i in self.rows(product_flat):
            subs = substrates_of(list(rf[i]), product_flat)
            # a protonated or salted copy of the product among the substrates means no bond formed
            if not subs or any(_neutral(s) == p_neutral for s in subs):
                continue
            groups[tuple(subs)].append(int(i))
        steps = []
        for subs, idx in groups.items():
            recs = [self.record(i) for i in idx]
            sources = {r["patent"] or r["doi"] or r["dataset"] for r in recs}
            steps.append({
                "product": product_flat,
                "substrates": list(subs),
                "n_records": len(recs),
                "n_sources": len(sources - {None}),
                "records": recs,
                # union over the records of this step: they share a substrate set but each writes
                # its own reactant side, so a co-substrate may appear in only one of them
                "unclassified": sorted({m for i in idx
                                        for m in unclassified_reactants(list(rf[i]), subs)}),
            })
        steps.sort(key=lambda s: (-s["n_sources"], -s["n_records"],
                                  -sum(r["yield_pct"] is not None for r in s["records"])))
        return steps


@dataclass
class Graph:
    target: str
    steps: dict[str, list[dict]] = field(default_factory=dict)       # molecule → recorded steps
    buyable: dict[str, str | None] = field(default_factory=dict)     # molecule → 'zinc'/'priced'/None
    heavy_atoms: dict[str, int] = field(default_factory=dict)
    truncated: bool = False

    def molecules(self) -> set[str]:
        return set(self.buyable)


def build_graph(target: str, index: RecordIndex, stock: Purchasable) -> Graph:
    t = flat(target)
    g = Graph(target=t)
    frontier = [(t, 0)]
    seen = {t}
    while frontier:
        mol, depth = frontier.pop(0)
        g.buyable[mol] = None if mol == t else stock.check(mol)
        g.heavy_atoms[mol] = _env(mol)[1]
        if mol != t and _small(mol, g.heavy_atoms[mol]):
            g.buyable[mol] = g.buyable[mol] or "small"
            continue
        expand = mol == t or g.buyable[mol] is None or g.heavy_atoms[mol] >= ADVANCED_HEAVY_ATOMS
        if not expand or depth >= MAX_DEPTH:
            continue
        steps = index.steps_for(mol)[:OPTIONS_PER_MOLECULE]
        if steps:
            g.steps[mol] = steps
        for s in steps:
            for sub in s["substrates"]:
                if sub not in seen:
                    if len(seen) >= MAX_MOLECULES:
                        g.truncated = True
                        continue
                    seen.add(sub)
                    frontier.append((sub, depth + 1))
    for mol in [m for m in seen if m not in g.buyable]:
        g.heavy_atoms[mol] = _env(mol)[1]
        g.buyable[mol] = stock.check(mol) or ("small" if _small(mol, g.heavy_atoms[mol]) else None)
    return g


def _small(mol: str, heavy_atoms: int) -> bool:
    if heavy_atoms <= SMALL_HEAVY_ATOMS:
        return True
    m = Chem.MolFromSmiles(mol)
    return m is None or not any(a.GetAtomicNum() == 6 for a in m.GetAtoms())


def enumerate_routes(g: Graph, max_routes: int = MAX_ROUTES) -> list[dict]:
    """Every combination of recorded steps from the target down to leaves, capped.

    A route is {"steps": [step indices as (molecule, option)], "leaves": {mol: status}, "complete"}.
    Leaf status: 'zinc' / 'priced' (buyable), 'small' (a small reagent, stock not checked) or
    'no_record' (nothing recorded makes it, not buyable).
    """
    def options(mol: str, path: frozenset, depth: int):
        out = []
        if mol != g.target and g.buyable.get(mol):
            out.append(([], {mol: g.buyable[mol]}))
        if mol in path or depth >= MAX_DEPTH:
            return out or [([], {mol: "no_record"})]
        for k, s in enumerate(g.steps.get(mol, [])):
            subtrees = [options(sub, path | {mol}, depth + 1) for sub in s["substrates"]]
            for combo in itertools.islice(itertools.product(*subtrees), max_routes):
                steps = [(mol, k)]
                leaves: dict[str, str] = {}
                for sub_steps, sub_leaves in combo:
                    steps = sub_steps + steps
                    leaves.update(sub_leaves)
                out.append((steps, leaves))
                if len(out) >= max_routes:
                    return out
        return out or [([], {mol: "no_record"})]

    routes = []
    for steps, leaves in options(g.target, frozenset(), 0)[:max_routes]:
        if not steps:
            continue
        routes.append({
            "steps": [{"product": m, "option": k} for m, k in steps],
            "leaves": leaves,
            "complete": all(v in ("zinc", "priced", "small") for v in leaves.values()),
            "n_steps": len(steps),
        })
    # complete first, then fewer steps, then better-sourced steps
    def sourced(r):
        return sum(g.steps[s["product"]][s["option"]]["n_sources"] for s in r["steps"])
    routes.sort(key=lambda r: (not r["complete"], r["n_steps"], -sourced(r)))
    return routes
