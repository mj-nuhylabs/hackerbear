"""Name/CAS/SMILES -> canonical SMILES + MW + SVG.

Structure, molecular weight and InChIKey are RDKit-computed; name<->structure is the PubChem PUG REST response verbatim.
We invent no values. If nothing is found we raise, and missing fields are None.
"""
from __future__ import annotations

import re
from functools import lru_cache

import httpx
from rdkit import Chem, RDLogger
from rdkit.Chem import Descriptors
from rdkit.Chem.Draw import rdMolDraw2D

RDLogger.DisableLog("rdApp.*")

PUBCHEM = "https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name"
# Base for structure lookups. PUBCHEM ends in /name, so reusing it would break the path
PUBCHEM_SMILES = "https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/smiles"
CAS_RE = re.compile(r"\d{2,7}-\d{2}-\d")

# Atom colors readable on both dark and light backgrounds. Carbon (black) is replaced with currentColor in the SVG
PALETTE = {
    0: (0, 0, 0), 6: (0, 0, 0), 1: (0, 0, 0),
    7: (0.24, 0.45, 0.88), 8: (0.86, 0.26, 0.22), 9: (0.16, 0.62, 0.56),
    15: (0.85, 0.5, 0.1), 16: (0.78, 0.6, 0.08), 17: (0.2, 0.62, 0.3),
    35: (0.65, 0.32, 0.16), 53: (0.5, 0.2, 0.6),
}


class ResolveError(ValueError):
    """The input could not be read as a structure. We do not guess to fill it in."""


def mol_svg(mol, size=(260, 200)) -> str:
    d = rdMolDraw2D.MolDraw2DSVG(*size)
    o = d.drawOptions()
    o.clearBackground = False
    o.bondLineWidth = 1.6
    o.padding = 0.08
    o.updateAtomPalette(PALETTE)
    rdMolDraw2D.PrepareAndDrawMolecule(d, mol)
    d.FinishDrawing()
    svg = d.GetDrawingText()
    svg = re.sub(r"<\?xml[^>]*\?>\s*", "", svg)
    svg = re.sub(r"<!-- .*? -->\s*", "", svg)
    svg = re.sub(r"width='\d+px' height='\d+px' ", "", svg)
    return svg.replace("#000000", "currentColor").strip()


def describe(smiles: str, name: str | None = None, cas: str | None = None, *, svg: bool = True,
             look_up_name: bool = False) -> dict:
    """SMILES -> canonical SMILES + InChIKey + MW + SVG. All RDKit-computed.

    Turn look_up_name on only for molecules whose name **is shown on screen**. When on, chem/names.name_for looks up a
    supplier product name or PubChem title; PubChem is limited to 5 req/s, so this is a network call.
    Calling it for every leaf material of thousands of candidate routes adds minutes to the build (we hit this once).
    """
    mol = Chem.MolFromSmiles(smiles)
    if mol is None:
        raise ResolveError(f"RDKit could not read {smiles!r} as a structure")
    canon = Chem.MolToSmiles(mol)
    if name is None and look_up_name:
        # The supplier's own product name, else PubChem's title — "Aspirin", not
        # "2-(acetyloxy)benzoic acid" and not a bare SMILES (chem/names.py, disk-cached). Without
        # this the experimental section headed every step "Title compound", because nothing had
        # asked for a name for the one molecule the step is about.
        from .names import name_for
        try:
            name = name_for(canon)
        except Exception:
            name = None
    return {
        "smiles": canon,
        "inchikey": Chem.MolToInchiKey(mol) or None,
        "mw": round(Descriptors.MolWt(mol), 2),
        "name": name,
        "cas": cas,
        "svg": mol_svg(mol) if svg else None,
    }


def detect_kind(query: str) -> str:
    s = query.strip()
    if CAS_RE.fullmatch(s):
        return "cas"
    if not re.search(r"\s", s) and re.search(r"[0-9=#()\[\]@/\\]", s) and Chem.MolFromSmiles(s) is not None:
        return "smiles"
    return "name"


@lru_cache(maxsize=512)
def pubchem(term: str) -> dict:
    """Name or CAS -> PubChem record. Uses the response values as they are."""
    try:
        with httpx.Client(timeout=20) as c:
            r = c.get(f"{PUBCHEM}/{term}/property/SMILES,InChIKey,Title/JSON")
            if r.status_code == 404:
                raise ResolveError(f"PubChem has no compound named {term!r}")
            r.raise_for_status()
            p = r.json()["PropertyTable"]["Properties"][0]
            syns: list[str] = []
            rs = c.get(f"{PUBCHEM}/{term}/synonyms/JSON")
            if rs.status_code == 200:
                syns = rs.json()["InformationList"]["Information"][0].get("Synonym", [])
    except httpx.HTTPError as e:
        raise ResolveError(f"PubChem did not answer: {e}") from e
    smiles = p.get("SMILES") or p.get("IsomericSMILES") or p.get("CanonicalSMILES")
    if not smiles:
        raise ResolveError(f"PubChem returned no SMILES for {term!r}")
    return {"smiles": smiles, "title": p.get("Title") or term,
            "cas": next((s for s in syns if CAS_RE.fullmatch(s)), None)}


@lru_cache(maxsize=2048)
def pubchem_title(smiles: str) -> dict:
    """Structure -> the name PubChem calls the compound (Title) and its CAS. Empty dict if not found.

    Searching by name attaches the PubChem Title, so "Aspirin" shows up; a structure that was drawn or entered as SMILES
    did not take that path, so it had no name. This is why a chemist who drew aspirin saw only
    "2-(acetyloxy)benzoic acid" on screen. The Title is exactly what PubChem has recorded.
    """
    try:
        # PubChem rejects requests with the default User-Agent. Send a client name, not a personal email
        with httpx.Client(timeout=15, headers={"User-Agent": "SynPath/1.0"}) as c:
            r = c.get(f"{PUBCHEM_SMILES}/{smiles}/property/Title/JSON")
            if r.status_code != 200:
                return {}
            title = (r.json()["PropertyTable"]["Properties"][0] or {}).get("Title")
            cas = None
            rs = c.get(f"{PUBCHEM_SMILES}/{smiles}/synonyms/JSON")
            if rs.status_code == 200:
                syns = rs.json()["InformationList"]["Information"][0].get("Synonym", [])
                cas = next((s for s in syns if CAS_RE.fullmatch(s)), None)
            return {"title": title or None, "cas": cas}
    except Exception:
        # The app works without a name -- do what we did with the structure alone
        return {}


def resolve(query: str, kind: str = "auto", *, svg: bool = True) -> dict:
    """{query, kind} -> {smiles, inchikey, mw, svg, name, cas}. Raises ResolveError on failure."""
    q = (query or "").strip()
    if not q:
        raise ResolveError("the query is empty")
    k = detect_kind(q) if kind in ("auto", "", None) else kind
    if k == "smiles":
        out = describe(q, svg=svg)
        pc = pubchem_title(out["smiles"])
        return {**out, "name": out.get("name") or pc.get("title"),
                "cas": out.get("cas") or pc.get("cas")}
    if k in ("name", "cas"):
        pc = pubchem(q)
        return describe(pc["smiles"], name=pc["title"], cas=pc["cas"], svg=svg)
    raise ResolveError(f"unknown kind {kind!r}; use smiles, name, cas or auto")
