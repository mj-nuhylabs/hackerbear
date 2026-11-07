"""반응 → fingerprint.

학습(train.py)과 추론(predict.py)이 반드시 이 파일의 같은 정규화 경로를 쓴다.
입력 형식은 정방향 "reactants>>product" (시약 칸이 있으면 버린다 — AiZynth 스텝에는 시약이 없다).
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
    """atom map 제거 + canonical SMILES. 파싱 실패면 None."""
    m = Chem.MolFromSmiles(smi)
    if m is None:
        return None
    for a in m.GetAtoms():
        a.SetAtomMapNum(0)
    return Chem.MolToSmiles(m, isomericSmiles=stereo)


def normalize_rxn(rxn_smiles: str) -> str | None:
    """'A.B>reagents>P' 또는 'A.B>>P' → 'A.B>>P' (canonical, 반응물 정렬, 시약 제거). 실패면 None."""
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
    """count Morgan(r=2) 차분: 생성물 − Σ반응물."""
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
    """정규화된 반응 리스트 → (n, N_BITS) CSR. 입력은 normalize_rxn을 통과한 것이어야 한다.

    CSR로 돌려주는 이유: DRFP는 2048비트 중 ~31비트만 켜진다. 백만 행 규모에서
    dense면 수 GB, sparse면 수백 MB다. LightGBM과 sklearn 둘 다 CSR을 그대로 받는다.
    """
    if kind == "drfp":
        from drfp import DrfpEncoder
        dense = np.vstack(DrfpEncoder.encode(list(rxns), n_folded_length=N_BITS)).astype(np.uint8)
    elif kind == "diff":
        dense = np.vstack([_diff_fp(r) for r in rxns])
    else:
        raise ValueError(f"unknown kind {kind!r}; use one of {KINDS}")
    # LightGBM은 CSR의 data가 float32/float64일 때만 받는다 (uint8/int16이면 TypeError)
    return sp.csr_matrix(dense, dtype=np.float32)
