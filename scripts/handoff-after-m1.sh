#!/bin/bash
# Waits for the first runner to finish M1, stops it, verifies, commits and pushes M1, then runs v2 for M2..M6.
export PATH="$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"
cd "$(dirname "$0")/.." || exit 1
S=.cursor-runs/status.txt
until grep -q "END M1" $S; do sleep 5; done
tmux kill-session -t flowbuild 2>/dev/null
echo "[$(date '+%F %T')] HANDOFF: first runner stopped after M1" >> $S
B=0; L=0; T=0
npm run build > .cursor-runs/M1-verify.log 2>&1 || B=1
npm run lint >> .cursor-runs/M1-verify.log 2>&1 || L=1
npm test --silent >> .cursor-runs/M1-verify.log 2>&1 || T=1
echo "[$(date '+%F %T')] VERIFY M1 build=$B lint=$L test=$T" >> $S
git add -A
git commit -qm "Add design system notes, runner updates and sign in work" 2>/dev/null
if git check-ignore -q .env.local && ! git ls-files | grep -qE '(^|/)\.env(\.local)?$' && ! git log origin/main..HEAD -p | grep -qE 'AIza[0-9A-Za-z_-]{30,}|sk-[A-Za-z0-9]{20,}'; then
  git push origin main >> .cursor-runs/push.log 2>&1 && echo "[$(date '+%F %T')] PUSHED $(git rev-parse --short HEAD)" >> $S
else
  echo "[$(date '+%F %T')] PUSH BLOCKED after M1 (secret check)" >> $S
fi
exec ./scripts/run-milestones-v2.sh
