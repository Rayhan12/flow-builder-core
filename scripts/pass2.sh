#!/bin/bash
export PATH="$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"
cd "$(dirname "$0")/.." || exit 1
S=.cursor-runs/status.txt
log(){ echo "[$(date '+%F %T')] $*" >> $S; }
safe_push(){
  git check-ignore -q .env.local || { log "PUSH BLOCKED: .env.local not ignored"; return 1; }
  git check-ignore -q flow-builder-core-firebase-adminsdk-fbsvc-f2e1a56d54.json || { log "PUSH BLOCKED: key file not ignored"; return 1; }
  if git ls-files | grep -qE '(^|/)\.env(\.local)?$|adminsdk|service-account'; then log "PUSH BLOCKED: secret file tracked"; return 1; fi
  if git log origin/main..HEAD -p | grep -qE 'AIza[0-9A-Za-z_-]{30,}|sk-[A-Za-z0-9]{20,}|PRIVATE KEY|private_key'; then log "PUSH BLOCKED: possible key in commits"; return 1; fi
  git push origin main >> .cursor-runs/push.log 2>&1 && log "PUSHED $(git rev-parse --short HEAD)" || log "PUSH FAILED"
}
until grep -q "VERIFY HOTFIX" $S; do sleep 5; done
if grep -q "VERIFY HOTFIX build=0 lint=0 test=0" $S; then
  [ -n "$(git status --porcelain)" ] && git add -A && git commit -qm "Finish drag and drop fix and sidebar polish"
  safe_push
else
  log "HOTFIX checks failing, not pushed; PASS2 will fix"
fi
log "START PASS2 (projects, dashboard, app sidebar)"
PROMPT="You are in the repo at $(pwd) (Vite + React 19 + TS + React Flow + Firebase project flow-builder-core). Read docs/PLAN.md (sections 13 to 16) and docs/DESIGN_SYSTEM.md (sections 0, 0b, 2, 3, 6, 10) first, and look at the reference images .cursor-runs/taktile-ref-nodes.png and .cursor-runs/taktile-ref-config-panel.png (reference only, never copy them into src or public). The whole app must copy Taktile's layout and visual language as far as possible on every surface: left nav rail, top header with breadcrumbs and actions, stacked content sections and cards, node cards with 48px pastel icon tiles and kind label above title on a light dotted canvas, accordion config panels with bordered list-row cards, dense tables and lists, Inter, small uppercase nav labels, 1px faint borders, small radii, soft shadows. Apply it to sidebar, dashboard, project page, editor grid and canvas chrome, node side panel, palette, AI panel, settings, auth screens and modals. Use teal as the single primary. No Taktile logo, name, illustrations or assets. No Linear look. Work on main, no worktrees or branches. Also read .cursor-runs/HOTFIX-summary.md; if the drag and drop fix or its checks are not finished, finish them first.

Build these four parts (part 4 is PLAN.md section 16: the home dashboard AI agent panel with the shared tool layer in shared/tools, browser DataPort adapter, Gemini function-calling loop, inline tool call cards with Open links, confirm guard for destructive actions, chat history in users/{uid}/agentChats; the dashboard 'Ask AI' box and sidebar 'AI Create' must reuse this same panel; add unit tests for the tools against the emulators and a test that the agent tool names match the planned MCP list) (this replaces M9 in PLAN.md where they differ; update PLAN.md to match):

1) PROJECTS. Firestore path users/{uid}/projects/{projectId} {name, color, icon, createdAt, updatedAt, diagramCount} and diagrams at users/{uid}/projects/{projectId}/diagrams/{diagramId} with versions and messages subcollections under each diagram (AI chat stays per diagram). This must stay compatible with the planned MCP tools in PLAN.md section 15. Create, rename, recolour, delete project (confirm dialog that says how many diagrams will be deleted; delete subcollections client side in batches). Migration: on sign in, if old users/{uid}/diagrams docs exist, copy them with their versions and messages into a default project 'My first project', then delete the old docs; idempotent and safe if interrupted. Every new user (email, and Google later) gets a user doc and a default project. Update firestore.rules (owner only for the new paths, keep the old path readable and deletable by the owner for migration, keep mcpTokens rules if present) and the rules tests. Routes: '/' dashboard, '/p/:projectId' project page with its diagrams, '/p/:projectId/d/:diagramId' editor; breadcrumbs (Home / Project / Diagram) in the top bar; redirect old routes.

2) DASHBOARD at '/'. Generous and polished, Taktile style per DESIGN_SYSTEM: greeting header, an 'Ask AI to create a diagram' prompt box (project picker or new project, Gemini via the existing provider, prompt for the key inline if missing, creates the diagram in that project and opens the editor), project grid of cards (colour/icon tile, name, diagram count, updated time, menu for rename/recolour/delete), New project card/button, Recent diagrams list (last 8 across projects, from a lightweight query or a recents list on the user doc), and good empty states. Project page '/p/:projectId' shows its diagrams as cards or rows with New diagram, rename, duplicate, delete.

3) APP SIDEBAR in Taktile style (NOT Linear; see DESIGN_SYSTEM section 0b): a left nav that toggles between a slim 56px icon rail and a 248px expanded panel, state in localStorage, shortcut '[' (when not typing in an input) and Cmd/Ctrl+\\. Items: Home, Projects (expandable tree listing each project's diagrams, click to open), Recent, AI Create (opens the AI create flow as a dialog: pick or create project, type prompt, generate, open in editor), Templates (only if templates exist; otherwise skip), Settings (Gemini key, and MCP tokens later), and account (avatar, email) with Sign out at the bottom. Tooltips in rail mode, active item with the single ember accent marker, crisp 1px borders, compact dense rows, small uppercase section labels. In the editor, the app nav rail stays (collapsed by default in the editor) and the node palette remains its own panel next to the canvas, using the Taktile-style design from the hotfix. Palette items must stay draggable and dropping must still add nodes where dropped.

5) TEAL ACCENT. The single app accent is now teal, not ember orange. docs/DESIGN_SYSTEM.md sections 2, 3 and 9 have the final tokens (--color-accent #0f766e, hover #115e59, pressed #134e4a, bright #0d9488 for shapes, subtle #ccfbf1, tint #f0fdfa, on-accent white, focus ring rgba(13,148,136,.35), plus dark mode values). Put these tokens in the CSS variables and replace every accent use: primary buttons, links, focus rings, selection, active nav, tabs, drag and drop highlight, alignment guides, edge and handle highlight, AI panel accents. The Saved status uses the success green, not the accent. Grep the whole src for hard-coded orange values (ff5900, ff6a1a, fff1ea, 3a1e10, rgba(255, 89, 0 and similar) and replace them with tokens. Change the rule node colour from teal to indigo (#4f46e5 / #eef2ff) and make sure no node colour is teal or cyan; keep migration-safe handling if saved diagrams use the old 'teal' colour key (map it to indigo). Check text contrast passes WCAG AA.

6) Restyle the screens that are not covered above (settings, sign in, sign up, modals, toasts, empty states) to the same Taktile language.

Tests: keep all existing unit, rules and Playwright tests passing; add Playwright tests for dashboard -> project -> diagram navigation with breadcrumbs, sidebar rail/expand toggle (button and shortcut, persisted after reload), and that drag and drop still works; add unit/rules tests for projects and migration. Take screenshots at 1440x900 on the emulators and save: .cursor-runs/dashboard.png, .cursor-runs/project-page.png, .cursor-runs/sidebar-expanded.png, .cursor-runs/sidebar-rail.png, .cursor-runs/editor.png, .cursor-runs/settings.png, .cursor-runs/signin.png, .cursor-runs/ai-panel.png.

Rules: never touch files outside this folder; never git push; never commit secrets. A service account JSON file is in the folder and gitignored: never read, print, move or commit it. Do not run firebase deploy. Never use or kill port 5174 (live server); use 5181+ for dev or Playwright. For emulator tests use firebase emulators:exec --only auth,firestore --project flow-builder-core '<cmd>'. Small logical commits with plain human messages. No em dashes in UI text or docs. Keep npm run build, npm run lint, npm test and npm run test:e2e passing.
At the end write .cursor-runs/PASS2-summary.md (under 50 lines): what was built per part, how the AI panel works and connects to shared tools and the future MCP server, navigation flow, files changed (main ones), test results (build, lint, unit, rules, e2e counts), how the Taktile styling was applied on each surface, screenshot paths, final accent token values and files changed for the teal change, anything left."
cursor-agent -p --model auto --force --trust --output-format text "$PROMPT" > .cursor-runs/PASS2.log 2>&1
RC=$?
log "END PASS2 rc=$RC"
B=0; L=0; T=0
npm run build > .cursor-runs/PASS2-verify.log 2>&1 || B=1
npm run lint >> .cursor-runs/PASS2-verify.log 2>&1 || L=1
npm test --silent >> .cursor-runs/PASS2-verify.log 2>&1 || T=1
log "VERIFY PASS2 build=$B lint=$L test=$T"
if [ $B -eq 0 ] && [ $L -eq 0 ] && [ $T -eq 0 ]; then
  [ -n "$(git status --porcelain)" ] && git add -A && git commit -qm "Finish projects, dashboard and sidebar checks"
  safe_push
else
  log "NOT PUSHED PASS2 (checks failing)"
fi
