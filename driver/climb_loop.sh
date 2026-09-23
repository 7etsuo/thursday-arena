#!/usr/bin/env bash
# Climb until driver/check_rank.js reports a top-N place, then stop.
#
#   CLIMB_TOP_N=3 CLIMB_BATCH=15 bash driver/climb_loop.sh
#
# One climb at a time: an flock on data/climb.lock, so a second invocation exits instead of
# queueing two play loops against the same account (play_loop.js has its own pid lock as well).
set -u

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT" || exit 2

LOG_DIR="${CLIMB_LOG_DIR:-data/log/climb}"
mkdir -p "$LOG_DIR" data
MAIN_LOG="$LOG_DIR/climb.log"
GOAL_FLAG="$LOG_DIR/TOP_N"
LOCK="data/climb.lock"
TOP_N="${CLIMB_TOP_N:-3}"
BATCH="${CLIMB_BATCH:-15}"
MAX_FAIL="${CLIMB_MAX_FAIL:-15}"
# Floor between batches. Without it a play_loop that exits 0 having played 0 games (a maintenance
# window, a wedged phase) relaunched 1204 times in 5 seconds against the rated account -- measured,
# review R2-05.
MIN_GAP="${CLIMB_MIN_GAP:-10}"
export CLIMB_TOP_N="$TOP_N"

exec 9>"$LOCK" || exit 2
if ! flock -n 9; then
  echo "{\"event\":\"climb_busy\",\"ts\":\"$(date -Is)\",\"lock\":\"$LOCK\"}" >> "$MAIN_LOG"
  exit 3
fi

log() { echo "$1" >> "$MAIN_LOG"; }

# Ctrl-C must stop the CLIMB, not just the current batch: bash only propagates a SIGINT if the
# foreground child died from it, and play_loop exits by re-raising the signal after cleanup -- but
# the trap makes the outcome explicit either way, and covers SIGTERM from a supervisor.
child=""
on_signal() {
  log "{\"event\":\"climb_signal\",\"ts\":\"$(date -Is)\"}"
  [ -n "$child" ] && kill -TERM "$child" 2>/dev/null
  [ -n "$child" ] && wait "$child" 2>/dev/null
  exit 130
}
trap on_signal INT TERM

# exit 0 = in the top N (driver/check_rank.js), 10 = not yet, 2 = could not tell.
check_rank() {
  node driver/check_rank.js >>"$MAIN_LOG" 2>&1
}

finish() {
  log "{\"event\":\"goal_reached\",\"ts\":\"$(date -Is)\",\"topN\":$TOP_N}"
  date -Is > "$GOAL_FLAG"
  exit 0
}

log "{\"event\":\"climb_start\",\"ts\":\"$(date -Is)\",\"topN\":$TOP_N,\"batch\":$BATCH}"
check_rank && finish

fail=0
while true; do
  stamp=$(date +%Y%m%d-%H%M%S)
  batch_log="$LOG_DIR/batch-$stamp.log"
  log "{\"event\":\"batch_begin\",\"ts\":\"$(date -Is)\",\"games\":$BATCH,\"log\":\"$batch_log\"}"

  node driver/play_loop.js --start --games "$BATCH" >"$batch_log" 2>&1 &
  child=$!
  wait "$child"; rc=$?
  child=""
  if [ "$rc" -eq 0 ]; then
    # play_loop prints exactly one summary line; counting it is what keeps W/L/D from being
    # double-counted the way grepping every log line used to.
    summary=$(grep '"event":"play_loop_done"' "$batch_log" | tail -1)
    # A batch that played nothing is a failure however the exit code reads, so the backoff below
    # engages instead of hot-looping (review R2-05).
    if [ -z "$summary" ] || printf '%s' "$summary" | grep -q '"games":0[,}]'; then
      fail=$((fail + 1))
      log "{\"event\":\"batch_end\",\"ts\":\"$(date -Is)\",\"ok\":false,\"reason\":\"no_games\",\"fail\":$fail,\"summary\":${summary:-null}}"
      delay=$(( 2 ** (fail < 6 ? fail : 6) ))
      [ "$delay" -gt 60 ] && delay=60
      sleep "$delay"
      if [ "$fail" -ge "$MAX_FAIL" ]; then
        log "{\"event\":\"climb_abort\",\"ts\":\"$(date -Is)\",\"reason\":\"no_games\",\"fail\":$fail}"
        exit 2
      fi
      continue
    fi
    fail=0
    log "{\"event\":\"batch_end\",\"ts\":\"$(date -Is)\",\"ok\":true,\"summary\":${summary:-null}}"
    sleep "$MIN_GAP"
  else
    fail=$((fail + 1))
    log "{\"event\":\"batch_end\",\"ts\":\"$(date -Is)\",\"ok\":false,\"fail\":$fail}"
    # exponential backoff, capped at 60s
    delay=$(( 2 ** (fail < 6 ? fail : 6) ))
    [ "$delay" -gt 60 ] && delay=60
    sleep "$delay"
    if [ "$fail" -ge "$MAX_FAIL" ]; then
      log "{\"event\":\"climb_abort\",\"ts\":\"$(date -Is)\",\"reason\":\"too_many_failures\",\"fail\":$fail}"
      exit 2
    fi
    continue
  fi

  check_rank && finish
done
