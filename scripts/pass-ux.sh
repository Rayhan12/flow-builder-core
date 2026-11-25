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
until grep -q "VERIFY PASS3" $S; do sleep 5; done
log "START UXA"
PROMPT="You are in the repo at $(pwd) (Vite + React 19 + TS + React Flow + Firebase). Read docs/EDITOR_UX_FIGMA.md fully, then docs/DESIGN_SYSTEM.md and docs/PLAN.md sections 14 to 16. Read the latest .cursor-runs/*-summary.md files; if earlier passes left failing checks, fix them first. Work on main, no worktrees or branches. Rayhan said the editor is not up to the mark: it needs more features, more connector options and much better usability, modelled on Figma Design and FigJam.

Implement these P0 items from docs/EDITOR_UX_FIGMA.md now: CANVAS (infinite canvas, Space+drag pan, middle mouse pan, trackpad pan and pinch zoom, Cmd/Ctrl+scroll zoom at cursor, Shift+1 fit, Shift+2 zoom to selection, Shift+0 100%, zoom % chip with menu, minimap toggle remembered), SELECTION (marquee, Shift-click toggle, Cmd/Ctrl+A), SNAPPING (smart guides to edges and centres, equal spacing hints, red distance measurements while dragging, Alt-hover distance lines with pixel values, grid snap toggle, Alt to disable snap while dragging), NUDGE (arrows 1px, Shift+arrows 10px, one undo entry per burst), ARRANGE (align 6 ways, distribute horizontal and vertical, Tidy up, contextual toolbar for 2+ selected), CONNECTORS FigJam style (4 side handles that can start or end edges, drop on node body connects to nearest side, hover + buttons on each side for quick-add of a connected node, edge types elbow/straight/curved, reconnect endpoints by dragging, draggable waypoints with add by dragging midpoint and double-click to remove, start and end markers none/arrow/arrowFilled/circle/diamond, stroke width 1 to 4, solid or dashed, colour, mid-line labels editable on double-click and draggable along the path, simple obstacle-aware elbow routing if feasible otherwise defer it, edges always follow nodes).
Do the schema v2 changes from the doc's Schema impact section as needed (with a migration from v1, zod updated, shared tools and AI ops accepting the new fields). Use @xyflow/react features where they exist (marquee via selectionOnDrag with panOnDrag on middle/space, reconnectable edges, custom edges with markers) and write custom code where they do not.
Add Playwright tests from the doc's Acceptance section that relate to these items. Take screenshots at 1440x900 on the emulators: .cursor-runs/ux-connectors.png, .cursor-runs/ux-smart-guides.png, .cursor-runs/ux-align-toolbar.png, .cursor-runs/ux-zoom-menu.png.

Rules: never touch files outside this folder; never git push; never commit secrets. A service account JSON file is in the folder and gitignored: never read, print, move or commit it. Do not run firebase deploy. Never use or kill port 5174; use 5181+ for dev or Playwright. For emulator tests use firebase emulators:exec --only auth,firestore --project flow-builder-core '<cmd>'. Small logical commits with plain human messages, in segments as each feature lands. No em dashes in UI text or docs. Keep npm run build, npm run lint, npm test and npm run test:e2e passing, and keep the 1000-node performance test green. Keep the Taktile visual style and teal accent from docs/DESIGN_SYSTEM.md.
At the end write .cursor-runs/UXA-summary.md (under 40 lines): what was built, what is deferred, files changed (main ones), test results (build, lint, unit, e2e counts), screenshot paths."
cursor-agent -p --model auto --force --trust --output-format text "$PROMPT" > .cursor-runs/UXA.log 2>&1
RC=$?
log "END UXA rc=$RC"
B=0; L=0; T=0
npm run build > .cursor-runs/UXA-verify.log 2>&1 || B=1
npm run lint >> .cursor-runs/UXA-verify.log 2>&1 || L=1
npm test --silent >> .cursor-runs/UXA-verify.log 2>&1 || T=1
log "VERIFY UXA build=$B lint=$L test=$T"
if [ $B -eq 0 ] && [ $L -eq 0 ] && [ $T -eq 0 ]; then
  [ -n "$(git status --porcelain)" ] && git add -A && git commit -qm "Finish UXA checks"
  safe_push
else
  log "NOT PUSHED UXA (checks failing)"
fi
until grep -q "VERIFY UXA" $S; do sleep 5; done
log "START UXB"
PROMPT="You are in the repo at $(pwd) (Vite + React 19 + TS + React Flow + Firebase). Read docs/EDITOR_UX_FIGMA.md fully, then docs/DESIGN_SYSTEM.md and docs/PLAN.md sections 14 to 16. Read the latest .cursor-runs/*-summary.md files; if earlier passes left failing checks, fix them first. Work on main, no worktrees or branches. Rayhan said the editor is not up to the mark: it needs more features, more connector options and much better usability, modelled on Figma Design and FigJam.

Implement these P0 items from docs/EDITOR_UX_FIGMA.md now: PROPERTIES PANEL like Figma's Design tab on the right (X, Y, W, H numeric inputs with label scrubbing, fill, stroke colour and width, text size and weight, icon picker, connector section when an edge is selected with type, markers, width, dash, colour, label; multi-select shows shared fields and align tools; the node data section per kind for decision branches, rules, mappings, integration stays), LAYERS panel on the left as a tab next to an Assets tab that holds the node palette plus shapes, sticky and section (layer tree with groups and sections, double-click rename, drag to reorder z-order and parent, eye and lock toggles, search), GROUPING (Cmd/Ctrl+G group, Shift+Cmd/Ctrl+G ungroup, nested groups, sections as titled frame containers, double-click group to enter, Cmd/Ctrl-click deep select), LOCK and HIDE (Shift+Cmd/Ctrl+L, Shift+Cmd/Ctrl+H), RIGHT-CLICK CONTEXT MENU (copy, paste, duplicate, delete, group, ungroup, lock, hide, bring forward, send backward, align, add connected node, edit label), QUICK ACTIONS command palette (Cmd/Ctrl+/ and Cmd/Ctrl+K: actions and find nodes), EDITING (undo and redo for every action, Cmd/Ctrl+D duplicate, Alt-drag duplicate, copy and paste at cursor, Shift+Cmd/Ctrl+V paste in place, inline text editing on double-click for nodes, shapes and stickies), SHAPES (rectangle, rounded rectangle, diamond, ellipse with text, sticky notes, sections), SHORTCUTS SHEET (Shift+? listing all shortcuts). Optional only if cheap: rulers (Shift+R), presence hooks interface.
Do the schema v2 changes from the doc's Schema impact section as needed (with a migration from v1, zod updated, shared tools and AI ops accepting the new fields). Use @xyflow/react features where they exist (marquee via selectionOnDrag with panOnDrag on middle/space, reconnectable edges, custom edges with markers) and write custom code where they do not.
Add Playwright tests from the doc's Acceptance section that relate to these items. Take screenshots at 1440x900 on the emulators: .cursor-runs/ux-properties.png, .cursor-runs/ux-layers.png, .cursor-runs/ux-context-menu.png, .cursor-runs/ux-shapes.png, .cursor-runs/ux-shortcuts.png, .cursor-runs/ux-editor-full.png.

Rules: never touch files outside this folder; never git push; never commit secrets. A service account JSON file is in the folder and gitignored: never read, print, move or commit it. Do not run firebase deploy. Never use or kill port 5174; use 5181+ for dev or Playwright. For emulator tests use firebase emulators:exec --only auth,firestore --project flow-builder-core '<cmd>'. Small logical commits with plain human messages, in segments as each feature lands. No em dashes in UI text or docs. Keep npm run build, npm run lint, npm test and npm run test:e2e passing, and keep the 1000-node performance test green. Keep the Taktile visual style and teal accent from docs/DESIGN_SYSTEM.md.
At the end write .cursor-runs/UXB-summary.md (under 40 lines): what was built, what is deferred, files changed (main ones), test results (build, lint, unit, e2e counts), screenshot paths."
cursor-agent -p --model auto --force --trust --output-format text "$PROMPT" > .cursor-runs/UXB.log 2>&1
RC=$?
log "END UXB rc=$RC"
B=0; L=0; T=0
npm run build > .cursor-runs/UXB-verify.log 2>&1 || B=1
npm run lint >> .cursor-runs/UXB-verify.log 2>&1 || L=1
npm test --silent >> .cursor-runs/UXB-verify.log 2>&1 || T=1
log "VERIFY UXB build=$B lint=$L test=$T"
if [ $B -eq 0 ] && [ $L -eq 0 ] && [ $T -eq 0 ]; then
  [ -n "$(git status --porcelain)" ] && git add -A && git commit -qm "Finish UXB checks"
  safe_push
else
  log "NOT PUSHED UXB (checks failing)"
fi
log "UX PASSES DONE"
