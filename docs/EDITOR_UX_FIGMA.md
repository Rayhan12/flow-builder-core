# Editor UX: Figma to Flow Builder mapping

Goal: make the Flow Builder editor feel as flexible and usable as Figma Design and FigJam, while keeping the Taktile visual style (docs/DESIGN_SYSTEM.md) and the teal accent. We copy interaction ideas only, never Figma branding or code.

## Sources (public Figma help center)

- Measure distances between layers: https://help.figma.com/hc/en-us/articles/360039956974-Measure-distances-between-layers
- Arrange layers with Smart selection: https://help.figma.com/hc/en-us/articles/360040450233-Arrange-layers-with-Smart-selection
- Connectors in FigJam: https://help.figma.com/hc/en-us/articles/1500004414542-Create-diagrams-and-flows-with-connectors-in-FigJam
- Select, move and order objects in FigJam: https://help.figma.com/hc/en-us/articles/1500004292221-Select-move-and-order-objects-in-FigJam
- Figma help center home (canvas, layers panel, properties panel, auto layout, groups and frames, keyboard shortcuts): https://help.figma.com/hc/en-us

Facts we rely on from those pages: Alt/Option + hover shows red distance lines between the selection and another object; Smart selection adds handles to adjust equal spacing and Tidy up arranges uneven layers; FigJam connectors come in bent (elbow), curved and straight types, snap to shapes so they move with them, have their own colour, text, end points and stroke weight, and their start and end points can be dragged to another object or side; quick create adds a connected shape automatically.

## Priority key

- **P0**: must have in the Editor UX pass.
- **P1**: should have in the same pass if time allows.
- **P2**: later.

## Mapping

| Area | Figma / FigJam feature | Flow Builder behaviour | Priority |
|---|---|---|---|
| Canvas | Infinite canvas | Unbounded pan and zoom, zoom range 5% to 400% | P0 |
| Canvas | Space + drag to pan, middle mouse pan | Hold Space (cursor becomes a hand) and drag to pan; middle mouse pans | P0 |
| Canvas | Trackpad pan, pinch zoom, Cmd/Ctrl + scroll zoom | Two-finger scroll pans, pinch or Cmd/Ctrl + scroll zooms at the cursor | P0 |
| Canvas | Shift+1 zoom to fit, Shift+2 zoom to selection, Shift+0 100% | Same shortcuts | P0 |
| Canvas | Zoom % menu | Toolbar zoom chip with menu: Zoom in, Zoom out, Fit, Selection, 50%, 100%, 200% | P0 |
| Canvas | Minimap (Figma has none; React Flow has) | Toggle in the view menu, remembered in localStorage | P0 |
| Canvas | Rulers (Shift+R) | Optional top and left rulers showing flow coordinates | P1 |
| Selection | Marquee select, Shift-click add/remove, Cmd+A | Drag on empty canvas makes a marquee (teal outline); Shift-click toggles; Cmd/Ctrl+A selects all | P0 |
| Selection | Select inside groups (double-click / Cmd-click deep select) | Double-click a group enters it; Cmd/Ctrl-click selects a nested node directly | P1 |
| Grouping | Group / ungroup (Cmd+G, Shift+Cmd+G), frames and sections | Cmd/Ctrl+G wraps selection in a group, Shift+Cmd/Ctrl+G ungroups; Sections (frames) are titled containers; groups can nest | P0 |
| Layers | Lock (Shift+Cmd+L) and hide (Shift+Cmd+H) | Locked nodes cannot move or be selected on canvas; hidden nodes are not rendered (still in layers) | P0 |
| Snapping | Smart guides, snap to objects | Guides to edges and centres of nearby nodes, plus equal spacing hints; snap to them | P0 |
| Snapping | Red distance measurements, Alt-hover to measure | While dragging show distances to neighbours; with a selection, hold Alt and hover another node to show distance lines and pixel values (use red for measurements, teal for guides) | P0 |
| Snapping | Snap to pixel grid | 16px grid snap toggle; Alt while dragging disables snapping temporarily | P0 |
| Nudge | Arrow keys 1px, Shift+arrow 10px | Same, through undo history (one entry per nudge burst) | P0 |
| Arrange | Align left/centre/right/top/middle/bottom, distribute, Tidy up | Contextual toolbar when 2+ nodes are selected and buttons in the properties panel; Tidy up arranges into an even grid or column | P0 |
| Arrange | Smart selection spacing handles | Drag handles between evenly spaced nodes to change all gaps | P2 |
| Arrange | Auto layout | Elk auto layout of the whole flow or the selection (top to bottom, left to right) | P1 (exists for whole flow; add selection) |
| Connectors | Drag from side handles | 4 side handles per node (top, right, bottom, left), each can start or end an edge; drop on a node body connects to the nearest side | P0 |
| Connectors | Quick create (+ on hover) | Hovering a node shows + buttons on each side; click adds a connected node of the same kind (or opens a small kind picker) placed with spacing and snapped | P0 |
| Connectors | Bent (elbow), curved, straight | Edge type per connector: elbow (smoothstep), straight, curved (bezier) | P0 |
| Connectors | Drag start and end points to reconnect | Reconnect endpoints by dragging them to another node or side | P0 |
| Connectors | Reshape path, bend points | Draggable waypoints on elbow and straight edges (add by dragging the midpoint handle, double-click to remove) | P0 |
| Connectors | End points (none, arrow, circle, diamond) | Start and end marker options: none, arrow, filled arrow, circle, diamond | P0 |
| Connectors | Stroke weight, dashed, colour | Width 1 to 4px, solid or dashed, colour from palette | P0 |
| Connectors | Text on connector | Mid-line label, double-click to edit, draggable along the path | P0 |
| Connectors | Bent connectors wrap around objects | Auto route elbow edges around nodes (simple obstacle-aware routing, fall back to smoothstep) | P1 |
| Connectors | Lines stay attached when shapes move | Always true (React Flow edges follow nodes) | P0 |
| Properties | Design tab: X, Y, W, H | Right panel "Design" section with numeric X, Y, W, H inputs (scrub on label drag), rotation not needed | P0 |
| Properties | Fill, stroke, text | Fill colour, border colour and width, text size and weight for label, icon picker | P0 |
| Properties | Contextual sections | Node data section per kind (decision branches, rules, mappings, integration), connector section when an edge is selected, multi-select shows shared fields and align tools | P0 |
| Layers panel | Layer tree, rename, reorder, show/hide, lock, search | Left "Layers" tab: tree with groups and sections, double-click to rename, drag to reorder (z-order and parent), eye and lock toggles on hover, search box | P0 |
| Assets | Assets panel | Left "Assets" tab = the node palette, plus shapes, sticky note, section | P0 |
| Menus | Right-click context menu | Copy, paste, duplicate, delete, group, ungroup, lock, hide, bring forward, send backward, align, add connected node, edit label | P0 |
| Menus | Quick actions (Cmd+/ or Cmd+K) | Command palette for actions and finding nodes | P0 |
| Editing | Undo and redo for everything | All actions go through history (including edge style, waypoints, group, lock) | P0 |
| Editing | Duplicate Cmd+D, Alt-drag to duplicate | Same; Alt-drag leaves a copy behind | P0 |
| Editing | Copy and paste with position, paste in place | Paste at cursor if over canvas, else offset; Shift+Cmd+V pastes in place | P0 |
| Editing | Inline text editing (double-click) | Double-click node label or sticky or shape text to edit in place | P0 |
| Shapes | FigJam shapes and stickies | Rectangle, rounded rectangle, diamond, ellipse shapes with text, sticky notes, sections | P0 |
| Help | Keyboard shortcuts panel (Shift+?) | Shortcuts sheet listing everything above | P0 |
| Collab | Multiplayer cursors | Presence hooks only (interface, no backend) | P2 |
| Collab | Comments | Pinned comments | P2 |
| Prototype | Prototype links | Out of scope | P2 |

## Schema impact

New optional fields (bump `schemaVersion` to 2 with a migration that keeps v1 docs valid):
- Node: `kind` adds `shape`, `sticky`, `section`; `shape?: 'rect' | 'rounded' | 'diamond' | 'ellipse'`; `style?: { fill?, stroke?, strokeWidth?, textSize?, textWeight? }`; `locked?`, `hidden?`; `zIndex?`.
- Edge: `type?: 'elbow' | 'straight' | 'curved'`; `waypoints?: {x,y}[]`; `startMarker?`, `endMarker?: 'none' | 'arrow' | 'arrowFilled' | 'circle' | 'diamond'`; `style?: { color?, width?, dash?: 'solid' | 'dashed' }`; `labelPosition?: number` (0 to 1 along the path); `sourceHandle`/`targetHandle` side ids `top|right|bottom|left` (decision branch handles keep their ids).
- The shared tools (shared/tools), AI ops and MCP must accept these fields.

## Acceptance (Playwright)

- Connect two nodes by dragging from a side handle; reconnect the end to a third node.
- Quick-add with the + button creates a connected node.
- Dragging a node near another shows a guide and snaps to aligned position.
- Marquee selects 3 nodes; Align left makes their x equal; Distribute makes gaps equal.
- Group with Cmd/Ctrl+G and ungroup; lock prevents dragging.
- Edge style change (dashed, diamond end) persists after reload.
- 1000-node fixture still loads and pans without errors (existing perf test stays green).
