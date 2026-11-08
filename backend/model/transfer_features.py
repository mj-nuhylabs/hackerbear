"""Features for Model A — which recorded procedure to adapt to a step.

Model A ranks the nearest recorded reactions (analog index rows) for a step by how likely their
recorded conditions are the ones a chemist actually used for *this* substrate. It never writes
conditions: it only orders records that exist. Training (scripts/build_transfer_dataset.py) and
inference (model/transfer_ranker.py) both go through this file, so a step and an index row are
described the same way.

Per index row (built once, `build_rows`):
  * the reaction is split into substrates (end up in the product) and everything else on the
    reactant side (bases, acids, coupling agents, solvents — USPTO writes them there). The
    split uses evidence/recorded_routes.substrates_of, the same rule the recorded-route search uses
  * cond set = recorded solvents ∪ catalysts ∪ reagents ∪ non-substrate reactant-side molecules,
    as canonical SMILES. This is what a procedure *does*; it is the label, never a query feature
  * fingerprints (Morgan r=2, 2048, packed) of the product and the two largest substrates
  * product descriptors, record metadata (counts, yield, temperature, source kind)

A query is described only by its substrates and product — exactly what an AiZynth or recorded step
gives us. Its own conditions are never a feature.
"""
from __future__ import annotations

import math
from pathlib import Path

import numpy as np
from rdkit import Chem, RDLogger
from rdkit.Chem import Crippen, Descriptors, rdFingerprintGenerator, rdMolDescriptors
from rdkit.Chem.Scaffolds import MurckoScaffold

RDLogger.DisableLog("rdApp.*")

DATA = Path(__file__).resolve().parents[1] / "data"
TRANSFER = DATA / "transfer"
N_BITS = 2048
N_BYTES = N_BITS // 8
_POP = np.array([bin(i).count("1") for i in range(256)], dtype=np.uint8)

DESC_NAMES = ["heavy_atoms", "rings", "aromatic_rings", "aromatic_n", "n_count", "o_count",
              "s_count", "halogen_count", "logp", "tpsa", "frac_sp3", "stereocentres"]
META_NAMES = ["n_records", "n_yields", "yield_median", "temperature_c", "time_h", "has_solvent",
              "has_catalyst", "is_patent", "n_substrates", "n_cond"]

_gen = None
_canon_cache: dict[str, str] = {}


def _morgan():
    global _gen
    if _gen is None:
        _gen = rdFingerprintGenerator.GetMorganGenerator(radius=2, fpSize=N_BITS)
    return _gen


def canon_component(s: str) -> str:
    """Canonical SMILES of one recorded component; the raw string if RDKit cannot read it."""
    if s not in _canon_cache:
        m = Chem.MolFromSmiles(s)
        _canon_cache[s] = Chem.MolToSmiles(m, isomericSmiles=False) if m is not None else s
    return _canon_cache[s]


def packed_fp(mol) -> np.ndarray:
    bits = np.zeros(N_BITS, dtype=np.uint8)
    if mol is not None:
        bits[list(_morgan().GetFingerprint(mol).GetOnBits())] = 1
    return np.packbits(bits)


def descriptors(mol) -> np.ndarray:
    if mol is None:
        return np.full(len(DESC_NAMES), np.nan, dtype=np.float32)
    sym = [a.GetSymbol() for a in mol.GetAtoms()]
    return np.array([
        mol.GetNumHeavyAtoms(),
        rdMolDescriptors.CalcNumRings(mol),
        rdMolDescriptors.CalcNumAromaticRings(mol),
        sum(1 for a in mol.GetAtoms() if a.GetIsAromatic() and a.GetSymbol() == "N"),
        sym.count("N"), sym.count("O"), sym.count("S"),
        sum(sym.count(x) for x in ("F", "Cl", "Br", "I")),
        Crippen.MolLogP(mol),
        rdMolDescriptors.CalcTPSA(mol),
        rdMolDescriptors.CalcFractionCSP3(mol),
        len(Chem.FindMolChiralCenters(mol, includeUnassigned=True)),
    ], dtype=np.float32)


def scaffold(mol) -> str:
    try:
        return MurckoScaffold.MurckoScaffoldSmiles(mol=mol) or "acyclic"
    except Exception:
        return "acyclic"


def describe_reaction(left: list[str], product: str):
    """(substrates, others, product_mol) from flat canonical molecules. Substrates sorted by size, largest first."""
    from evidence.recorded_routes import substrates_of
    subs = substrates_of(left, product)
    others = [x for x in left if x not in subs]
    pm = Chem.MolFromSmiles(product)
    subs.sort(key=lambda s: -(Chem.MolFromSmiles(s).GetNumHeavyAtoms() if Chem.MolFromSmiles(s) else 0))
    return subs, others, pm


def _split_flat(side: str) -> list[str]:
    out = []
    for x in side.split("."):
        if not x:
            continue
        m = Chem.MolFromSmiles(x)
        if m is not None:
            out.append(Chem.MolToSmiles(m, isomericSmiles=False))
    return out


def query_row(rxn: str) -> dict | None:
    """Features of a step given as 'substrates>>product' (no reagents)."""
    left, _, right = rxn.partition(">>")
    lf, rf = _split_flat(left), _split_flat(right)
    if not lf or not rf:
        return None
    product = max(rf, key=lambda s: Chem.MolFromSmiles(s).GetNumHeavyAtoms())
    subs, _others, pm = describe_reaction(lf, product)
    if not subs:          # a step always has substrates; keep the largest reactants if the filter dropped all
        subs = sorted(lf, key=lambda s: -Chem.MolFromSmiles(s).GetNumHeavyAtoms())
    s1 = Chem.MolFromSmiles(subs[0])
    s2 = Chem.MolFromSmiles(subs[1]) if len(subs) > 1 else None
    return {
        "fp_prod": packed_fp(pm), "fp_sub1": packed_fp(s1), "fp_sub2": packed_fp(s2),
        "has_sub2": s2 is not None, "desc": descriptors(pm), "n_substrates": len(subs),
        "product": product, "substrates": subs,
    }


def query_rxn(rxn: str) -> str | None:
    """'reactants>>product' → 'substrates>>product' (isomeric, normalized): the retrieval query.

    Training queries are written this way (reagents dropped by the substrate rule), so a route
    step is searched the same way before Model A ranks what comes back.
    """
    from model.featurize import normalize_rxn
    left, _, right = rxn.partition(">>")
    lm = [(s, Chem.MolFromSmiles(s)) for s in left.split(".") if s]
    rm = [(s, Chem.MolFromSmiles(s)) for s in right.split(".") if s]
    lm = [(s, m) for s, m in lm if m is not None]
    rm = [(s, m) for s, m in rm if m is not None]
    if not lm or not rm:
        return None
    iso = {Chem.MolToSmiles(m, isomericSmiles=False): s for s, m in lm}
    p_iso, p_mol = max(rm, key=lambda x: x[1].GetNumHeavyAtoms())
    subs, _o, _p = describe_reaction(list(iso), Chem.MolToSmiles(p_mol, isomericSmiles=False))
    if not subs:
        return normalize_rxn(rxn)
    return normalize_rxn(".".join(iso[s] for s in subs) + ">>" + p_iso)


# ------------------------------------------------------------------ pair features
def popcount_rows(a: np.ndarray) -> np.ndarray:
    return _POP[a].sum(axis=-1, dtype=np.int32)


def tanimoto(q: np.ndarray, C: np.ndarray) -> np.ndarray:
    """q (N_BYTES,), C (k, N_BYTES) packed bits → (k,) Tanimoto."""
    inter = popcount_rows(np.bitwise_and(C, q[None, :]))
    union = popcount_rows(np.bitwise_or(C, q[None, :]))
    return np.where(union > 0, inter / np.maximum(union, 1), 0.0).astype(np.float32)


def cond_sets(rows: np.ndarray, ptr: np.ndarray, ids: np.ndarray) -> list[np.ndarray]:
    return [ids[ptr[r]:ptr[r + 1]] for r in rows]


def jaccard_matrix(sets: list[np.ndarray]) -> np.ndarray:
    """(k, k) Jaccard between candidate cond sets. Empty vs empty is 0 (no evidence of agreement)."""
    k = len(sets)
    vocab = np.unique(np.concatenate(sets)) if any(len(s) for s in sets) else np.empty(0, dtype=np.int32)
    if len(vocab) == 0:
        return np.zeros((k, k), dtype=np.float32)
    M = np.zeros((k, len(vocab)), dtype=np.float32)
    for i, s in enumerate(sets):
        if len(s):
            M[i, np.searchsorted(vocab, s)] = 1.0
    inter = M @ M.T
    size = M.sum(axis=1)
    union = size[:, None] + size[None, :] - inter
    return np.where(union > 0, inter / np.maximum(union, 1), 0.0).astype(np.float32)


PAIR_NAMES = (
    ["sim", "rank", "sim_gap_top", "sim_rel_top", "tan_prod", "tan_sub1", "tan_sub2", "tan_sub_cross",
     "d_n_substrates", "q_heavy_atoms", "q_aromatic_n", "q_n_substrates"]
    + [f"d_{n}" for n in DESC_NAMES]
    + ["c_log_records", "c_n_yields", "c_yield_median", "c_has_temp", "c_has_time", "c_has_solvent",
       "c_has_catalyst", "c_is_patent", "c_n_cond", "cons_mean", "cons_wmean", "cons_rank", "cons_top5"]
)


def pair_features(q: dict, cand_rows: np.ndarray, sims: np.ndarray, store: dict) -> np.ndarray:
    """(k, len(PAIR_NAMES)) features for one query and its candidate rows (sorted by sim, desc)."""
    k = len(cand_rows)
    fp_prod, fp_sub1, fp_sub2 = store["fp_prod"], store["fp_sub1"], store["fp_sub2"]
    C1, C2 = fp_sub1[cand_rows], fp_sub2[cand_rows]
    has2 = store["has_sub2"][cand_rows]
    t_prod = tanimoto(q["fp_prod"], fp_prod[cand_rows])
    t_s1 = tanimoto(q["fp_sub1"], C1)
    if q["has_sub2"]:
        t_s2 = np.where(has2, tanimoto(q["fp_sub2"], C2), np.nan)
        t_cross = np.where(has2, np.maximum(tanimoto(q["fp_sub1"], C2), tanimoto(q["fp_sub2"], C1)), np.nan)
    else:
        t_s2 = np.full(k, np.nan, dtype=np.float32)
        t_cross = np.full(k, np.nan, dtype=np.float32)
    meta = store["meta"][cand_rows]
    desc = store["desc"][cand_rows]
    top = sims[0] if k else 0.0

    sets = cond_sets(cand_rows, store["cond_ptr"], store["cond_ids"])
    J = jaccard_matrix(sets)
    np.fill_diagonal(J, np.nan)
    with np.errstate(invalid="ignore"):
        cons_mean = np.nanmean(J, axis=1) if k > 1 else np.zeros(k)
        w = np.broadcast_to(sims[None, :], (k, k)).copy()
        np.fill_diagonal(w, 0.0)
        cons_w = np.nansum(J * w, axis=1) / np.maximum(w.sum(axis=1), 1e-9)
        top5 = np.nanmean(J[:, :min(5, k)], axis=1) if k > 1 else np.zeros(k)
    cons_rank = (-np.nan_to_num(cons_w)).argsort().argsort().astype(np.float32)

    n_records = meta[:, 0]
    F = np.column_stack([
        sims, np.arange(k, dtype=np.float32), top - sims, sims / max(top, 1e-9),
        t_prod, t_s1, t_s2, t_cross,
        np.abs(meta[:, 8] - q["n_substrates"]),
        np.full(k, q["desc"][0]), np.full(k, q["desc"][3]), np.full(k, q["n_substrates"]),
        np.abs(desc - q["desc"][None, :]),
        np.log1p(n_records), meta[:, 1], meta[:, 2], ~np.isnan(meta[:, 3]), ~np.isnan(meta[:, 4]),
        meta[:, 5], meta[:, 6], meta[:, 7], meta[:, 9],
        np.nan_to_num(cons_mean), np.nan_to_num(cons_w), cons_rank, np.nan_to_num(top5),
    ]).astype(np.float32)
    return F


# ------------------------------------------------------------------ labels
REL_THRESHOLDS = (0.25, 0.5, 0.75)     # Jaccard of cond sets → relevance 1 / 2 / 3
TEMP_TOLERANCE_C = 30.0


def relevance(q_set: np.ndarray, cand_sets: list[np.ndarray], q_temp: float, cand_temps: np.ndarray) -> np.ndarray:
    """Graded 0–3: how closely a candidate's recorded conditions match what was recorded for the query."""
    out = np.zeros(len(cand_sets), dtype=np.int32)
    qs = set(q_set.tolist())
    for i, s in enumerate(cand_sets):
        cs = set(s.tolist())
        u = len(qs | cs)
        j = len(qs & cs) / u if u else 0.0
        r = sum(j >= t for t in REL_THRESHOLDS)
        if r and not math.isnan(q_temp) and not math.isnan(cand_temps[i]) and abs(q_temp - cand_temps[i]) > TEMP_TOLERANCE_C:
            r -= 1
        out[i] = r
    return out


def load_store(mmap: bool = True) -> dict:
    mode = "r" if mmap else None
    s = {k: np.load(TRANSFER / f"{k}.npy", mmap_mode=mode)
         for k in ("fp_prod", "fp_sub1", "fp_sub2", "has_sub2", "desc", "meta", "cond_ptr", "cond_ids")}
    return s
