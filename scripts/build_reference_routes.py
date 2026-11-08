"""Reference routes for Model B — the multi-step routes patents actually report.

A patent's worked examples usually make the intermediates and then the final compound, each
as its own recorded reaction. Chaining those records *within one patent* gives the route the
inventors actually ran. Model B (backend/model/route_ranker.py) learns to rank AiZynthFinder's
candidate routes by how close they come to these.

Chaining rule: in patent P, a record's reactant that is the main product (non-isomeric
canonical SMILES, `product_main_flat`) of another record of P is an intermediate, and we
recurse into the record that makes it. Everything else is a starting material. Salt formations
and recrystallisations (`is_noop`) are skipped — they form no bond. Cycles are cut; depth ≤ 8.
When a molecule is made by several records in P, the one giving the deepest tree wins (ties:
first record in file order — deterministic).

Selection: targets with 2–8 steps; at most one target per patent (the deepest one there, ties
by a seeded draw), so one patent family cannot dominate; then stratified by step count
(2, 3, 4, 5+), capped at --cap. Split by md5(patent): 70 train / 15 val / 15 test.

Held out: any target model/holdout.py flags (the 5 demo targets and their close analogues),
and — once data/deep/holdout_molecules.txt exists — any route containing a molecule from the
demo route trees.

    .venv/bin/python -I scripts/build_reference_routes.py [--cap 5000] [--seed 0]

Writes backend/data/ml/reference_routes.jsonl (+ reference_routes_stats.json).
"""
from __future__ import annotations

import argparse
import hashlib
import json
import random
import sys
import time
from collections import Counter, defaultdict
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from model.holdout import held_out_molecules, holdout_file_ready, is_held_out  # noqa: E402

CANON = ROOT / "backend/data/ord_canon.parquet"
OUT = ROOT / "backend/data/ml/reference_routes.jsonl"
MIN_STEPS, MAX_STEPS, MAX_DEPTH = 2, 8, 8
MIN_TARGET_HEAVY_ATOMS = 10   # below this a "target" is a reagent or a fragment, not a compound


def log(m: str):
    print(f"[{time.strftime('%H:%M:%S')}] {m}", flush=True)


def split_of(patent: str) -> str:
    h = int(hashlib.md5(patent.encode()).hexdigest(), 16) % 100
    return "train" if h < 70 else ("val" if h < 85 else "test")


def build_patent_routes(recs: list[dict]) -> list[dict]:
    """All final products of one patent with their deepest within-patent route."""
    makes: dict[str, list[int]] = defaultdict(list)
    for i, r in enumerate(recs):
        makes[r["product_main_flat"]].append(i)
    used_as_reactant = {x for r in recs for x in r["reactants_flat"]}

    memo: dict[str, tuple[int, int | None]] = {}   # molecule -> (n_steps, record index)

    def best(mol: str, visiting: frozenset, depth: int) -> tuple[int, int | None]:
        if mol in memo:
            return memo[mol]
        if depth > MAX_DEPTH or mol not in makes:
            return 0, None
        top = (0, None)
        for i in makes[mol]:
            n = 1
            for x in recs[i]["reactants_flat"]:
                if x != mol and x in makes and x not in visiting:
                    n += best(x, visiting | {mol}, depth + 1)[0]
            if n > top[0]:
                top = (n, i)
        memo[mol] = top
        return top

    def collect(mol: str, visiting: frozenset, out: list):
        n, i = best(mol, visiting, 0)
        if i is None:
            return
        r = recs[i]
        for x in r["reactants_flat"]:
            if x != mol and x in makes and x not in visiting:
                collect(x, visiting | {mol}, out)
        out.append({"product": r["product_main"], "product_flat": r["product_main_flat"],
                    "reactants": list(r["reactants_can"]), "reactants_flat": list(r["reactants_flat"]),
                    "reaction_id": r["reaction_id"]})

    routes = []
    for mol, idx in makes.items():
        if mol in used_as_reactant:
            continue                      # an intermediate here, not a final product
        if recs[idx[0]]["heavy"] < MIN_TARGET_HEAVY_ATOMS:
            continue
        steps: list = []
        collect(mol, frozenset(), steps)
        # dedupe (a record can be reached twice through two branches)
        seen, uniq = set(), []
        for s in steps:
            if s["reaction_id"] not in seen:
                seen.add(s["reaction_id"])
                uniq.append(s)
        if MIN_STEPS <= len(uniq) <= MAX_STEPS:
            routes.append({"target": recs[idx[0]]["product_main"], "target_flat": mol, "steps": uniq})
    return routes


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--cap", type=int, default=5000)
    ap.add_argument("--seed", type=int, default=0)
    ap.add_argument("--out", default=str(OUT))
    a = ap.parse_args()
    rng = random.Random(a.seed)

    log(f"reading {CANON.name}")
    df = pd.read_parquet(CANON, columns=["reaction_id", "patent", "reactants_can", "reactants_flat",
                                         "product_main", "product_main_flat", "product_heavy_atoms",
                                         "is_noop"])
    df = df[df.patent.notna() & ~df.is_noop]
    log(f"  patent records that form a bond: {len(df):,} in {df.patent.nunique():,} patents")

    t0 = time.time()
    per_patent: dict[str, list[dict]] = {}
    for patent, g in df.groupby("patent", sort=False):
        if len(g) < MIN_STEPS:
            continue
        recs = [{"reaction_id": rid, "reactants_can": list(rc), "reactants_flat": list(rf),
                 "product_main": pm, "product_main_flat": pf, "heavy": int(h)}
                for rid, rc, rf, pm, pf, h in zip(g.reaction_id, g.reactants_can, g.reactants_flat,
                                                  g.product_main, g.product_main_flat,
                                                  g.product_heavy_atoms)]
        routes = build_patent_routes(recs)
        if routes:
            per_patent[patent] = routes
    log(f"  patents with a 2–8 step route: {len(per_patent):,} ({time.time() - t0:.0f} s)")

    held = held_out_molecules() if holdout_file_ready() else frozenset()
    if not holdout_file_ready():
        log("  WARNING: data/deep/holdout_molecules.txt not written yet — only the Tanimoto rule applies")

    picked, dropped_held = [], 0
    for patent in sorted(per_patent):
        routes = per_patent[patent]
        top = max(len(r["steps"]) for r in routes)
        deepest = [r for r in routes if len(r["steps"]) == top]
        rng.shuffle(deepest)
        choice = None
        for r in deepest + [x for x in routes if len(x["steps"]) < top]:
            mols = {r["target_flat"]} | {m for s in r["steps"] for m in [s["product_flat"], *s["reactants_flat"]]}
            if is_held_out(r["target"]) or (held and mols & held):
                dropped_held += 1
                continue
            choice = r
            break
        if choice:
            picked.append({**choice, "patent": patent, "split": split_of(patent),
                           "n_steps": len(choice["steps"])})
    log(f"  one route per patent: {len(picked):,} (held out as demo-adjacent: {dropped_held:,})")

    def bucket(n):
        return min(n, 5)

    by_b: dict[int, list] = defaultdict(list)
    for r in picked:
        by_b[bucket(r["n_steps"])].append(r)
    for b in by_b:
        rng.shuffle(by_b[b])
    quota = a.cap // max(len(by_b), 1)
    out = []
    for b in sorted(by_b):
        out += by_b[b][:quota]
    rest = [r for b in sorted(by_b) for r in by_b[b][quota:]]
    rng.shuffle(rest)
    out += rest[: max(0, a.cap - len(out))]
    rng.shuffle(out)

    Path(a.out).parent.mkdir(parents=True, exist_ok=True)
    with open(a.out, "w") as f:
        for r in out:
            f.write(json.dumps(r) + "\n")
    stats = {
        "routes": len(out),
        "by_steps": dict(sorted(Counter(min(r["n_steps"], 5) for r in out).items())),
        "by_split": dict(Counter(r["split"] for r in out)),
        "candidates_before_cap": len(picked),
        "held_out_dropped": dropped_held,
        "holdout_file_used": bool(held),
        "seed": a.seed,
        "built": time.strftime("%Y-%m-%d"),
    }
    Path(a.out).with_name("reference_routes_stats.json").write_text(json.dumps(stats, indent=2))
    log(f"wrote {len(out):,} routes → {a.out}  {stats['by_steps']} {stats['by_split']}")


if __name__ == "__main__":
    main()
