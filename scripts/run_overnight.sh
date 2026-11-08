#!/usr/bin/env bash
# Overnight chain for the two learned models and the deep demo payload. Every step logs to
# backend/data/logs/overnight.log; a failed step is logged and the chain carries on with what
# does not depend on it, so one failure never leaves the demo with nothing.
#
#   1. wait for Model A's row features (build_transfer_dataset --stage rows) to finish
#   2. Model A pairs (retrieval + labels), then train Model A
#   3. wait for the deep step evidence (build_deep_targets --stage steps), then write the demo
#      payload with Model A's ordering (Model B not trained yet → AiZynth state score, labelled)
#   4. at 05:30, train Model B on every AiZynth candidate written so far (the batch keeps running)
#   5. rewrite the demo payload with both models
#
#   nohup ./scripts/run_overnight.sh > backend/data/logs/overnight.log 2>&1 &
set -uo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/../backend"
PY=../.venv/bin/python
MODEL_B_AT="2026-11-08 05:30"

say() { echo "[$(date +%H:%M:%S)] === $*"; }
wait_for() {   # wait until no process matches $1
  while pgrep -f "$1" >/dev/null; do sleep 30; done
}

say "waiting for Model A row features"
wait_for "build_transfer_dataset.py --stage rows"
if [ ! -f data/transfer/rows.parquet ]; then say "row features MISSING — Model A skipped"; else
  say "Model A pairs"
  if $PY -u -I ../scripts/build_transfer_dataset.py --stage pairs --queries 200000 --workers 3; then
    say "Model A train"
    $PY -u -m model.transfer_ranker --train || say "Model A training FAILED"
  else
    say "Model A pairs FAILED"
  fi
fi

say "waiting for deep step evidence"
wait_for "build_deep_targets.py --stage steps"
say "demo payload (Model A only)"
$PY -u -I ../scripts/score_deep_targets.py || say "demo payload FAILED"
mkdir -p data/deep/snapshot_model_a && cp data/deep/demo_*.json data/deep/snapshot_model_a/ 2>/dev/null

target=$(date -j -f "%Y-%m-%d %H:%M" "$MODEL_B_AT" +%s)
say "sleeping until $MODEL_B_AT for Model B (AiZynth batch keeps writing candidates)"
while [ "$(date +%s)" -lt "$target" ]; do sleep 120; done

say "Model B train on $(cat data/ml/aizynth_candidates/worker_*.jsonl 2>/dev/null | wc -l | tr -d ' ') targets"
$PY -u -m model.route_ranker --train --workers 6 || say "Model B training FAILED"

say "demo payload (both models)"
$PY -u -I ../scripts/score_deep_targets.py || say "demo payload FAILED"
say "done"
