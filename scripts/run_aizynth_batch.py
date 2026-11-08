"""Run AiZynthFinder on every reference-route target — the candidate routes Model B ranks.

Each worker process loads its own AiZynthFinder (USPTO policy + filter, ZINC stock, the same
config as chem/routes.py) and writes one JSON line per target to
backend/data/ml/aizynth_candidates/worker_<i>.jsonl:

  {target, target_flat, patent, split, search: {...stats, seconds}, routes: [
     {aizynth_rank, state_score, steps: [{product, reactants, template_hash, library_occurence,
      classification, policy_probability, depth, n_intermediate_reactants}], leaves: [...]}]}

All solved routes are kept (post_processing.all_routes), then at most --max-routes of them by a
seeded draw that keeps AiZynthFinder's order; `aizynth_rank` is the position in that order, the
tiebreak the state-score baseline uses. Resumable: targets already written (in any worker file)
are skipped. A target that raises is written with an "error" field so a restart skips it too.

    .venv/bin/python -I scripts/run_aizynth_batch.py [--workers 4] [--limit N] [--iterations 300]
"""
from __future__ import annotations

import argparse
import json
import logging
import os
import random
import sys
import time
from multiprocessing import get_context
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BACKEND = ROOT / "backend"
REFS = BACKEND / "data/ml/reference_routes.jsonl"
OUT = BACKEND / "data/ml/aizynth_candidates"
CONFIG = BACKEND / "data/aizynth/config.yml"
LOG = BACKEND / "data/logs/aizynth_batch.log"


def log(m: str, fh=None):
    line = f"[{time.strftime('%H:%M:%S')}] {m}"
    print(line, flush=True)
    if fh:
        fh.write(line + "\n")
        fh.flush()


def done_keys(out: Path) -> set[tuple[str, str]]:
    keys = set()
    for p in out.glob("worker_*.jsonl"):
        with open(p) as f:
            for line in f:
                try:
                    d = json.loads(line)
                except json.JSONDecodeError:
                    continue
                keys.add((d["target"], d["patent"]))
    return keys


def worker(i: int, jobs: list[dict], a: dict):
    sys.path.insert(0, str(BACKEND))
    os.environ.setdefault("OMP_NUM_THREADS", "1")
    from aizynthfinder.aizynthfinder import AiZynthFinder
    from model.route_ranker import walk

    logging.getLogger("aizynthfinder").setLevel(logging.WARNING)
    lf = open(LOG, "a")
    t0 = time.time()
    f = AiZynthFinder(configfile=str(CONFIG))
    f.stock.select("zinc")
    f.expansion_policy.select("uspto")
    f.filter_policy.select("uspto")
    f.config.search.iteration_limit = a["iterations"]
    f.config.search.time_limit = a["time_limit"]
    f.config.search.max_transforms = a["max_transforms"]
    f.config.post_processing.all_routes = True
    log(f"worker {i}: loaded in {time.time() - t0:.0f} s, {len(jobs)} targets", lf)

    out = open(Path(a["out"]) / f"worker_{i}.jsonl", "a")
    for n, job in enumerate(jobs, 1):
        t1 = time.time()
        rec = {"target": job["target"], "target_flat": job["target_flat"], "patent": job["patent"],
               "split": job["split"]}
        try:
            f.target_smiles = job["target"]
            f.tree_search()
            f.build_routes()
            st = f.extract_statistics()
            dicts, scores = list(f.routes.dicts), list(f.routes.scores)
            keep = list(range(len(dicts)))
            if len(keep) > a["max_routes"]:
                keep = sorted(random.Random(f"{job['patent']}|{job['target']}").sample(keep, a["max_routes"]))
            routes = []
            for k in keep:
                r = walk(dicts[k])
                if not r["steps"]:
                    continue
                sc = scores[k]
                r["state_score"] = float(sc.get("state score", next(iter(sc.values()), 0.0)))
                r["aizynth_rank"] = k
                routes.append(r)
            rec["search"] = {
                "solved": bool(st.get("is_solved")),
                "n_routes_built": len(dicts),
                "number_of_nodes": st.get("number_of_nodes"),
                "number_of_solved_routes": st.get("number_of_solved_routes"),
                "search_time": st.get("search_time"),
                "seconds": round(time.time() - t1, 1),
            }
            rec["routes"] = routes
        except Exception as e:  # noqa: BLE001 — logged and written, so a restart skips it
            rec["error"] = f"{type(e).__name__}: {e}"
            rec["routes"] = []
        out.write(json.dumps(rec) + "\n")
        out.flush()
        log(f"worker {i}: {n}/{len(jobs)} {time.time() - t1:5.1f} s  routes={len(rec['routes'])}"
            f"{'  ERROR ' + rec['error'] if 'error' in rec else ''}  {job['patent']}", lf)
    log(f"worker {i}: finished", lf)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--workers", type=int, default=4)
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--iterations", type=int, default=300)
    ap.add_argument("--time-limit", type=int, default=60)
    ap.add_argument("--max-transforms", type=int, default=6)
    ap.add_argument("--max-routes", type=int, default=100)
    ap.add_argument("--refs", default=str(REFS))
    ap.add_argument("--out", default=str(OUT))
    a = ap.parse_args()

    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    LOG.parent.mkdir(parents=True, exist_ok=True)
    refs = [json.loads(l) for l in open(a.refs) if l.strip()]
    if a.limit:
        refs = refs[: a.limit]
    done = done_keys(out)
    todo = [r for r in refs if (r["target"], r["patent"]) not in done]
    log(f"targets: {len(refs):,}  already done: {len(refs) - len(todo):,}  to run: {len(todo):,}  "
        f"workers: {a.workers}")
    if not todo:
        return
    cfg = {"iterations": a.iterations, "time_limit": a.time_limit, "max_transforms": a.max_transforms,
           "max_routes": a.max_routes, "out": str(out)}
    jobs = [todo[i::a.workers] for i in range(a.workers)]
    ctx = get_context("spawn")
    procs = [ctx.Process(target=worker, args=(i, jobs[i], cfg)) for i in range(a.workers) if jobs[i]]
    for p in procs:
        p.start()
    for p in procs:
        p.join()
    log("all workers finished")


if __name__ == "__main__":
    main()
