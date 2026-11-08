#!/usr/bin/env bash
# Run the big training end to end on a single machine.
#   1) wait for the currently running shard 0/2 to finish
#   2) run shard 1/2
#   3) merge the shards, then featurize -> train -> calibrate
#   4) archive the results in data/runs/ord_all/ (the 50k baseline stays as is in data/runs/uspto50k/)
#
#   ./scripts/run_full_training.sh [PID_to_wait_for]
set -uo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/../backend"
PY=../.venv/bin/python
WAIT_PID="${1:-}"

say() { echo "[$(date +%H:%M:%S)] === $*"; }

if [ -n "$WAIT_PID" ]; then
  say "waiting for shard 0/2 (pid $WAIT_PID)"
  while kill -0 "$WAIT_PID" 2>/dev/null; do sleep 20; done
  say "shard 0/2 exited"
fi

if [ ! -f data/ml/shards/decoys_0_of_2.parquet ]; then
  say "WARNING: shard 0/2 produced no file — merging whatever exists"
fi

say "shard 1/2"
$PY -u -m model.train --positives all --shard 1/2 --timebox-min 180 || { say "shard 1/2 FAILED"; exit 1; }

say "merge + featurize + train"
$PY -u -m model.train --positives all --merge-shards || { say "training FAILED"; exit 1; }

say "archiving to data/runs/ord_all/"
mkdir -p data/runs/ord_all
cp data/model.pkl data/calibrator.pkl data/metrics.json data/calibration.png data/runs/ord_all/ 2>/dev/null
cp data/ml/dataset_stats.json data/runs/ord_all/ 2>/dev/null
say "done"
$PY - <<'PYEOF'
import json, pathlib
for name in ("uspto50k", "ord_all"):
    p = pathlib.Path("data/runs") / name / "metrics.json"
    if not p.exists():
        continue
    m = json.loads(p.read_text())
    c, r = m["calibrated"], m["raw"]
    print(f"{name:10s} n={m['test_n']:>9,}  ROC-AUC {c['roc_auc']:.4f}  "
          f"Brier {r['brier']:.4f}->{c['brier']:.4f}  ECE {r['ece']:.4f}->{c['ece']:.4f}")
PYEOF
