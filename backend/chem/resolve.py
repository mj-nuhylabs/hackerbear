"""이름/CAS/SMILES → 정규 SMILES + MW + SVG.

구조·분자량·InChIKey는 RDKit 계산값이고, 이름↔구조는 PubChem PUG REST 응답 그대로다.
우리가 지어내는 값은 없다. 못 찾으면 예외를 던지고, 없는 필드는 None이다.
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
# 구조로 조회할 때의 베이스. PUBCHEM은 /name으로 끝나므로 그걸 쓰면 경로가 틀어진다
PUBCHEM_SMILES = "https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/smiles"
CAS_RE = re.compile(r"\d{2,7}-\d{2}-\d")

# 다크/라이트 양쪽에서 읽히는 원자 색. 탄소(검정)는 SVG에서 currentColor로 치환된다
PALETTE = {
    0: (0, 0, 0), 6: (0, 0, 0), 1: (0, 0, 0),
    7: (0.24, 0.45, 0.88), 8: (0.86, 0.26, 0.22), 9: (0.16, 0.62, 0.56),
    15: (0.85, 0.5, 0.1), 16: (0.78, 0.6, 0.08), 17: (0.2, 0.62, 0.3),
    35: (0.65, 0.32, 0.16), 53: (0.5, 0.2, 0.6),
}


class ResolveError(ValueError):
    """입력을 구조로 읽지 못했다. 추측해서 채우지 않는다."""


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


def describe(smiles: str, name: str | None = None, cas: str | None = None, *, svg: bool = True) -> dict:
    """SMILES → 정규 SMILES + InChIKey + MW + SVG. 전부 RDKit 계산값."""
    mol = Chem.MolFromSmiles(smiles)
    if mol is None:
        raise ResolveError(f"RDKit could not read {smiles!r} as a structure")
    return {
        "smiles": Chem.MolToSmiles(mol),
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
    """이름 또는 CAS → PubChem 레코드. 응답 값을 그대로 쓴다."""
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
    """구조 → PubChem이 그 화합물을 부르는 이름(Title)과 CAS. 못 찾으면 빈 dict.

    이름으로 검색하면 PubChem Title이 붙어서 "Aspirin"이 뜨는데, 그려서 들어오거나 SMILES로
    들어오면 그 경로를 안 타서 이름이 없었다. 화학자가 아스피린을 그려 놓고 화면에서
    "2-(acetyloxy)benzoic acid"만 보는 이유가 이것이다. Title은 PubChem이 적어 둔 값 그대로다.
    """
    try:
        # PubChem은 기본 User-Agent로 온 요청을 거절한다. 사람 이메일이 아니라 클라이언트 이름을 보낸다
        with httpx.Client(timeout=15, headers={"User-Agent": "SynthPath/1.0"}) as c:
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
        # 이름이 없어도 앱은 돈다 — 구조로 하던 일을 그대로 한다
        return {}


def resolve(query: str, kind: str = "auto", *, svg: bool = True) -> dict:
    """{query, kind} → {smiles, inchikey, mw, svg, name, cas}. 실패하면 ResolveError."""
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
