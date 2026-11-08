#!/usr/bin/env bash
# Rebuild the 5 demo targets from scratch (recorded routes, deep AiZynth search, step evidence,
# payload) into data/deep_next/, and swap it into data/deep/ only when every stage succeeded.
#
# Why not in place: scripts/train_route_ranker_loop.sh re-runs score_deep_targets.py on whatever
# is in data/deep/ after every Model B retrain. Rebuilding in place would let it publish a payload
# built from new recorded routes and old step evidence. The previous inputs and payloads are kept
# in data/deep/prev/ so the swap can be undone.
#
#   nohup ./scripts/rebuild_deep_targets.sh > backend/data/logs/deep_rebuild.log 2>&1 &
set -uo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
PY=.venv/bin/python
LIVE=backend/data/deep
NEXT=backend/data/deep_next
WORKERS=${WORKERS:-2}

say() { echo "[$(date +%H:%M:%S)] === $*"; }
fail() { say "$1 FAILED — data/deep/ left as it was; partial output in $NEXT"; exit 1; }

mkdir -p "$NEXT"
# the holdout only grows (build_deep_targets.stage_recorded unions with the existing file)
cp "$LIVE/holdout_molecules.txt" "$NEXT/"
export SYNPATH_DEEP_DIR="$PWD/$NEXT"

say "recorded routes";  $PY -u -I scripts/build_deep_targets.py --stage recorded || fail "recorded"
say "AiZynth search ($WORKERS workers)"
$PY -u -I scripts/build_deep_targets.py --stage aizynth --workers "$WORKERS" || fail "aizynth"
say "step evidence";    $PY -u -I scripts/build_deep_targets.py --stage steps || fail "steps"
say "payload";          $PY -u -I scripts/score_deep_targets.py || fail "payload"

# The retrain loop re-runs score_deep_targets.py on data/deep/ after every Model B update. Swapping
# while it reads would hand it new recorded routes with old step evidence, so wait it out.
while pgrep -f "score_deep_targets.py" | grep -qv "^$$\$"; do say "waiting for a payload rebuild to finish"; sleep 20; done

say "swapping into $LIVE (previous files -> $LIVE/prev/)"
mkdir -p "$LIVE/prev"
for f in "$NEXT"/*; do
  b=$(basename "$f")
  [ -e "$LIVE/$b" ] && mv -f "$LIVE/$b" "$LIVE/prev/$b"
  mv -f "$f" "$LIVE/$b"
done
rmdir "$NEXT"
say "done"
