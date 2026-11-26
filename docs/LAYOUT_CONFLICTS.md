# Layout conflict zones

How the editor detects and fixes overlapping cards and edges that cut through nodes.

## Bounding boxes

Each node has a content box from measured `size` when present. Otherwise the shared
`defaultNodeSize` helper picks a kind default:

- Decision / switch: width grows with branch count and chip labels.
- Start / end / step and most kinds: width grows with the label up to 360px, then
  height grows so the full title is visible (no ellipsis truncation on canvas).
- Decision / switch also budget the hint row and branch chip row heights to match
  the browser card CSS (`estimateNodeSize` in `shared/layout/nodeSizes.ts`).
- Groups and sections use container defaults (collapsed vs expanded).

Conflict tests expand that content box by a **margin of 24px** on every side. The
margin is the "keep-out" zone other cards should not enter.

Shared bus detection treats opposite-direction collinear overlaps the same as
same-direction ones, so head-on edges never share a segment (avoids bow-tie
arrowheads). Back edges (cycles) are routed around the side on a clear highway.

## What counts as a conflict

1. **Node overlaps** - two top-level content boxes (with margin) intersect.
2. **Edges through nodes** - an orthogonal edge segment crosses a non-endpoint
   node box inflated by **8px** (hard failure in unit and Playwright geometry tests).
3. **Edge crossings** - axis-aligned segments from unrelated edges cross at a point
   (reported for diagnostics; the toolbar badge focuses on overlaps and through-node hits).

Shared bus segments (two edges from different source handles sharing a collinear
overlap longer than 4px) are treated as a routing failure and are separated during
auto-layout, not only during conflict resolve. Parallel channels stay at least
**10px** apart after the nudging pass. Edges keep **16px** clearance from card edges
(at least 12px visual padding) via the orthogonal visibility-graph + A* router in
`shared/layout/router.ts`.

## Detect

`detectConflicts(nodes, edges)` in `shared/layout/conflicts.ts` returns:

- `nodeOverlaps: { a, b }[]`
- `edgesThroughNodes: { edgeId, nodeId }[]`
- `edgeCrossings: { a, b }[]`

`summarizeConflicts` turns that into a short label such as `2 overlaps` or
`3 edges through nodes`.

## Resolve

`resolveConflicts(nodes, edges)`:

1. Push overlapping pairs apart along the flow direction (DOWN: prefer vertical;
   RIGHT: prefer horizontal) with minimal displacement.
2. Prefer moving the non-manual node when one side is `manuallyPositioned`.
3. Re-route every edge with the shared A* orthogonal router (also used as ELK
   post-processing), then nudge overlapping parallel segments.
4. If an edge still clips a node (8px inflate), re-route again and retry detection.

The editor toolbar shows a warning badge when conflicts exist (edit mode only),
with a **Fix layout** action that applies resolve as a single undo entry.
User-caused overlaps are allowed and only surfaced via that badge. Card growth
from longer titles must not move neighbours. Auto-arrange is explicit only.

## When it runs

- **Measure-resolve** only for a fresh `layoutPending` from AI/MCP (new diagram
  generation). Never on a normal open of an existing diagram.
- **Fix layout** (toolbar overlap badge) and **Auto-arrange** (including
  Cmd+Shift+L) still run detect/resolve as a single undoable action.
- **Incremental placement** (`placeNodesIncremental`) places new nodes only; it
  must not shift existing user-placed nodes.
- **Edges through nodes** never move nodes; the router re-routes the edge.
- AI / agent / MCP create and edit call shared helpers for **new** node placement
  (and for resolve only when `layoutPending` or the op explicitly requests layout).
