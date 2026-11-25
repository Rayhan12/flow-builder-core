#!/bin/bash
cd "$(dirname "$0")/.." || exit 1
S=.cursor-runs/status.txt
until grep -q "END M8" $S; do sleep 3; done
until sed -n '/END M8/,$p' $S | grep -qE "PUSHED|STOPPED"; do sleep 1; done
tmux kill-session -t flowchain 2>/dev/null
sleep 2
pkill -f "Implement ONLY milestone M9" 2>/dev/null
echo "[$(date '+%F %T')] PAUSED after M8 for drag-drop hotfix and sidebar redesign (M9, M11, M10 pending)" >> $S
