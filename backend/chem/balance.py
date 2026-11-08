"""Does a step's reactant list account for every heavy atom in its product?

Patent text-mining sometimes drops a reactant from the record: imatinib's ring-forming step is
recorded as "guanidine + dimethylamine → product", with the pyridyl enaminone that supplies the
pyrimidine carbons missing. A step like that cannot be costed — the material that is missing is
not on the bill — so the route's total is only a lower bound, and the UI must say so.

Counted per element, hydrogen excluded. Extra atoms on the reactant side (leaving groups,
counter-ions) are normal; only atoms the product has and no reactant supplies are reported.
"""
from __future__ import annotations

from collections import Counter

from rdkit import Chem, RDLogger

RDLogger.DisableLog("rdApp.*")


def _elements(smiles: str) -> Counter | None:
    m = Chem.MolFromSmiles(smiles)
    if m is None:
        return None
    return Counter(a.GetSymbol() for a in m.GetAtoms())


def missing_atoms(reactants: list[str], product: str) -> dict[str, int] | None:
    """{element: count} the product has beyond all listed reactants together. {} when the
    reactants cover the product; None when a structure cannot be read."""
    p = _elements(product)
    if p is None:
        return None
    have: Counter = Counter()
    for r in reactants:
        e = _elements(r)
        if e is None:
            return None
        have += e
    return {el: n - have[el] for el, n in sorted(p.items()) if n > have[el]}
