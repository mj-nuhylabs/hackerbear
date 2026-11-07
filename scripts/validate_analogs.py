"""Does the analog yield beat the flat assumption, and by how much?

The cost engine has to put a number in for every step. Until now that was a flat 0.70
wherever the corpus held no yield. Pulling the median yield of the nearest recorded
reactions is only worth doing if it is actually closer to the truth, and only in the
range where that holds.

This measures it the way a chemist would want it measured: take reactions whose yield
ORD records, hide that yield, retrieve their nearest neighbours from the index without
letting a reaction retrieve itself, and compare both answers against what was recorded.

It writes the error at each similarity band, because that is the number the interface
has to be honest about. A mean absolute error near 20 points means a shown yield is
worth about +/-20, and a panel that prints "65%" invites a chemist to read +/-5.

    .venv/bin/python -I scripts/validate_analogs.py [--queries N]

Writes backend/data/analog_validation.json, served at GET /analogs/metrics.
"""
from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

import numpy as np
import scipy.sparse as sp

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from evidence import analogs  # noqa: E402

OUT = ROOT / "backend/data/analog_validation.json"
FLAT = 70.0           # what cost/stoich.py assumes today, in percent
BANDS = [(0.8, 1.01), (0.6, 0.8), (0.4, 0.6), (0.0, 0.4)]
SEED = 0


def log(m: str):
    print(f"[{time.strftime('%H:%M:%S')}] {m}", flush=True)


def run(n_queries: int, top_k: int, chunk: int = 64) -> dict:
    # chunk is a memory dial, not a result: the similarity block is
    # chunk x index_size floats, so 64 against 757k reactions is ~190 MB.
    ix = analogs._load()
    if ix is None:
        raise SystemExit("No analog index. Run scripts/build_analog_index.py first.")
    X, bits, meta = ix["X"], ix["bits"], ix["meta"]
    log(f"index: {X.shape[0]:,} reactions")

    have_yield = np.flatnonzero(meta.yield_median.notna().to_numpy())
    log(f"  with a recorded yield: {len(have_yield):,}")
    rng = np.random.default_rng(SEED)
    q = rng.choice(have_yield, size=min(n_queries, len(have_yield)), replace=False)

    truth = meta.yield_median.to_numpy(dtype=float)
    preds, actuals, sims, n_used = [], [], [], []
    for start in range(0, len(q), chunk):
        rows = q[start:start + chunk]
        inter = (X[rows] @ X.T).toarray()
        qb = bits[rows][:, None]
        S = inter / (qb + bits[None, :] - inter + 1e-9)
        # A reaction must not retrieve itself; that would score a perfect 1.0 and
        # hand back the very yield we are trying to predict.
        S[np.arange(len(rows)), rows] = -1.0
        order = np.argsort(-S, axis=1)[:, :top_k]
        for row, qi, o in zip(S, rows, order):
            ok = [j for j in o if row[j] >= analogs.YIELD_MIN_SIMILARITY and not np.isnan(truth[j])]
            vals = [truth[j] for j in o if not np.isnan(truth[j])]
            preds.append(float(np.median(vals)) if vals else np.nan)
            actuals.append(float(truth[qi]))
            sims.append(float(row[o[0]]))
            n_used.append(len(ok))
        if start and start % (chunk * 4) == 0:
            log(f"  {start:,}/{len(q):,}")

    preds, actuals, sims = np.array(preds), np.array(actuals), np.array(sims)
    ok = ~np.isnan(preds)
    preds, actuals, sims = preds[ok], actuals[ok], sims[ok]
    flat = np.full_like(actuals, FLAT)

    def mae(a, b):
        return float(np.abs(a - b).mean())

    bands = []
    for lo, hi in BANDS:
        m = (sims >= lo) & (sims < hi)
        if m.sum() < 20:
            continue
        a, f = mae(preds[m], actuals[m]), mae(flat[m], actuals[m])
        bands.append({"from": lo, "to": round(min(hi, 1.0), 2), "n": int(m.sum()),
                      "analog_mae": round(a, 1), "flat_mae": round(f, 1),
                      "winner": "analog" if a < f else "flat"})

    a_all, f_all = mae(preds, actuals), mae(flat, actuals)
    return {
        "question": "does the median yield of the nearest recorded reactions beat a flat "
                    f"{FLAT:.0f}% assumption, and in which similarity range?",
        "source": "Open Reaction Database (CC BY-SA 4.0)",
        "index_reactions": int(X.shape[0]),
        "queries": int(len(preds)),
        "top_k": top_k,
        "flat_assumption_pct": FLAT,
        "actual_yield_mean": round(float(actuals.mean()), 1),
        "actual_yield_median": round(float(np.median(actuals)), 1),
        "analog_mae": round(a_all, 1),
        "flat_mae": round(f_all, 1),
        "winner": "analog" if a_all < f_all else "flat",
        "yield_min_similarity": analogs.YIELD_MIN_SIMILARITY,
        "bands": bands,
        "caveat": "Mean absolute error is in percentage points. An error near 20 means a "
                  "shown yield is worth roughly plus or minus 20 points, so the interface "
                  "shows the spread of the analogs rather than a single number.",
        "generated": time.strftime("%Y-%m-%d"),
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--queries", type=int, default=3000)
    ap.add_argument("--top-k", type=int, default=analogs.TOP_K)
    ap.add_argument("--chunk", type=int, default=64, help="queries per similarity block (memory)")
    a = ap.parse_args()

    res = run(a.queries, a.top_k, a.chunk)
    OUT.write_text(json.dumps(res, indent=2))

    print(f"\n  analog median of top-{res['top_k']}: {res['analog_mae']:.1f} points")
    print(f"  flat {FLAT:.0f}% assumption:        {res['flat_mae']:.1f} points")
    print(f"  -> {res['winner'].upper()} wins by {abs(res['flat_mae'] - res['analog_mae']):.1f}\n")
    print(f"  {'similarity':>12} {'n':>7} {'analog':>8} {'flat':>7}  winner")
    for b in res["bands"]:
        print(f"  {b['from']:.1f}-{b['to']:.2f} {b['n']:>9,} {b['analog_mae']:>8.1f} "
              f"{b['flat_mae']:>7.1f}  {b['winner']}")
    log(f"wrote {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
