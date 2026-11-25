#!/bin/bash
export PATH="$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"
cd "$(dirname "$0")/.." || exit 1
S=.cursor-runs/status.txt
until grep -q "PAUSED after M8" $S; do sleep 3; done
echo "[$(date '+%F %T')] START HOTFIX (drag-drop + sidebar)" >> $S
PROMPT="You are in the repo at $(pwd) (Vite + React 19 + TS + React Flow + Firebase). Read docs/DESIGN_SYSTEM.md (sections 0, 6 and 10) first. Two urgent tasks, on main, no worktrees or branches.

TASK 1, URGENT BUG: In the editor, dragging a palette item onto the middle of the canvas does nothing: no node appears, no preview, no feedback. This happens on the live site and in dev. Reproduce it first with Playwright against the emulators (dev server on port 5181 or higher, never port 5174, which is a live server you must not touch or kill). Then trace the whole path yourself and find the real root cause: palette item draggable + onDragStart (dataTransfer.setData with the node kind, effectAllowed), the canvas wrapper onDragOver (preventDefault, dropEffect = 'move'), onDrop (screenToFlowPosition from useReactFlow, used inside ReactFlowProvider), the store action that adds the node, nodeTypes registration, any CSS or overlay (grid layer, alignment guides layer, pointer-events, z-index) swallowing events, and zod validation silently dropping the node. Note that Playwright's dragTo may not fire HTML5 drag events reliably; if needed dispatch dragstart/dragover/drop with a shared DataTransfer via page.evaluate, and also test the click-to-add path. Fix it. Add a visible drop-target highlight on the canvas while dragging (accent dashed outline or tint per DESIGN_SYSTEM) and a ghost/preview if cheap. Dropped nodes must appear where they were dropped (snapped to the 16px grid). Add a Playwright e2e test that drags a palette item to the canvas centre and asserts a new node renders there, and a unit test for the drop handler if sensible.

TASK 2, SIDEBAR REDESIGN: Before changing any UI, take a screenshot of the editor with the left sidebar visible and save it as .cursor-runs/sidebar-before.png (sign up a throwaway user on the emulators, create a diagram, open the editor, 1440x900). Then redesign the editor left sidebar in Taktile's decision-flow editor style per docs/DESIGN_SYSTEM.md: sharper and more tactile, crisp 1px borders, tight radii (6px items, 8px icon tiles), compact dense layout, small uppercase section labels (11px, 500, tracking 0.06em), clear hierarchy (current project and diagram breadcrumb or header at top, then the node palette grouped Flow / Logic / Data / Other), palette items as clean icon tiles with a small colour chip for the kind colour plus name and one-line help, clear hover, active (pressed), focus and dragging states, a search box, and a collapse button that shrinks the sidebar to an icon rail (state saved in localStorage). Single ember accent only for active/focus. Keep everything functional: items stay draggable and click-to-add still works. When done, save .cursor-runs/sidebar-after.png at the same size and state.

Rules: never touch files outside this folder, never git push (the runner pushes), never commit secrets. A service account JSON file is in the folder and is gitignored: never read it, print it, move it or commit it, and keep .gitignore entries for it. Do not run firebase deploy. For emulator tests use firebase emulators:exec --only auth,firestore --project flow-builder-core '<cmd>'. Commit in small logical commits with plain human messages (for example 'Fix drag and drop onto the canvas'). There are uncommitted M8 editor polish changes in the tree already if M8 did not commit them; keep and build on them. Keep 'npm run build', 'npm run lint', 'npm test' and the Playwright e2e passing. No em dashes in UI text or docs.
At the end write .cursor-runs/HOTFIX-summary.md (under 40 lines): ROOT CAUSE (1 to 2 sentences), files changed, sidebar changes, test results (build, lint, unit, e2e counts), screenshot paths."
cursor-agent -p --model auto --force --trust --output-format text "$PROMPT" > .cursor-runs/HOTFIX.log 2>&1
RC=$?
echo "[$(date '+%F %T')] END HOTFIX rc=$RC" >> $S
B=0; L=0; T=0
npm run build > .cursor-runs/HOTFIX-verify.log 2>&1 || B=1
npm run lint >> .cursor-runs/HOTFIX-verify.log 2>&1 || L=1
npm test --silent >> .cursor-runs/HOTFIX-verify.log 2>&1 || T=1
echo "[$(date '+%F %T')] VERIFY HOTFIX build=$B lint=$L test=$T" >> $S
