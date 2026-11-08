"""Data generator for the UI mockup.

Real values: structure (SVG), canonical SMILES, MW, InChIKey (RDKit) / routes, templates, precedent counts (AiZynthFinder + USPTO template library)
         / name->SMILES, CAS (PubChem PUG REST)
Example values: price, source ID, literature yield, reaction conditions, plausibility score, explanation text, gaps; each is listed in the record's `mock` field

Usage: .venv/bin/python scripts/make_mock_data.py imatinib lidocaine celecoxib
Output: frontend/src/mock/demo.json
"""
import hashlib
import json
import re
import sys
from pathlib import Path

import httpx
from rdkit import Chem, RDLogger
from rdkit.Chem import Descriptors
from rdkit.Chem.Draw import rdMolDraw2D

RDLogger.DisableLog("rdApp.*")

ROOT = Path(__file__).resolve().parents[1]
CONFIG = ROOT / "backend/data/aizynth/config.yml"
OUT = ROOT / "frontend/src/mock/demo.json"
ANALOGOUS_MIN_PRECEDENTS = 10
MAX_ROUTES = 5

# Atom colors that read on both dark and light. Carbon (black) is replaced with currentColor in the SVG
PALETTE = {
    0: (0, 0, 0), 6: (0, 0, 0), 1: (0, 0, 0),
    7: (0.24, 0.45, 0.88), 8: (0.86, 0.26, 0.22), 9: (0.16, 0.62, 0.56),
    15: (0.85, 0.5, 0.1), 16: (0.78, 0.6, 0.08), 17: (0.2, 0.62, 0.3),
    35: (0.65, 0.32, 0.16), 53: (0.5, 0.2, 0.6),
}


def h(s: str) -> int:
    return int(hashlib.sha1(s.encode()).hexdigest(), 16)


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


compounds: dict[str, dict] = {}


def compound(smiles: str, name: str | None = None) -> dict:
    mol = Chem.MolFromSmiles(smiles)
    can = Chem.MolToSmiles(mol)
    if can not in compounds:
        compounds[can] = {
            "smiles": can,
            "inchikey": Chem.MolToInchiKey(mol),
            "mw": round(Descriptors.MolWt(mol), 2),
            "name": name,
            "svg": mol_svg(mol),
        }
    elif name and not compounds[can]["name"]:
        compounds[can]["name"] = name
    return {k: v for k, v in compounds[can].items() if k != "svg"}


def pubchem(name: str) -> dict:
    base = "https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name"
    with httpx.Client(timeout=20) as c:
        props = c.get(f"{base}/{name}/property/SMILES,InChIKey,Title/JSON").json()
        p = props["PropertyTable"]["Properties"][0]
        syn = c.get(f"{base}/{name}/synonyms/JSON").json()
        syns = syn["InformationList"]["Information"][0]["Synonym"]
    cas = next((s for s in syns if re.fullmatch(r"\d{2,7}-\d{2}-\d", s)), None)
    return {"smiles": p.get("SMILES") or p.get("IsomericSMILES"), "title": p.get("Title", name), "cas": cas}


def mock_price(smiles: str) -> dict:
    x = h(smiles)
    pack = [5, 25, 100, 500][x % 4]
    per_g = round(0.4 + (x % 3800) / 100, 2)  # 0.4–38.4 USD/g
    discount = [1.0, 0.7, 0.5, 0.35][x % 4]
    return {
        "price_per_g": per_g,
        "pack_size_g": pack,
        "pack_price": round(per_g * pack * discount, 2),
        "currency": "USD",
        "supplier": "Example supplier",
        "as_of_date": "2026-11-01",
        "mock": True,
    }


# gaps (substrate classes this template has not been tried on) are not generated here.
#
# It used to be picked from GAP_POOL by template hash. It is a claim about the literature, not a number,
# which made it worse: "this template has never been tried on ortho,ortho-disubstituted aryls" is a fact
# you only know by counting the corpus, and we were drawing it from a hash (absolute rules 1 and 2).
#
# Live /routes does not emit gaps at all, and when they are missing the UI shows "— Not computed for this step yet."
# That honest empty state already exists, so leaving it empty here is the right thing.
# To fill it for real, count substrate classes per template in the corpus (GET /gaps, not implemented).


def walk(node: dict, steps: list, leaves: dict):
    """Post-order traversal of the AiZynth route dict (target->leaves); steps come out in topological order, starting material->target."""
    if node["type"] != "mol":
        return
    if not node.get("children"):
        c = compound(node["smiles"])
        leaves[c["smiles"]] = {**c, "in_stock": bool(node.get("in_stock"))}
        return
    rxn = node["children"][0]
    for child in rxn["children"]:
        walk(child, steps, leaves)
    md = rxn.get("metadata", {})
    reactants = [compound(m["smiles"]) for m in rxn["children"]]
    product = compound(node["smiles"])
    occ = int(md.get("library_occurence") or 0)
    tier = "ANALOGOUS" if occ >= ANALOGOUS_MIN_PRECEDENTS else "COMPUTED"
    steps.append({
        "rxn_smiles": ".".join(r["smiles"] for r in reactants) + ">>" + product["smiles"],
        "template_id": md.get("template_hash"),
        "classification": md.get("classification"),
        "reactants": reactants,
        "product": product,
        "evidence": {
            "tier": tier,
            # The AiZynthFinder template table has no patent numbers (it has only four columns: retro_template, template_hash,
            # classification, library_occurence). We leave it empty rather than invent one;
            # the real source is attached from ORD records by scripts/attach_procedures.py.
            "source_ids": [],
            "precedent_count": occ,
            "url": None,
            "mock": [],
        },
        "conditions": None,
        "reported_yield": None,
        "assumed_yield": 0.7,
        # The plausibility score is not generated here. scripts/bake_plausibility.py fills it with the trained model.
        # (Same structure as procedures/sources being attached by scripts/attach_procedures.py.)
        # When empty the UI shows "—". Until it is filled, that is the correct display.
        "plausibility_raw": None,
        "plausibility_calibrated": None,
        "mock": [],
    })


def main(names: list[str]):
    from aizynthfinder.aizynthfinder import AiZynthFinder

    f = AiZynthFinder(configfile=str(CONFIG))
    f.stock.select("zinc")
    f.expansion_policy.select("uspto")
    f.filter_policy.select("uspto")
    f.config.search.time_limit = 45
    f.config.search.iteration_limit = 300

    targets, prices = [], {}
    for name in names:
        pc = pubchem(name)
        tgt = compound(pc["smiles"], pc["title"])
        f.target_smiles = tgt["smiles"]
        f.tree_search()
        f.build_routes()
        stats = f.extract_statistics()
        routes = []
        for i, (rd, sc) in enumerate(zip(f.routes.dicts, f.routes.scores)):
            steps, leaves = [], {}
            walk(rd, steps, leaves)
            if not steps:
                continue
            routes.append({
                "id": f"{name[:3].upper()}-{i + 1}",
                "steps": steps,
                "leaf_materials": list(leaves.values()),
                "aizynth_score": round(float(sc.get("state score", next(iter(sc.values())))), 3),
            })
        # Show multi-step routes first, but keep score order
        routes = sorted(routes, key=lambda r: (-min(len(r["steps"]), 3), -r["aizynth_score"]))[:MAX_ROUTES]
        routes.sort(key=lambda r: -r["aizynth_score"])
        for r in routes:
            for leaf in r["leaf_materials"]:
                prices[leaf["smiles"]] = mock_price(leaf["smiles"])
        print(f"{name}: solved={stats['is_solved']} routes={len(routes)} steps={[len(r['steps']) for r in routes]}")
        targets.append({
            "name": pc["title"],
            "cas": pc["cas"],
            "aliases": [name.lower(), pc["title"].lower()] + ([pc["cas"]] if pc["cas"] else []),
            "compound": tgt,
            "search": {"solved": bool(stats["is_solved"]), "search_time_s": round(stats["search_time"], 1)},
            "routes": routes,
        })

    # Evidence tier, conditions and yield are not generated here. scripts/attach_procedures.py attaches them from ORD records.

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps({
        "generated_by": "scripts/make_mock_data.py",
        "analogous_min_precedents": ANALOGOUS_MIN_PRECEDENTS,
        "targets": targets,
        "compounds": compounds,
        "prices": prices,
    }, ensure_ascii=False, indent=1))
    print(f"wrote {OUT.relative_to(ROOT)} ({OUT.stat().st_size // 1024} KB, {len(compounds)} compounds)")


if __name__ == "__main__":
    main(sys.argv[1:] or ["imatinib", "lidocaine", "celecoxib"])
