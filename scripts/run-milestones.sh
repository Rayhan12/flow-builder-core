#!/bin/bash
# Drives Cursor CLI (model auto) through docs/PLAN.md milestones. Logs to .cursor-runs/.
export PATH="$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"
cd "$(dirname "$0")/.." || exit 1
mkdir -p .cursor-runs
MILESTONES="${MILESTONES:-M1 M2 M3 M4 M5 M6}"
for M in $MILESTONES; do
  echo "[$(date '+%F %T')] START $M" >> .cursor-runs/status.txt
  PROMPT="You are working in the repo at $(pwd) (a Vite + React 19 + TypeScript app with Firebase). Read docs/PLAN.md fully. Implement ONLY milestone $M from section 9 of the plan, plus anything from earlier milestones that is missing or broken. Follow the plan's architecture, schema and decisions.
Rules:
- Work only inside this folder. Never touch files outside it. Never delete user files outside this folder.
- Never git push, never add remotes, never force anything. Commit locally at the end with a clear message starting with 'feat($M):'.
- Never put API keys or secrets in code, tests, docs or commits. .env.local is gitignored; do not print its contents.
- Do not run firebase deploy. Use the Firebase Emulator Suite only (firebase.json has auth 9099, firestore 8080). For tests that need emulators use: firebase emulators:exec --only auth,firestore --project flow-builder-core '<test command>' so nothing is left running.
- Add a 'test' npm script (Vitest) if missing. Keep 'npm run build', 'npm run lint' and 'npm test' all passing before you finish.
- UI: clean light theme first with a cheap dark toggle, simple plain English labels, decision-engine style editor (typed nodes, icons, colour groups, side panel). Do not use Taktile branding, logos or code. No em dashes in any docs or UI text.
- Keep the app working against the emulators when VITE_USE_EMULATORS=true.
When done, write .cursor-runs/$M-summary.md with: STATUS: DONE or STATUS: PARTIAL, what you built (short bullets), test results (counts of passing/failing for build, lint, test), and anything left for later. Keep it under 40 lines."
  cursor-agent -p --model auto --force --trust --output-format text "$PROMPT" > ".cursor-runs/$M.log" 2>&1
  RC=$?
  echo "[$(date '+%F %T')] END $M rc=$RC" >> .cursor-runs/status.txt
  B=0; L=0; T=0
  npm run build > ".cursor-runs/$M-verify.log" 2>&1 || B=1
  npm run lint >> ".cursor-runs/$M-verify.log" 2>&1 || L=1
  npm test --silent >> ".cursor-runs/$M-verify.log" 2>&1 || T=1
  echo "[$(date '+%F %T')] VERIFY $M build=$B lint=$L test=$T" >> .cursor-runs/status.txt
  if [ $RC -ne 0 ]; then echo "[$(date '+%F %T')] STOPPED at $M (agent rc=$RC)" >> .cursor-runs/status.txt; exit 1; fi
done
echo "[$(date '+%F %T')] ALL DONE" >> .cursor-runs/status.txt
