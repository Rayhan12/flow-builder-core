/**
 * Incremental placement: place newly added nodes near their anchors without
 * moving existing nodes. Overlaps with user-placed cards are allowed; only the
 * new node seeks a free spot. Edges are re-routed afterward (never by pushing
 * cards apart).
 */
import { detectConflicts } from './conflicts.ts'
import { routeEdgesIndependently } from './edgeRouting.ts'
import { LAYER_SPACING, NODE_NODE_SPACING, defaultNodeSize } from './nodeSizes.ts'
import type {
  LayoutDirection,
  LayoutEdgeLike,
  LayoutNodeLike,
  LayoutResult,
} from './types.ts'

type Box = {
  id: string
  x: number
  y: number
  w: number
  h: number
  manual: boolean
}

function toBox(node: LayoutNodeLike): Box {
  const size = defaultNodeSize(node)
  return {
    id: node.id,
    x: node.position.x,
    y: node.position.y,
    w: size.w,
    h: size.h,
    manual: !!node.manuallyPositioned || !!node.locked,
  }
}

function overlaps(a: Box, b: Box, gap = NODE_NODE_SPACING / 2): boolean {
  return !(
    a.x + a.w + gap <= b.x ||
    b.x + b.w + gap <= a.x ||
    a.y + a.h + gap <= b.y ||
    b.y + b.h + gap <= a.y
  )
}

function branchIndex(
  anchor: LayoutNodeLike,
  edge: LayoutEdgeLike | undefined,
): number {
  if (!edge?.sourceHandle) return 0
  const data = anchor.data
  if (!data || typeof data !== 'object') return 0
  const branches = (data as { branches?: Array<{ id: string }> }).branches
  if (!Array.isArray(branches)) return 0
  const idx = branches.findIndex((b) => b.id === edge.sourceHandle)
  return idx >= 0 ? idx : 0
}

function preferredPosition(
  anchor: LayoutNodeLike,
  newNode: LayoutNodeLike,
  edge: LayoutEdgeLike | undefined,
  direction: LayoutDirection,
  siblingIndex: number,
  siblingCount: number,
): { x: number; y: number } {
  const aSize = defaultNodeSize(anchor)
  const nSize = defaultNodeSize(newNode)
  const branch = branchIndex(anchor, edge)
  const fan = Math.max(branch, siblingIndex)
  const total = Math.max(siblingCount, 1)
  const spread = (fan - (total - 1) / 2) * (nSize.w + NODE_NODE_SPACING)

  if (direction === 'RIGHT') {
    return {
      x: anchor.position.x + aSize.w + LAYER_SPACING,
      y: anchor.position.y + spread,
    }
  }
  return {
    x: anchor.position.x + spread,
    y: anchor.position.y + aSize.h + LAYER_SPACING,
  }
}

/**
 * Find a free spot for a NEW node only. Existing occupied boxes never move;
 * the candidate walks along the flow direction until clear of them.
 */
function findFreeSpot(
  preferred: { x: number; y: number },
  size: { w: number; h: number },
  occupied: Box[],
  direction: LayoutDirection,
): { x: number; y: number } {
  const candidate: Box = {
    id: '__new__',
    x: preferred.x,
    y: preferred.y,
    w: size.w,
    h: size.h,
    manual: false,
  }
  for (let attempt = 0; attempt < 40; attempt++) {
    let hit = false
    for (const other of occupied) {
      if (!overlaps(candidate, other, NODE_NODE_SPACING / 3)) continue
      hit = true
      if (direction === 'RIGHT') {
        candidate.x = Math.max(candidate.x, other.x + other.w + NODE_NODE_SPACING)
      } else {
        candidate.y = Math.max(candidate.y, other.y + other.h + LAYER_SPACING)
      }
    }
    if (!hit) break
  }
  return { x: candidate.x, y: candidate.y }
}

export function placeNodesIncremental<
  N extends LayoutNodeLike,
  E extends LayoutEdgeLike,
>(
  nodes: N[],
  edges: E[],
  newNodeIds: string[],
  options: { direction?: LayoutDirection } = {},
): LayoutResult<N, E> {
  const direction = options.direction ?? 'DOWN'
  if (newNodeIds.length === 0) {
    return { nodes: nodes.map((n) => ({ ...n })), edges: edges.map((e) => ({ ...e })) }
  }

  const nextNodes = nodes.map((n) => ({ ...n, position: { ...n.position } })) as N[]
  const nextEdges = edges.map((e) => ({ ...e })) as E[]
  const byId = new Map(nextNodes.map((n) => [n.id, n]))
  const newSet = new Set(newNodeIds)

  // Snapshot existing positions so we can assert they never change.
  const existingPositions = new Map(
    nextNodes.filter((n) => !newSet.has(n.id)).map((n) => [n.id, { ...n.position }]),
  )

  const anchors = new Set<string>()
  const newByAnchor = new Map<string, string[]>()

  for (const id of newNodeIds) {
    const incoming = nextEdges.filter((e) => e.target === id && !newSet.has(e.source))
    const outgoing = nextEdges.filter((e) => e.source === id && !newSet.has(e.target))
    const edge = incoming[0]
    const anchorId = edge?.source ?? outgoing[0]?.target
    if (anchorId) {
      anchors.add(anchorId)
      const list = newByAnchor.get(anchorId) ?? []
      list.push(id)
      newByAnchor.set(anchorId, list)
    }
  }

  const occupied: Box[] = nextNodes.filter((n) => !newSet.has(n.id)).map((n) => toBox(n))

  for (const [anchorId, ids] of newByAnchor) {
    const anchor = byId.get(anchorId)
    if (!anchor) continue
    ids.forEach((id, siblingIndex) => {
      const node = byId.get(id)
      if (!node) return
      const edge = nextEdges.find((e) => e.target === id && e.source === anchorId)
      const preferred = preferredPosition(
        anchor,
        node,
        edge,
        direction,
        siblingIndex,
        ids.length,
      )
      const size = defaultNodeSize(node)
      const spot = findFreeSpot(preferred, size, occupied, direction)
      node.position = spot
      occupied.push({
        id: node.id,
        x: spot.x,
        y: spot.y,
        w: size.w,
        h: size.h,
        manual: false,
      })
    })
  }

  // Orphans (no anchor): place to the right/bottom of the bounding box.
  for (const id of newNodeIds) {
    const node = byId.get(id)
    if (!node) continue
    if ([...newByAnchor.values()].some((list) => list.includes(id))) continue
    let maxX = 0
    let maxY = 0
    for (const b of occupied) {
      maxX = Math.max(maxX, b.x + b.w)
      maxY = Math.max(maxY, b.y + b.h)
    }
    const size = defaultNodeSize(node)
    const preferred =
      direction === 'RIGHT'
        ? { x: maxX + LAYER_SPACING, y: 0 }
        : { x: 0, y: maxY + LAYER_SPACING }
    const spot = findFreeSpot(preferred, size, occupied, direction)
    node.position = spot
    occupied.push({
      id: node.id,
      x: spot.x,
      y: spot.y,
      w: size.w,
      h: size.h,
      manual: false,
    })
  }

  // Hard guarantee: never shift an existing node (even if it overlaps the new one).
  for (const node of nextNodes) {
    const kept = existingPositions.get(node.id)
    if (!kept) continue
    node.position = { x: kept.x, y: kept.y }
  }

  // Re-route edges around cards; never push cards apart for through-edges.
  const routed = routeEdgesIndependently(
    nextNodes,
    nextEdges,
    (n) => defaultNodeSize(n),
    direction,
  )
  for (const edge of nextEdges) {
    const pts = routed.get(edge.id)
    if (pts) edge.waypoints = pts
  }

  // Conflicts may remain (user overlaps); callers show the Fix layout badge.
  void detectConflicts(nextNodes, nextEdges, { direction })

  return { nodes: nextNodes, edges: nextEdges }
}

/** True when any pair of top-level node bounding boxes overlap (gap 0). */
export function hasOverlappingNodes(nodes: LayoutNodeLike[]): boolean {
  const boxes = nodes.filter((n) => !n.parentId).map((n) => toBox(n))
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      if (overlaps(boxes[i], boxes[j], 0)) return true
    }
  }
  return false
}

export function nodeBoundingBoxes(nodes: LayoutNodeLike[]): Box[] {
  return nodes.filter((n) => !n.parentId).map((n) => toBox(n))
}
