#!/usr/bin/env bash
# 후보가 STEP개 늘 때마다 모델 B를 다시 학습하고, 성공했을 때만 live 파일로 바꾼다.
#
# 왜 반복해서 학습하나: 탐색은 아침까지 돌고, 그 사이에 전원이 나가거나 맥이 자거나 작업이
# 죽으면 "한 번만 학습"하는 설계에서는 **아무 모델도 안 남는다.** 500개마다 갱신해 두면 최악의
# 경우에도 마지막 체크포인트까지는 살아 있다.
#
# 안전장치 두 가지:
#   1) .new에 쓴 뒤 mv 한다. 학습 중에 죽어도 앱이 읽는 pkl은 절대 반쯤 쓰인 상태가 안 된다
#   2) 학습이 실패하면 이전 모델을 그대로 둔다. 새 게 없는 것보다 옛 게 있는 쪽이 낫다
#
# 학습이 끝날 때마다 데모 페이로드도 다시 만들어, 화면이 항상 최신 모델의 순위를 보여준다.
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
    # 탐색이 끝났다. 마지막 500 경계 뒤에 남은 후보까지 한 번 더 학습하고 끝낸다
    if [ "$n" -gt "$last" ]; then
      say "search finished at $n candidates — final training"
      train_at "$n"
    fi
    say "done"
    exit 0
  fi
  sleep "$POLL_S"
done
