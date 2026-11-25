#!/bin/bash
cd "$(dirname "$0")/.." || exit 1
S=.cursor-runs/status.txt
until grep -q "END M8" $S; do sleep 5; done
until grep -qE "PUSHED|NOT PUSHED M8|STOPPED" <(sed -n '/END M8/,$p' $S); do sleep 1; done
tmux kill-session -t flowchain 2>/dev/null
sleep 2
pkill -f "cursor-agent -p --model auto.*milestone M9" 2>/dev/null
echo "[$(date '+%F %T')] REORDER: running M9, M11, M10" >> $S
git add docs/PLAN.md .env.example 2>/dev/null; git commit -qm "Note Vercel setup and new milestone order" 2>/dev/null
MILESTONES="M9 M11 M10" exec ./scripts/run-milestones-v3.sh
