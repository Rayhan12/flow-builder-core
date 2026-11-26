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
2. **Edges through nodes** - an orthogonal edge segment crosses the interior of a
   node that is not that edge's source or target.
3. **Edge crossings** - axis-aligned segments from unrelated edges cross at a point
   (reported for diagnostics; the toolbar badge focuses on overlaps and through-node hits).

Shared bus segments (two edges from different source handles sharing a collinear
overlap longer than 4px) are treated as a routing failure and are separated during
auto-layout, not only during conflict resolve.

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
3. Re-route affected edges with independent orthogonal channels (no shared buses).
4. If an edge still clips a node, bump its mid-channel and retry detection.

The editor toolbar shows a warning badge when conflicts exist, with a **Fix layout**
action that applies resolve as a single undo entry. Auto-arrange, AI inserts, and
MCP inserts run detect (and resolve when needed) after placement.

## When it runs

- After full ELK layout (`layoutDiagram`)
- After incremental placement (`placeNodesIncremental`)
- On demand from the toolbar badge
- AI / agent / MCP paths call the same shared helpers after create and edit
- On diagram open when `fitPending` / `layoutPending` is set (server or MCP layout):
  after React Flow measures real card sizes, the editor auto-runs conflict resolve
  (or a full relayout if needed) and saves, so the overlap badge never appears on a
  fresh AI/MCP diagram
