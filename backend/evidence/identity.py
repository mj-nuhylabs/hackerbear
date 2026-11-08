"""Does the structure a record gives match the name it gives?

ORD resolves the names its mining pulled out into structures, and sometimes resolves them to the
wrong molecule. The aspirin patent US07544831B2 names its catalyst "zirconia" — the text says
"Nano-crystalline sulfated zirconia catalyst (SZ-1)" — and the structure attached to it is
COc1ccc(C2CCCC(c3ccc(OC)c(OC)c3)O2)cc1OC, a tetramethoxy diaryl oxane with no zirconium in it at
all. The step was drawing that as its catalyst.

The check is narrow on purpose. A name that says which element the substance is built on is a
claim that can be checked against the formula, and nothing else here is guessed at: if the name
carries no element, or the structure cannot be read, the pair is left alone. One record of the
same reaction gives the name with no structure, which is the honest version of the same entry.
"""
from __future__ import annotations

import re

from rdkit import Chem, RDLogger

RDLogger.DisableLog("rdApp.*")

# Name fragment → the element the substance must contain. Oxide and salt names ("zirconia",
# "alumina") and plain metal names are the cases that matter; an organic name implies no element
# in particular and is not checked.
ELEMENT_WORDS = {
    "zirconi": "Zr", "titani": "Ti", "alumin": "Al", "silica": "Si", "magnesi": "Mg",
    "palladi": "Pd", "platin": "Pt", "rhodi": "Rh", "rutheni": "Ru", "iridi": "Ir",
    "nickel": "Ni", "copper": "Cu", "cupr": "Cu", "iron": "Fe", "ferr": "Fe",
    "zinc": "Zn", "mangan": "Mn", "chromi": "Cr", "cobalt": "Co", "molybd": "Mo",
    "tungst": "W", "vanadi": "V", "ceri": "Ce", "lanthan": "La", "scandi": "Sc",
    "cadmi": "Cd", "mercur": "Hg", "silver": "Ag", "gold": "Au", "tin ": "Sn",
    "stann": "Sn", "lead": "Pb", "bismuth": "Bi", "boron": "B", "lithium": "Li",
    "sodium": "Na", "potassium": "K", "caesium": "Cs", "cesium": "Cs", "calcium": "Ca",
    "barium": "Ba", "strontium": "Sr", "selen": "Se", "tellur": "Te", "phosphor": "P",
}


def element_claimed(name: str | None) -> str | None:
    """The element a substance name says it is built on, or None when it says nothing."""
    n = (name or "").lower()
    if not n:
        return None
    for frag, el in ELEMENT_WORDS.items():
        if frag in n:
            return el
    return None


def mismatch(name: str | None, smiles: str | None) -> str | None:
    """Why this name and structure cannot be the same substance, or None when they can.

    Only a disagreement the name itself makes checkable is reported. Everything else passes.
    """
    el = element_claimed(name)
    if not el or not smiles:
        return None
    m = Chem.MolFromSmiles(smiles)
    if m is None:
        return None
    if any(a.GetSymbol() == el for a in m.GetAtoms()):
        return None
    formula = "".join(sorted({a.GetSymbol() for a in m.GetAtoms()}))
    return (f"the record calls this {name}, which contains {el}, but the structure it gives "
            f"has only {formula}")


def safe_structure(name: str | None, smiles: str | None) -> str | None:
    """The structure, or None when it contradicts the name. The name is always kept by the caller."""
    return None if mismatch(name, smiles) else smiles
