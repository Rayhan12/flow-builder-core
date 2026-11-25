#!/bin/bash
export PATH="$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"
cd "$(dirname "$0")/.." || exit 1
S=.cursor-runs/status.txt
log(){ echo "[$(date '+%F %T')] $*" >> $S; }
safe_push(){
  git check-ignore -q .env.local || { log "PUSH BLOCKED: .env.local not ignored"; return 1; }
  git check-ignore -q flow-builder-core-firebase-adminsdk-fbsvc-f2e1a56d54.json || { log "PUSH BLOCKED: key file not ignored"; return 1; }
  if git ls-files | grep -qE '(^|/)\.env(\.local)?$|adminsdk|service-account'; then log "PUSH BLOCKED: secret file tracked"; return 1; fi
  if git log origin/main..HEAD -p | grep -qE 'AIza[0-9A-Za-z_-]{30,}|sk-[A-Za-z0-9]{20,}|BEGIN [A-Z ]*PRIVATE|private_key"[[:space:]]*:'; then log "PUSH BLOCKED: possible key in commits"; return 1; fi
  git push origin main >> .cursor-runs/push.log 2>&1 && log "PUSHED $(git rev-parse --short HEAD)" || log "PUSH FAILED"
}
until grep -q "VERIFY PASS2" $S; do sleep 5; done
log "START PASS3 (logo, auth split layout, Google sign in)"
PROMPT="You are in the repo at $(pwd) (Vite + React 19 + TS + React Flow + Firebase project flow-builder-core). Read docs/DESIGN_SYSTEM.md (sections 0, 0b, 2, 3, 6, 10) and docs/PLAN.md (sections 14 to 16) first. Read .cursor-runs/PASS2-summary.md; if PASS2 left failing checks, fix them first. Work on main, no worktrees or branches.

1) LOGO. Design an original Flow Builder logo as a hand-made SVG (crisp vector, no AI-art look, no gradients noise). Idea: three connected nodes or blocks on a tight geometric grid joined by an orthogonal connector that forms an abstract F or a flow arrow, meaning 'building and flowing diagrams'. Clean, modern, Taktile-inspired but not a copy of any Taktile mark. Teal primary (#0f766e / #0d9488) on neutral, plus a mono version (currentColor) that still reads at 16px (simplify at small sizes). Deliverables: src/assets/brand/ with LogoMark.tsx, LogoWordmark.tsx ('Flow Builder' in Inter semibold next to the mark), and mark.svg, mark-mono.svg, wordmark.svg; public/favicon.svg, public/favicon-32.png, public/favicon-16.png, public/apple-touch-icon.png (180), public/icon-512.png (render PNGs from the SVG with a small node script using sharp or @resvg/resvg-js as a devDependency, add an npm script 'brand:icons'). Update index.html title 'Flow Builder', meta description, theme-color teal, icons. Replace the current logo everywhere: top header, sidebar (mark only when collapsed), auth screens, favicon, loading and empty states. Add docs/BRAND.md describing the mark, grid, colours, clear space and minimum size.

2) AUTH SPLIT LAYOUT for sign in and sign up. LEFT panel: polished product showcase in the Taktile style with teal accents: a mini diagram preview built from real React Flow node components (read-only, non-interactive ReactFlow instance or static render of the same node cards on the dotted canvas, gentle fade-in animation that respects prefers-reduced-motion), plus a capability list, each with an icon and one line: build decision-flow diagrams; AI-assisted creation with your own Gemini key; projects that organise your diagrams; MCP access so your AI agent can build in your projects. RIGHT panel: the form with email, password with show/hide toggle, 'Continue with Google' (signInWithPopup with GoogleAuthProvider, fall back to signInWithRedirect on auth/popup-blocked, auth/cancelled-popup-request or auth/operation-not-supported-in-environment, handle getRedirectResult on load; first-time Google users get their user doc and default project via the same code path as email sign up), 'Forgot password?' link that uses sendPasswordResetEmail with a success message, a switch between sign in and sign up, clear inline error states (friendly messages for common Firebase auth codes) and a loading state on buttons. Responsive: left panel hides below 900px (or stacks above the form on small screens). Keep the existing auth logic, rules and tests working; update Playwright selectors if needed and add tests for the split layout rendering, show/hide password, and the forgot password flow on the emulators.

Screenshots at 1440x900 on the emulators: .cursor-runs/signin.png, .cursor-runs/signup.png, .cursor-runs/signin-mobile.png (390x844), .cursor-runs/logo-sheet.png (mark, mono, wordmark, favicon at 16 and 32 px on light and dark), .cursor-runs/header-with-logo.png.

Rules: never touch files outside this folder; never git push; never commit secrets. A service account JSON file is in the folder and gitignored: never read, print, move or commit it. Do not run firebase deploy. Never use or kill port 5174; use 5181+ for dev or Playwright. For emulator tests use firebase emulators:exec --only auth,firestore --project flow-builder-core '<cmd>'. Small logical commits with plain human messages. No em dashes in UI text or docs. Keep npm run build, npm run lint, npm test and npm run test:e2e passing.
At the end write .cursor-runs/PASS3-summary.md (under 40 lines): logo design description, every place the logo was placed, auth layout description, files changed (main ones), test results (build, lint, unit, e2e counts), screenshot paths."
cursor-agent -p --model auto --force --trust --output-format text "$PROMPT" > .cursor-runs/PASS3.log 2>&1
RC=$?
log "END PASS3 rc=$RC"
B=0; L=0; T=0
npm run build > .cursor-runs/PASS3-verify.log 2>&1 || B=1
npm run lint >> .cursor-runs/PASS3-verify.log 2>&1 || L=1
npm test --silent >> .cursor-runs/PASS3-verify.log 2>&1 || T=1
log "VERIFY PASS3 build=$B lint=$L test=$T"
if [ $B -eq 0 ] && [ $L -eq 0 ] && [ $T -eq 0 ]; then
  [ -n "$(git status --porcelain)" ] && git add -A && git commit -qm "Finish logo and sign in layout checks"
  safe_push
else
  log "NOT PUSHED PASS3 (checks failing)"
fi
