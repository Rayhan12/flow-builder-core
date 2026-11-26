# Connectors: Figma / peers to Flow Builder

How FigJam, Miro, Whimsical, tldraw, Excalidraw, and Figma prototype noodles handle connectors, and how Flow Builder aligns with them under a strict layout policy. Visual style stays Taktile (teal accent, docs/DESIGN_SYSTEM.md). We copy interaction ideas only, never third-party branding or code.

## Sources

| Product | Topic | URL |
|---|---|---|
| FigJam | Connectors | https://help.figma.com/hc/en-us/articles/1500004414542-Create-diagrams-and-flows-with-connectors-in-FigJam |
| FigJam | Quick create | https://help.figma.com/hc/en-us/articles/1500004291601-Build-faster-with-quick-create-in-FigJam |
| Figma | Prototype noodles | https://help.figma.com/hc/en-us/articles/360040315773-Connect-your-prototype |
| Miro | Connection lines | https://help.miro.com/hc/en-us/articles/360017730733-Connection-lines |
| Whimsical | Connectors | https://whimsical.com/learn/boards/connectors |
| Whimsical | Flowcharts | https://whimsical.com/learn/get-started/flowcharts |
| tldraw | Default shapes / arrows | https://tldraw.dev/sdk-features/default-shapes |
| tldraw | Arrow binding props | https://tldraw.dev/reference/tlschema/TLArrowBindingProps |
| Excalidraw | Elbow arrows | https://plus.excalidraw.com/blog/building-elbow-arrows-part-one |
| Excalidraw | Element binding | https://deepwiki.com/excalidraw/excalidraw/3.2-element-binding-system |

## Behaviours by product

### FigJam connectors

Source: https://help.figma.com/hc/en-us/articles/1500004414542-Create-diagrams-and-flows-with-connectors-in-FigJam

- Three types: bent (elbow, wrap around objects), curved, straight.
- Lines snap onto shapes and stickies. A shape brings its lines along when moved. Shapes never move for lines; lines follow shapes.
- Shortcuts: X or Shift+L for bent, L for straight. Tool stays active until another tool, V, or Esc.
- Endpoints snap to the side midpoint of an object. Drag the blue end dot to another object or side. Cmd/Ctrl while dragging attaches at any exact point (no side snap).
- An endpoint can stay unattached.
- Customize path: select connector, drag a segment path handle (moves the elbow); dragging start/end segments adds a segment.
- Floating toolbar: colour, solid/dashed, stroke thin/thick, text label, start/end styles (none, line arrow, solid arrow, triangle, diamond). Shift-click multi-select for bulk style. Remembers last used style.
- Default: grey, no text, solid. Labels sit on the path, can be dragged along it, optional background matching the line colour.

### FigJam quick create

Source: https://help.figma.com/hc/en-us/articles/1500004291601-Build-faster-with-quick-create-in-FigJam

- Hover a selected shape: blue dot on each of the four sides; hover the dot for a quick-create icon.
- Click: new shape in that direction with a connector. Drag: preview, drop anywhere. Repeated clicks on a side stack more shapes.

### Figma prototype noodles

Source: https://help.figma.com/hc/en-us/articles/360040315773-Connect-your-prototype

- Hover the hotspot object, drag the plus icon (noodle) to the destination. The connection attaches to the destination frame.

### Miro connection lines

Source: https://help.miro.com/hc/en-us/articles/360017730733-Connection-lines

- Select object: blue dots around it. Click a dot: auto-create linked object (or line if a neighbour is close). Drag a dot: draw a line to another object.
- Line types: straight / orthogonal / curved. Arrowheads, thickness, colour in a context menu.
- Blue/white bullets on a line adjust the path; double-click resets extra bends.
- Drag a line end to re-attach. Attach to centre dot: line never crosses objects when they move (floating attachment to nearest side).
- Line jumps at crossings (orthogonal/straight). Labels: double-click line, multiple labels, drag along the line.

### Whimsical

Sources: https://whimsical.com/learn/boards/connectors , https://whimsical.com/learn/get-started/flowcharts

- Purple box around the target while dragging; release to attach.
- Elbow vs curve toggle in toolbar; 8 endpoint types per end; line hops (gap or arc) on by default.
- Auto-layout only when the user selects shapes and chooses Lay out vertically/horizontally. Connectors re-route automatically.

### tldraw arrows

Sources: https://tldraw.dev/sdk-features/default-shapes , https://tldraw.dev/reference/tlschema/TLArrowBindingProps

- Arrows bind to shapes and update when connected shapes move. kind `arc` or `elbow` (right-angle routing that navigates around obstacles).
- Binding: normalizedAnchor (0..1 on the box), isPrecise, snap `center` | `edge-point` | `edge` | `none`.
- elbowMidPoint handle (draggable, snaps to midpoint between shapes within 10px); min segment 20px before showing the handle; edge snap 20px, point snap 24px; hover 600 ms for precise targeting. labelPosition 0..1 along the arrow, snaps to centre.

### Excalidraw elbow arrows

Sources: https://plus.excalidraw.com/blog/building-elbow-arrows-part-one , https://deepwiki.com/excalidraw/excalidraw/3.2-element-binding-system

- Goals: shortest route, minimal segments, arrowheads point at the target and never enter it, avoid connected shapes along the whole path. A* on a sparse grid with short stubs (dongles) out of each side, headings, padded shape AABBs.
- Bindings are bidirectional. Moving a shape recomputes bound arrow points. Shapes are never moved by arrows.

## Comparison

| behaviour | Figma/FigJam | others | Flow Builder before | Flow Builder after |
|---|---|---|---|---|
| Arrows follow shapes; shapes never move for lines | Lines snap and stick; shape move carries connectors | Miro/tldraw/Excalidraw: same; Excalidraw never moves shapes for arrows | Edges follow nodes, but conflict resolve could nudge cards for through-node hits | Edges follow nodes. Router fixes path only. Never move nodes for edges |
| Elbow / curve / straight | Bent, curved, straight | Miro: straight/orthogonal/curved; Whimsical: elbow/curve; tldraw: arc/elbow | Elbow (smoothstep), straight, curved | Same types; elbow routing wraps obstacles without moving cards |
| Side / precise attachment | Side midpoint snap; Cmd/Ctrl for exact point; unattached OK | Miro centre = floating nearest side; tldraw snap modes; Whimsical purple target | Side handles; drop on body picks nearest side | Same; reconnect by dragging ends |
| Path reshape | Drag segment handles; start/end drag adds segment | Miro path bullets; double-click reset; tldraw elbowMidPoint | Waypoints / midpoint handles | Same; user-owned bends preserved until re-route |
| Quick create from sides | Blue dots + click/drag new connected shape | Miro blue dots: linked object or line | + on hover adds connected node | Same; new node placed with spacing; existing nodes keep x/y |
| Prototype-style drag connect | Noodle from hotspot plus to destination frame | Miro drag from side dots | Drag from side handles to target | Same |
| Labels on connector | On-path label, drag along path, optional fill | Miro multi-label; tldraw labelPosition | Mid-line label, editable | Same |
| Style (colour, dash, ends, weight) | Floating toolbar; last style remembered | Miro context menu; Whimsical 8 end types | Stroke, dash, markers, colour | Same; teal accent for selection chrome |
| Line hops at crossings | Not primary | Miro jumps; Whimsical hops on by default | Crossings reported; no hops yet | Optional later; not required for layout policy |
| Auto-layout | User-driven tidy / arrange | Whimsical: only on explicit Lay out; connectors re-route after | ELK + conflict resolve on AI/MCP, open, incremental, Fix layout | Explicit Auto-arrange / Cmd+Shift+L / Fix layout only (plus AI/MCP new placement). See layout policy |
| User overlaps | Allowed; user places freely | Boards allow stack; layout is opt-in | Overlaps flagged; measure-resolve could auto-fix on open | User overlaps allowed; badge + Fix layout only. No auto-nudge on open |
| Card growth / longer titles | Neighbours stay put; connectors adapt | Same pattern across peers | Growth could trigger resolve that shifted neighbours | Card growth never moves neighbours; arrows re-route |
| Edges through nodes | Router / wrap; shapes stay | Excalidraw A* avoids shapes; Miro floating attachment | resolveConflicts could push nodes apart | Edges-through never move nodes; router fixes them |

## Layout policy

Node positions change **only** when:

1. **AI / MCP generates or adds nodes.** New nodes get placed. Existing user-placed nodes keep their x/y unless the AI/MCP op explicitly moves them, or the diagram is newly generated with `layoutPending`.
2. **The user explicitly asks for layout.** Auto-arrange, Cmd+Shift+L, or Fix layout on the overlap badge. Each is one undoable action.

Remove every other automatic node movement.

- **Edges through nodes** must never cause node movement. The router fixes them.
- **Overlaps caused by the user** (dragging a card onto another) are allowed. Show only the overlap badge with Fix layout.
- **Card growth** from longer titles must not move neighbours.
- **Arrows adapt to cards**, not the other way round (like Figma / FigJam).

Related: docs/LAYOUT_CONFLICTS.md (detect / resolve mechanics), docs/EDITOR_UX_FIGMA.md (broader editor mapping).
