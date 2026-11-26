/**
 * Layout conflict detection and resolution: node overlaps, edges through nodes,
 * and a minimal push-apart fix that keeps manuallyPositioned nodes stable.
 */
import {
  DEFAULT_NODE_HEIGHT,
  DEFAULT_NODE_WIDTH,
  defaultNodeSize,
} from './nodeSizes.ts'
import {
  pathPointsForEdge,
  routeEdgesIndependently,
  segmentHitsRect,
  type Point,
} from './edgeRouting.ts'
import { THROUGH_INFLATE } from './router.ts'
import type { LayoutDirection, LayoutEdgeLike, LayoutNodeLike } from './types.ts'

export const CONFLICT_MARGIN = 24

export type ConflictBox = {
  id: string
  x: number
  y: number
  w: number
  h: number
  manual: boolean
}

export type NodeOverlap = { a: string; b: string }
export type EdgeThroughNode = { edgeId: string; nodeId: string }
export type EdgeCrossing = { a: string; b: string }

export type ConflictReport = {
  nodeOverlaps: NodeOverlap[]
  edgesThroughNodes: EdgeThroughNode[]
  edgeCrossings: EdgeCrossing[]
}

export type ConflictSummary = {
  overlaps: number
  throughNodes: number
  crossings: number
  /** Short toolbar label, e.g. "2 overlaps". */
  label: string
  hasConflicts: boolean
}

/**
 * Bounding box from measured size, or kind defaults (width grows with label /
 * branch count). Optional margin expands the box for conflict tests.
 */
export function nodeConflictBox(
  node: LayoutNodeLike,
  margin = CONFLICT_MARGIN,
): ConflictBox {
  // Prefer measured size; otherwise trust defaultNodeSize / estimateNodeSize
  // (decision/switch widths already account for chip labels).
  const size = node.size?.w && node.size?.h ? node.size : defaultNodeSize(node)
  return {
    id: node.id,
    x: node.position.x - margin,
    y: node.position.y - margin,
    w: size.w + margin * 2,
    h: size.h + margin * 2,
    manual: !!node.manuallyPositioned,
  }
}

export function measureConflictBoxes(
  nodes: LayoutNodeLike[],
  margin = CONFLICT_MARGIN,
): ConflictBox[] {
  return nodes
    .filter((n) => n.kind !== 'group' && n.kind !== 'section' && !n.parentId)
    .map((n) => nodeConflictBox(n, margin))
}

function boxesOverlap(a: ConflictBox, b: ConflictBox): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
}

function pushDelta(
  a: ConflictBox,
  b: ConflictBox,
  direction: LayoutDirection,
): { dx: number; dy: number } {
  const overlapX = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)
  const overlapY = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)
  if (overlapX <= 0 || overlapY <= 0) return { dx: 0, dy: 0 }
  if (direction === 'DOWN') {
    // Prefer vertical separation along the flow.
    if (overlapY <= overlapX + 8) {
      return { dx: 0, dy: overlapY + 4 }
    }
    return { dx: overlapX + 4, dy: 0 }
  }
  if (overlapX <= overlapY + 8) {
    return { dx: overlapX + 4, dy: 0 }
  }
  return { dx: 0, dy: overlapY + 4 }
}

function edgePolyline(
  edge: LayoutEdgeLike,
  nodes: LayoutNodeLike[],
  direction: LayoutDirection,
): Point[] {
  return pathPointsForEdge(
    edge,
    nodes,
    (n) => defaultNodeSize(n),
    direction,
  )
}

function segmentsOf(points: Point[]) {
  const segs: Array<{ x1: number; y1: number; x2: number; y2: number }> = []
  for (let i = 1; i < points.length; i += 1) {
    segs.push({
      x1: points[i - 1].x,
      y1: points[i - 1].y,
      x2: points[i].x,
      y2: points[i].y,
    })
  }
  return segs
}

/** Detect overlaps, edges through foreign nodes, and edge crossings. */
export function detectConflicts(
  nodes: LayoutNodeLike[],
  edges: LayoutEdgeLike[],
  options: { margin?: number; direction?: LayoutDirection } = {},
): ConflictReport {
  const margin = options.margin ?? CONFLICT_MARGIN
  const direction = options.direction ?? 'DOWN'
  const boxes = measureConflictBoxes(nodes, margin)
  const byId = new Map(boxes.map((b) => [b.id, b]))

  const nodeOverlaps: NodeOverlap[] = []
  for (let i = 0; i < boxes.length; i += 1) {
    for (let j = i + 1; j < boxes.length; j += 1) {
      if (boxesOverlap(boxes[i], boxes[j])) {
        nodeOverlaps.push({ a: boxes[i].id, b: boxes[j].id })
      }
    }
  }

  const edgesThroughNodes: EdgeThroughNode[] = []
  for (const edge of edges) {
    const points = edgePolyline(edge, nodes, direction)
    const segs = segmentsOf(points)
    for (const box of boxes) {
      if (box.id === edge.source || box.id === edge.target) continue
      // Inflate content by THROUGH_INFLATE so near-miss clips count as failures.
      const raw = nodes.find((n) => n.id === box.id)
      if (!raw) continue
      const size = defaultNodeSize(raw)
      const content = {
        x: raw.position.x,
        y: raw.position.y,
        w: size.w,
        h: size.h,
      }
      for (const seg of segs) {
        if (segmentHitsRect(seg, content, THROUGH_INFLATE)) {
          edgesThroughNodes.push({ edgeId: edge.id, nodeId: box.id })
          break
        }
      }
    }
    void byId
  }

  // Lightweight crossing count: shared bus from different sources counts as a conflict-ish signal.
  const edgeCrossings: EdgeCrossing[] = []
  // Crossings are expensive; we only flag obvious mid-segment intersections of orthogonals.
  for (let i = 0; i < edges.length; i += 1) {
    for (let j = i + 1; j < edges.length; j += 1) {
      const a = edges[i]
      const b = edges[j]
      if (a.source === b.source || a.target === b.target) continue
      const sa = segmentsOf(edgePolyline(a, nodes, direction))
      const sb = segmentsOf(edgePolyline(b, nodes, direction))
      let hit = false
      for (const segA of sa) {
        for (const segB of sb) {
          const aH = Math.abs(segA.y1 - segA.y2) < 0.5
          const bH = Math.abs(segB.y1 - segB.y2) < 0.5
          if (aH === bH) continue
          if (aH) {
            const y = segA.y1
            const x = segB.x1
            const inX =
              x > Math.min(segA.x1, segA.x2) + 1 && x < Math.max(segA.x1, segA.x2) - 1
            const inY =
              y > Math.min(segB.y1, segB.y2) + 1 && y < Math.max(segB.y1, segB.y2) - 1
            if (inX && inY) {
              hit = true
              break
            }
          } else {
            const x = segA.x1
            const y = segB.y1
            const inY =
              y > Math.min(segA.y1, segA.y2) + 1 && y < Math.max(segA.y1, segA.y2) - 1
            const inX =
              x > Math.min(segB.x1, segB.x2) + 1 && x < Math.max(segB.x1, segB.x2) - 1
            if (inX && inY) {
              hit = true
              break
            }
          }
        }
        if (hit) break
      }
      if (hit) edgeCrossings.push({ a: a.id, b: b.id })
    }
  }

  return { nodeOverlaps, edgesThroughNodes, edgeCrossings }
}

export function summarizeConflicts(report: ConflictReport): ConflictSummary {
  const overlaps = report.nodeOverlaps.length
  const throughNodes = report.edgesThroughNodes.length
  const crossings = report.edgeCrossings.length
  const parts: string[] = []
  if (overlaps) parts.push(`${overlaps} overlap${overlaps === 1 ? '' : 's'}`)
  if (throughNodes) {
    parts.push(
      `${throughNodes} edge${throughNodes === 1 ? '' : 's'} through nodes`,
    )
  }
  if (!parts.length && crossings) {
    parts.push(`${crossings} edge crossing${crossings === 1 ? '' : 's'}`)
  }
  return {
    overlaps,
    throughNodes,
    crossings,
    label: parts.join(', ') || 'Layout OK',
    hasConflicts: overlaps > 0 || throughNodes > 0,
  }
}

/**
 * Push overlapping nodes apart along the flow direction (minimal displacement).
 * Manually positioned nodes stay put when the other node can move.
 * Then re-route affected edges with independent channels.
 */
export function resolveConflicts<
  N extends LayoutNodeLike,
  E extends LayoutEdgeLike,
>(
  nodes: N[],
  edges: E[],
  options: { direction?: LayoutDirection; margin?: number; maxPasses?: number } = {},
): { nodes: N[]; edges: E[]; report: ConflictReport } {
  const direction = options.direction ?? 'DOWN'
  const margin = options.margin ?? CONFLICT_MARGIN
  const maxPasses = options.maxPasses ?? 12

  const nextNodes = nodes.map((n) => ({
    ...n,
    position: { ...n.position },
  })) as N[]
  const nextEdges = edges.map((e) => ({ ...e })) as E[]
  const byId = new Map(nextNodes.map((n) => [n.id, n]))

  for (let pass = 0; pass < maxPasses; pass += 1) {
    const boxes = measureConflictBoxes(nextNodes, margin)
    let moved = false
    for (let i = 0; i < boxes.length; i += 1) {
      for (let j = i + 1; j < boxes.length; j += 1) {
        const a = boxes[i]
        const b = boxes[j]
        if (!boxesOverlap(a, b)) continue
        const delta = pushDelta(a, b, direction)
        if (delta.dx === 0 && delta.dy === 0) continue

        const nodeA = byId.get(a.id)!
        const nodeB = byId.get(b.id)!
        const aManual = !!nodeA.manuallyPositioned
        const bManual = !!nodeB.manuallyPositioned

        // Prefer moving the node that is further along the flow.
        const aIsAhead =
          direction === 'DOWN'
            ? nodeA.position.y >= nodeB.position.y
            : nodeA.position.x >= nodeB.position.x

        if (aManual && bManual) {
          // Nudge the ahead one slightly anyway so the badge can clear.
          const target = aIsAhead ? nodeA : nodeB
          target.position = {
            x: target.position.x + (aIsAhead ? delta.dx : -delta.dx),
            y: target.position.y + (aIsAhead ? delta.dy : -delta.dy),
          }
          moved = true
        } else if (aManual) {
          nodeB.position = {
            x: nodeB.position.x + (aIsAhead ? -delta.dx : delta.dx),
            y: nodeB.position.y + (aIsAhead ? -delta.dy : delta.dy),
          }
          moved = true
        } else if (bManual) {
          nodeA.position = {
            x: nodeA.position.x + (aIsAhead ? delta.dx : -delta.dx),
            y: nodeA.position.y + (aIsAhead ? delta.dy : -delta.dy),
          }
          moved = true
        } else if (aIsAhead) {
          nodeA.position = {
            x: nodeA.position.x + delta.dx,
            y: nodeA.position.y + delta.dy,
          }
          moved = true
        } else {
          nodeB.position = {
            x: nodeB.position.x + delta.dx,
            y: nodeB.position.y + delta.dy,
          }
          moved = true
        }
      }
    }
    if (!moved) break
  }

  // Re-route edges that touch moved nodes or still clip through a box.
  const affected = new Set<string>()
  for (const edge of nextEdges) {
    const src = byId.get(edge.source)
    const tgt = byId.get(edge.target)
    if (!src || !tgt) continue
    // Always refresh routed edges after a conflict pass so channels stay unique.
    affected.add(edge.id)
  }
  const routed = routeEdgesIndependently(
    nextNodes,
    nextEdges.filter((e) => affected.has(e.id)),
    (n) => defaultNodeSize(n),
    direction,
  )
  for (const edge of nextEdges) {
    const pts = routed.get(edge.id)
    if (pts) edge.waypoints = pts
  }

  // Second pass: if an edge still clips a node, re-route with a higher back-edge
  // / elbow slot (never a shared centre bus — that creates bow-tie markers).
  let report = detectConflicts(nextNodes, nextEdges, { margin, direction })
  if (report.edgesThroughNodes.length) {
    const bumpedIds = [...new Set(report.edgesThroughNodes.map((h) => h.edgeId))]
    const sizeOf = (n: LayoutNodeLike) => defaultNodeSize(n)
    // Include neighbours so slot assignment stays consistent, then overwrite only bumped.
    const rerouted = routeEdgesIndependently(nextNodes, nextEdges, sizeOf, direction)
    for (const id of bumpedIds) {
      const edge = nextEdges.find((e) => e.id === id)
      if (!edge) continue
      const pts = rerouted.get(id)
      if (pts) edge.waypoints = pts
    }
    // One more independent pass after positions settled.
    const again = routeEdgesIndependently(nextNodes, nextEdges, sizeOf, direction)
    for (const edge of nextEdges) {
      const pts = again.get(edge.id)
      if (pts) edge.waypoints = pts
    }
    report = detectConflicts(nextNodes, nextEdges, { margin, direction })
  }

  return { nodes: nextNodes, edges: nextEdges, report }
}

/** Fallback size constants for docs / tests. */
export const FALLBACK_NODE_SIZE = {
  w: DEFAULT_NODE_WIDTH,
  h: DEFAULT_NODE_HEIGHT,
}
