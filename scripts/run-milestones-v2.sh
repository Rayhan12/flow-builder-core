#!/bin/bash
# Drives Cursor CLI (model auto) through docs/PLAN.md milestones on main, then pushes (never force).
export PATH="$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"
cd "$(dirname "$0")/.." || exit 1
mkdir -p .cursor-runs
S=.cursor-runs/status.txt
log(){ echo "[$(date '+%F %T')] $*" >> $S; }
safe_push(){
  git check-ignore -q .env.local || { log "PUSH BLOCKED: .env.local not ignored"; return 1; }
  if git ls-files | grep -qE '(^|/)\.env(\.local)?$'; then log "PUSH BLOCKED: env file tracked"; return 1; fi
  if git log origin/main..HEAD -p | grep -qE 'AIza[0-9A-Za-z_-]{30,}|sk-[A-Za-z0-9]{20,}'; then log "PUSH BLOCKED: possible key in commits"; return 1; fi
  git push origin main >> .cursor-runs/push.log 2>&1 && log "PUSHED $(git rev-parse --short HEAD)" || log "PUSH FAILED"
}
verify(){
  local M=$1 B=0 L=0 T=0
  npm run build > ".cursor-runs/$M-verify.log" 2>&1 || B=1
  npm run lint >> ".cursor-runs/$M-verify.log" 2>&1 || L=1
  npm test --silent >> ".cursor-runs/$M-verify.log" 2>&1 || T=1
  log "VERIFY $M build=$B lint=$L test=$T"
  [ $B -eq 0 ] && [ $L -eq 0 ] && [ $T -eq 0 ]
}
for M in ${MILESTONES:-M2 M3 M4 M5 M6}; do
  log "START $M"
  PROMPT="You are working in the repo at $(pwd) (a Vite + React 19 + TypeScript app with Firebase project flow-builder-core). Read docs/PLAN.md fully, including section 13. Implement ONLY milestone $M from section 9 of the plan, plus anything from earlier milestones that is missing or broken. Follow the plan's architecture, schema and decisions.
Rules:
- Work directly on the main branch in this folder. Do not create git worktrees or feature branches. Never touch files outside this folder.
- Commit locally in small logical segments as you go, with plain human commit messages (for example 'Add diagram list page with rename and delete'). No prefixes like feat(M2). Do not git push (the runner pushes after checks). Never force anything, never rewrite history.
- Never put API keys or secrets in code, tests, docs or commits. .env.local is gitignored; never commit or print it.
- Do not run firebase deploy. For tests use the Firebase Emulator Suite: firebase emulators:exec --only auth,firestore --project flow-builder-core '<test command>' so nothing is left running.
- Keep 'npm run build', 'npm run lint' and 'npm test' all passing before you finish.
- UI: follow docs/DESIGN_SYSTEM.md exactly (tokens, components); for extra pattern ideas you may consult https://styles.refero.design/ as reference only, never copy brand assets. Clean light theme first with a cheap dark toggle, simple plain English labels, decision-engine style editor (typed nodes, icons, colour groups, side panel). No Taktile branding, logos or code. No em dashes in docs or UI text.
- The app must work both against the emulators (VITE_USE_EMULATORS=true) and the real project.
When done, write .cursor-runs/$M-summary.md with: STATUS: DONE or STATUS: PARTIAL, what you built (short bullets), test results (build, lint, test pass/fail counts), and anything left. Under 40 lines."
  cursor-agent -p --model auto --force --trust --output-format text "$PROMPT" > ".cursor-runs/$M.log" 2>&1
  RC=$?
  log "END $M rc=$RC"
  if verify $M; then
    if [ -n "$(git status --porcelain)" ]; then git add -A && git commit -qm "Finish $M checks and leftovers" && log "COMMITTED leftovers $M"; fi
    safe_push
  else
    log "NOT PUSHED $M (checks failing)"
  fi
  [ $RC -ne 0 ] && { log "STOPPED at $M (agent rc=$RC)"; exit 1; }
done
log "ALL DONE"
