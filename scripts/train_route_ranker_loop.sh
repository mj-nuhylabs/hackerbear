#!/usr/bin/env bash
# Every time the candidates grow by STEP, retrain model B, and swap the live file only on success.
#
# Why retrain repeatedly: the search runs until morning, and if the power goes out, the Mac sleeps or the job
# dies, a "train once" design leaves **no model at all.** Refreshing every 500 means that even in the worst
# case the last checkpoint survives.
#
# Two safeguards:
#   1) Write to .new, then mv. Even if it dies mid-training, the pkl the app reads is never half-written
#   2) If training fails, keep the previous model. An old one is better than none
#
# Each time training finishes, the demo payload is rebuilt too, so the screen always shows the newest model's ranking.
#
#   nohup ./scripts/train_route_ranker_loop.sh > backend/data/logs/route_loop.log 2>&1 &
set -uo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/../backend"
PY=../.venv/bin/python
STEP=500
POLL_S=120

say() { echo "[$(date +%H:%M:%S)] === $*"; }
count() { cat data/ml/aizynth_candidates/worker_*.jsonl 2>/dev/null | wc -l | tr -d ' '; }
batch_alive() { pgrep -f "run_aizynth_batch.py" >/dev/null; }

train_at() {
  local n="$1"
  say "training on $n candidates"
  if $PY -u -m model.route_ranker --train --workers 3 \
       --model-out data/route_ranker.pkl.new \
       --metrics-out data/route_ranker_metrics.json.new; then
    mv -f data/route_ranker.pkl.new data/route_ranker.pkl
    mv -f data/route_ranker_metrics.json.new data/route_ranker_metrics.json
    say "model updated at $n candidates"
    if $PY -u -I ../scripts/score_deep_targets.py >/dev/null 2>&1; then
      say "demo payload rebuilt with the new model"
    else
      say "payload rebuild FAILED — the model is live, the demo still shows the previous ordering"
    fi
  else
    say "training FAILED at $n — keeping the previous model"
    rm -f data/route_ranker.pkl.new data/route_ranker_metrics.json.new
  fi
}

last=0
say "watching for every $STEP candidates (currently $(count))"
while true; do
  n=$(count)
  if [ "$n" -ge $(( last + STEP )) ]; then
    train_at "$n"
    last=$(( (n / STEP) * STEP ))
  elif ! batch_alive; then
    # The search is done. Train once more including the candidates left after the last 500 boundary, then finish
    if [ "$n" -gt "$last" ]; then
      say "search finished at $n candidates — final training"
      train_at "$n"
    fi
    say "done"
    exit 0
  fi
  sleep "$POLL_S"
done
