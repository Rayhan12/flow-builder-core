#!/bin/bash
cd "$(dirname "$0")/.." || exit 1
until grep -q "START M10" .cursor-runs/status.txt; do sleep 15; done
until tail -1 .cursor-runs/status.txt | grep -q "ALL DONE\|STOPPED"; do sleep 10; done
grep -q "STOPPED at M10" .cursor-runs/status.txt && exit 1
sleep 3
git add docs/PLAN.md && git commit -qm "Plan the MCP server milestone"
MILESTONES="M11" exec ./scripts/run-milestones-v3.sh
