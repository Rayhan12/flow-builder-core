/**
 * Incremental placement: place newly added nodes near their anchors and shift
 * only affected (downstream) nodes so nothing overlaps. Prefer not to move
 * manuallyPositioned nodes; never leave overlaps.
 */
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

function overlapDelta(
  a: Box,
  b: Box,
  direction: LayoutDirection,
): { dx: number; dy: number } {
  if (!overlaps(a, b, 0)) return { dx: 0, dy: 0 }
  if (direction === 'RIGHT') {
    const push = a.x + a.w + NODE_NODE_SPACING - b.x
    return { dx: Math.max(0, push), dy: 0 }
  }
  const push = a.y + a.h + LAYER_SPACING - b.y
  return { dx: 0, dy: Math.max(0, push) }
}

/** Nodes reachable following edges forward from `roots`. */
function downstreamIds(
  roots: Iterable<string>,
  edges: LayoutEdgeLike[],
): Set<string> {
  const out = new Map<string, string[]>()
  for (const e of edges) {
    const list = out.get(e.source) ?? []
    list.push(e.target)
    out.set(e.source, list)
  }
  const seen = new Set<string>()
  const queue = [...roots]
  while (queue.length) {
    const id = queue.pop()!
    if (seen.has(id)) continue
    seen.add(id)
    for (const next of out.get(id) ?? []) queue.push(next)
  }
  return seen
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

/**
 * Resolve remaining overlaps by shifting movable (preferably non-manual)
 * nodes in the flow direction. Guarantees no bounding-box overlaps.
 */
function resolveOverlaps(
  boxes: Box[],
  movable: Set<string>,
  direction: LayoutDirection,
): void {
  for (let iter = 0; iter < 80; iter++) {
    let moved = false
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i]
        const b = boxes[j]
        if (!overlaps(a, b, 0)) continue

        const preferA = movable.has(a.id) && (!a.manual || b.manual)
        const preferB = movable.has(b.id) && (!b.manual || a.manual)
        let shiftTarget: Box
        let other: Box
        if (preferB && !preferA) {
          shiftTarget = b
          other = a
        } else if (preferA && !preferB) {
          shiftTarget = a
          other = b
        } else if (movable.has(b.id)) {
          shiftTarget = b
          other = a
        } else if (movable.has(a.id)) {
          shiftTarget = a
          other = b
        } else {
          // Neither marked movable — still must clear overlap; push the lower/righter one.
          if (direction === 'RIGHT') {
            shiftTarget = a.x <= b.x ? b : a
            other = shiftTarget === a ? b : a
          } else {
            shiftTarget = a.y <= b.y ? b : a
            other = shiftTarget === a ? b : a
          }
        }

        const delta = overlapDelta(other, shiftTarget, direction)
        if (delta.dx === 0 && delta.dy === 0) {
          // Degenerate: force a step.
          if (direction === 'RIGHT') shiftTarget.x += NODE_NODE_SPACING
          else shiftTarget.y += LAYER_SPACING
        } else {
          shiftTarget.x += delta.dx
          shiftTarget.y += delta.dy
        }
        moved = true
      }
    }
    if (!moved) break
  }
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

  const occupied: Box[] = nextNodes
    .filter((n) => !newSet.has(n.id))
    .map((n) => toBox(n))

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

  const movable = downstreamIds([...anchors, ...newNodeIds], nextEdges)
  // Always allow shifting the new nodes.
  for (const id of newNodeIds) movable.add(id)

  const boxes = nextNodes
    .filter((n) => !n.parentId)
    .map((n) => toBox(n))
  resolveOverlaps(boxes, movable, direction)

  const boxById = new Map(boxes.map((b) => [b.id, b]))
  for (const node of nextNodes) {
    const box = boxById.get(node.id)
    if (!box) continue
    // Preserve manually positioned coordinates unless we had to move them.
    if (
      node.manuallyPositioned &&
      Math.abs(box.x - node.position.x) < 0.5 &&
      Math.abs(box.y - node.position.y) < 0.5
    ) {
      continue
    }
    node.position = { x: box.x, y: box.y }
  }

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
