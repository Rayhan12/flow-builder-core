#!/bin/bash
cd "$(dirname "$0")/.." || exit 1
until grep -q "ALL DONE\|STOPPED" .cursor-runs/status.txt; do sleep 10; done
sleep 3
git add docs/PLAN.md docs/DESIGN_SYSTEM.md scripts/ && git commit -qm "Add new milestones for editor polish, projects, richer editing and Google sign in"
exec ./scripts/run-milestones-v3.sh
