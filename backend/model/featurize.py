"""Reaction -> fingerprint.

Training (train.py) and inference (predict.py) must use the same normalization path in this file.
Input format is forward "reactants>>product" (a reagent field is dropped; AiZynth steps have none).
"""
from __future__ import annotations

import numpy as np
import scipy.sparse as sp
from rdkit import Chem, RDLogger
from rdkit.Chem import rdFingerprintGenerator

RDLogger.DisableLog("rdApp.*")

N_BITS = 2048
KINDS = ("drfp", "diff")


def canon(smi: str, stereo: bool = True) -> str | None:
    """Remove atom maps + canonical SMILES. None if parsing fails."""
    m = Chem.MolFromSmiles(smi)
    if m is None:
        return None
    for a in m.GetAtoms():
        a.SetAtomMapNum(0)
    return Chem.MolToSmiles(m, isomericSmiles=stereo)


def normalize_rxn(rxn_smiles: str) -> str | None:
    """'A.B>reagents>P' or 'A.B>>P' -> 'A.B>>P' (canonical, reactants sorted, reagents removed). None on failure."""
    if not rxn_smiles or not isinstance(rxn_smiles, str):
        return None
    parts = rxn_smiles.strip().split(" ")[0].split(">")
    if len(parts) != 3:
        return None
    reac, _, prod = parts
    r = [canon(x) for x in reac.split(".") if x]
    p = [canon(x) for x in prod.split(".") if x]
    if not r or not p or None in r or None in p:
        return None
    return ".".join(sorted(r)) + ">>" + ".".join(sorted(p))


_morgan = None


def _diff_fp(rxn: str) -> np.ndarray:
    """Count-Morgan (r=2) difference: product - sum of reactants."""
    global _morgan
    if _morgan is None:
        _morgan = rdFingerprintGenerator.GetMorganGenerator(radius=2, fpSize=N_BITS)
    reac, prod = rxn.split(">>")
    v = np.zeros(N_BITS, dtype=np.int16)
    for s in prod.split("."):
        v += _morgan.GetCountFingerprintAsNumPy(Chem.MolFromSmiles(s)).astype(np.int16)
    for s in reac.split("."):
        v -= _morgan.GetCountFingerprintAsNumPy(Chem.MolFromSmiles(s)).astype(np.int16)
    return v


def featurize(rxns: list[str], kind: str = "drfp") -> sp.csr_matrix:
    """Normalized reaction list -> (n, N_BITS) CSR. Input must have passed normalize_rxn.

    Why CSR: DRFP sets only ~31 of 2048 bits. At a million rows,
    dense is several GB and sparse is a few hundred MB. LightGBM and sklearn both take CSR as is.
    """
    if kind == "drfp":
        from drfp import DrfpEncoder
        dense = np.vstack(DrfpEncoder.encode(list(rxns), n_folded_length=N_BITS)).astype(np.uint8)
    elif kind == "diff":
        dense = np.vstack([_diff_fp(r) for r in rxns])
    else:
        raise ValueError(f"unknown kind {kind!r}; use one of {KINDS}")
    # LightGBM only accepts CSR data as float32/float64 (uint8/int16 raises TypeError)
    return sp.csr_matrix(dense, dtype=np.float32)
