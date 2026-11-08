"""The 5 demo targets are the test set. Nothing about them may reach training.

Both learned models (model/transfer_ranker.py — which recorded procedure to adapt to a step,
and model/route_ranker.py — which candidate route looks like one chemists actually ran) are
shown in the demo on these 5 molecules. If their recorded reactions were in training, the demo
would show memorisation, not a model. So every training-set builder calls `is_held_out()` and
drops anything it flags.

Two rules:
  1. Near the demo targets: Morgan (r=2, 2048) Tanimoto >= NEIGHBOUR_TANIMOTO to any of the 5.
     This removes the targets themselves and their close analogues (imatinib's patent family
     is full of near-identical kinase inhibitors).
  2. In the demo route trees: any molecule listed in data/deep/holdout_molecules.txt, written
     by scripts/build_deep_targets.py from the 5 targets' recorded route trees (targets and
     every recorded intermediate). Building blocks bought off the shelf are not listed —
     those appear in thousands of unrelated reactions and are general chemistry.

LATE_TARGETS, below, are shown in the demo but are not covered by either rule — see its comment.
"""
from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from rdkit import Chem, DataStructs, RDLogger
from rdkit.Chem import rdFingerprintGenerator

RDLogger.DisableLog("rdApp.*")

DEMO_TARGETS = {
    "Imatinib": "Cc1ccc(NC(=O)c2ccc(CN3CCN(C)CC3)cc2)cc1Nc1nccc(-c2cccnc2)n1",
    "Osimertinib": "C=CC(=O)Nc1cc(Nc2nccc(-c3cn(C)c4ccccc34)n2)c(OC)cc1N(C)CCN(C)C",
    "Lidocaine": "CCN(CC)CC(=O)Nc1c(C)cccc1C",
    "Aspirin": "CC(=O)Oc1ccccc1C(=O)O",
    "Caffeine": "Cn1c(=O)c2c(ncn2C)n(C)c1=O",
}

# Targets precomputed for the demo that are NOT part of the held-out five above, because they were
# added after both models had finished training. Keeping them in their own dict is the honest
# bookkeeping: `is_held_out` governs what went into training, and training already happened, so
# adding a molecule to DEMO_TARGETS now would claim an exclusion that was never applied.
#
# S-phenyl thioformate is a deliberate case: the corpus holds no record that makes it and none
# that consumes it (checked over all 2.4 M reactions), so there is no reference route for either
# model to have memorised — and nothing to show as REPORTED either. What the demo shows for it is
# AiZynthFinder's proposal, graded on what precedent the corpus does have for each step.
LATE_TARGETS = {
    "S-phenyl thioformate": "O=CSc1ccccc1",
}
ALL_TARGETS = {**DEMO_TARGETS, **LATE_TARGETS}
NEIGHBOUR_TANIMOTO = 0.6
HOLDOUT_FILE = Path(__file__).resolve().parents[1] / "data/deep/holdout_molecules.txt"


def slug(name: str) -> str:
    """Target name → the stem of its precomputed files. Lower case with runs of anything that is
    not a letter or digit collapsed to '_', so a name with a space in it ("S-phenyl thioformate")
    does not put a space in a filename. The five single-word names are unchanged by this."""
    import re
    return re.sub(r"[^a-z0-9]+", "_", name.lower()).strip("_")

_gen = rdFingerprintGenerator.GetMorganGenerator(radius=2, fpSize=2048)


def _flat(smiles: str) -> str | None:
    m = Chem.MolFromSmiles(smiles) if smiles else None
    if m is None:
        return None
    for a in m.GetAtoms():
        a.SetAtomMapNum(0)
    return Chem.MolToSmiles(m, isomericSmiles=False)


@lru_cache(maxsize=1)
def _target_fps():
    return [_gen.GetFingerprint(Chem.MolFromSmiles(s)) for s in DEMO_TARGETS.values()]


@lru_cache(maxsize=1)
def held_out_molecules() -> frozenset[str]:
    """Non-isomeric canonical SMILES from the demo route trees. Empty until the deep builder ran."""
    if not HOLDOUT_FILE.exists():
        return frozenset()
    return frozenset(x.strip() for x in HOLDOUT_FILE.read_text().splitlines() if x.strip())


def holdout_file_ready() -> bool:
    return HOLDOUT_FILE.exists()


def is_demo_neighbour(smiles: str) -> bool:
    m = Chem.MolFromSmiles(smiles) if smiles else None
    if m is None:
        return False
    fp = _gen.GetFingerprint(m)
    return max(DataStructs.BulkTanimotoSimilarity(fp, _target_fps())) >= NEIGHBOUR_TANIMOTO


def is_held_out(smiles: str) -> bool:
    """True if this molecule must not appear in any training example."""
    f = _flat(smiles)
    if f is None:
        return False
    if f in held_out_molecules():
        return True
    return is_demo_neighbour(smiles)
