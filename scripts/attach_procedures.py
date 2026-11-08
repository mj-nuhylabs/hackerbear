"""Attach ORD experimental procedures to each step of the demo routes.

Scans the ORD projections for records that make the same compound as the step product, grades them by how well
the reactant set matches, and writes them into demo.json. Every attached value is written in the record or computed from it.
If no record matches, nothing is added; the UI shows "no precedent in corpus".

Usage: .venv/bin/python -I scripts/attach_procedures.py
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from evidence.corpus import PROJECTIONS, REPORTED_MATCHES, best_match, scan  # noqa: E402

DEMO = ROOT / "frontend/src/mock/demo.json"
CACHE = ROOT / "backend/data/ord_hits.json"


def wanted_products(demo: dict) -> set[str]:
    out = set()
    for t in demo["targets"]:
        for r in t["routes"]:
            for s in r["steps"]:
                out.add(s["product"]["smiles"])
    return out


def main():
    demo = json.loads(DEMO.read_text())
    wanted = wanted_products(demo)
    print(f"{len(wanted)} distinct step products to look for")

    # The cache must also hold the list of products already looked up. If a route changes and a new product appears
    # but we trust only the cache, that step never gets a procedure.
    cached = json.loads(CACHE.read_text()) if CACHE.exists() else None
    if cached is not None and set(cached.get("looked_for", [])) >= wanted:
        hits = cached["records"]
        print(f"loaded {sum(len(v) for v in hits.values())} cached records from {CACHE.name}")
    else:
        if cached is not None:
            missing = wanted - set(cached.get("looked_for", []))
            print(f"cache misses {len(missing)} new products — rescanning")
        def progress(n, total, seen, found):
            print(f"  [{n:>2}/{total}] {seen:,} reactions read, {found} matching records", flush=True)

        procs = scan(wanted, PROJECTIONS, progress)
        hits = {k: [p.to_json() for p in v] for k, v in procs.items()}
        CACHE.parent.mkdir(parents=True, exist_ok=True)
        CACHE.write_text(json.dumps({"looked_for": sorted(wanted), "records": hits}, ensure_ascii=False))
        print(f"wrote {CACHE.relative_to(ROOT)}")

    # Thin wrapper so a dict can be used like a Procedure
    class P(dict):
        __getattr__ = dict.get

    attached = 0
    for t in demo["targets"]:
        for r in t["routes"]:
            for s in r["steps"]:
                cands = [P(x) for x in hits.get(s["product"]["smiles"], [])]
                if not cands:
                    continue
                reactants = {x["smiles"] for x in s["reactants"]}
                best, kind = best_match(cands, reactants)
                if not best:
                    continue
                s["procedure"] = {**best, "match": kind}
                attached += 1
                if kind not in REPORTED_MATCHES:
                    continue

                # Same product and all step reactants present in the record = the spec's REPORTED condition.
                # From here on the attached values are record values, not estimates, so drop the example flag.
                ev = s["evidence"]
                ev["tier"] = "REPORTED"
                ev["source_ids"] = [best["reaction_id"]]
                ev["url"] = best.get("url")
                ev["mock"] = [m for m in ev.get("mock", []) if m not in ("tier", "source_ids")]

                if best.get("yield_pct") is not None:
                    s["reported_yield"] = round(best["yield_pct"] / 100, 3)

                rg = best.get("reagents") or []
                by_role = lambda role: next((r for r in rg if (r.get("role") or "") == role), None)  # noqa: E731
                # ORD input keys are sometimes human-assigned role names and sometimes machine-generated
                # (like m1_m5_m2_m3_m4_m6). Use the compound name when there is one.
                named = lambda r: (r.get("name") or r.get("label")) if r else None  # noqa: E731
                solvent, cat = by_role("SOLVENT"), by_role("CATALYST")
                cond = {
                    "solvent": named(solvent),
                    "temperature_c": best.get("temperature_c"),
                    "time_h": best.get("time_h"),
                    "catalyst": named(cat),
                    "catalyst_loading": cat.get("equiv") if cat else None,
                    "source_id": best["reaction_id"],
                }
                if any(cond[k] is not None for k in ("solvent", "temperature_c", "time_h", "catalyst")):
                    s["conditions"] = cond  # no mock flag: all record values
                s["mock"] = [m for m in s.get("mock", []) if m not in ("reported_yield", "conditions")]

    DEMO.write_text(json.dumps(demo, ensure_ascii=False, indent=1))
    total = sum(len(r["steps"]) for t in demo["targets"] for r in t["routes"])
    print(f"attached a procedure to {attached} of {total} steps")
    for t in demo["targets"]:
        got = [
            s["procedure"]["match"]
            for r in t["routes"] for s in r["steps"] if "procedure" in s
        ]
        print(f"  {t['name']:14s} {len(got):3d} steps with a record  {dict((k, got.count(k)) for k in set(got))}")


if __name__ == "__main__":
    main()
