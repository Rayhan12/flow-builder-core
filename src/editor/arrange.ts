import type { DiagramNode } from '../schema'
import { DEFAULT_NODE_WIDTH, GRID_SIZE, nodeBox, type NodeBox } from './alignment'

export type AlignMode =
  | 'left'
  | 'center'
  | 'right'
  | 'top'
  | 'middle'
  | 'bottom'

export type DistributeAxis = 'horizontal' | 'vertical'

function boxesFor(
  nodes: DiagramNode[],
  ids: string[],
  allNodes: DiagramNode[],
): Array<{ node: DiagramNode; box: NodeBox }> {
  const idSet = new Set(ids)
  return nodes
    .filter((n) => idSet.has(n.id) && !n.locked && !n.hidden)
    .map((n) => ({ node: n, box: nodeBox(n, allNodes) }))
}

/** Convert an absolute flow-space position back to the node's stored position. */
function toStoredPosition(
  node: DiagramNode,
  abs: { x: number; y: number },
  allNodes: DiagramNode[],
): { x: number; y: number } {
  if (!node.parentId) return abs
  const parent = allNodes.find((n) => n.id === node.parentId)
  if (!parent) return abs
  return { x: abs.x - parent.position.x, y: abs.y - parent.position.y }
}

export function alignNodes(
  nodes: DiagramNode[],
  ids: string[],
  mode: AlignMode,
): Array<{ id: string; position: { x: number; y: number } }> {
  const items = boxesFor(nodes, ids, nodes)
  if (items.length < 2) return []

  const updates: Array<{ id: string; position: { x: number; y: number } }> = []

  if (mode === 'left') {
    const target = Math.min(...items.map((i) => i.box.left))
    for (const item of items) {
      updates.push({
        id: item.node.id,
        position: toStoredPosition(item.node, { x: target, y: item.box.top }, nodes),
      })
    }
  } else if (mode === 'right') {
    const target = Math.max(...items.map((i) => i.box.right))
    for (const item of items) {
      updates.push({
        id: item.node.id,
        position: toStoredPosition(
          item.node,
          { x: target - item.box.width, y: item.box.top },
          nodes,
        ),
      })
    }
  } else if (mode === 'center') {
    const minL = Math.min(...items.map((i) => i.box.left))
    const maxR = Math.max(...items.map((i) => i.box.right))
    const mid = (minL + maxR) / 2
    for (const item of items) {
      updates.push({
        id: item.node.id,
        position: toStoredPosition(
          item.node,
          { x: mid - item.box.width / 2, y: item.box.top },
          nodes,
        ),
      })
    }
  } else if (mode === 'top') {
    const target = Math.min(...items.map((i) => i.box.top))
    for (const item of items) {
      updates.push({
        id: item.node.id,
        position: toStoredPosition(item.node, { x: item.box.left, y: target }, nodes),
      })
    }
  } else if (mode === 'bottom') {
    const target = Math.max(...items.map((i) => i.box.bottom))
    for (const item of items) {
      updates.push({
        id: item.node.id,
        position: toStoredPosition(
          item.node,
          { x: item.box.left, y: target - item.box.height },
          nodes,
        ),
      })
    }
  } else {
    // middle
    const minT = Math.min(...items.map((i) => i.box.top))
    const maxB = Math.max(...items.map((i) => i.box.bottom))
    const mid = (minT + maxB) / 2
    for (const item of items) {
      updates.push({
        id: item.node.id,
        position: toStoredPosition(
          item.node,
          { x: item.box.left, y: mid - item.box.height / 2 },
          nodes,
        ),
      })
    }
  }

  return updates
}

export function distributeNodes(
  nodes: DiagramNode[],
  ids: string[],
  axis: DistributeAxis,
): Array<{ id: string; position: { x: number; y: number } }> {
  const items = boxesFor(nodes, ids, nodes)
  if (items.length < 3) return []

  const updates: Array<{ id: string; position: { x: number; y: number } }> = []

  if (axis === 'horizontal') {
    const sorted = [...items].sort((a, b) => a.box.left - b.box.left)
    const first = sorted[0]
    const last = sorted[sorted.length - 1]
    const totalWidth = sorted.reduce((sum, i) => sum + i.box.width, 0)
    const span = last.box.right - first.box.left
    const gap = (span - totalWidth) / (sorted.length - 1)
    let cursor = first.box.left
    for (const item of sorted) {
      updates.push({
        id: item.node.id,
        position: toStoredPosition(item.node, { x: cursor, y: item.box.top }, nodes),
      })
      cursor += item.box.width + gap
    }
  } else {
    const sorted = [...items].sort((a, b) => a.box.top - b.box.top)
    const first = sorted[0]
    const last = sorted[sorted.length - 1]
    const totalHeight = sorted.reduce((sum, i) => sum + i.box.height, 0)
    const span = last.box.bottom - first.box.top
    const gap = (span - totalHeight) / (sorted.length - 1)
    let cursor = first.box.top
    for (const item of sorted) {
      updates.push({
        id: item.node.id,
        position: toStoredPosition(item.node, { x: item.box.left, y: cursor }, nodes),
      })
      cursor += item.box.height + gap
    }
  }

  return updates
}

/**
 * Tidy up: arrange selected nodes into a neat grid / column with even gaps.
 * Prefers a single row when nodes are already roughly horizontal; otherwise a grid.
 */
export function tidyUpNodes(
  nodes: DiagramNode[],
  ids: string[],
  gap = GRID_SIZE * 2,
): Array<{ id: string; position: { x: number; y: number } }> {
  const items = boxesFor(nodes, ids, nodes)
  if (items.length < 2) return []

  const sorted = [...items].sort((a, b) => {
    const row = Math.round(a.box.top / 40) - Math.round(b.box.top / 40)
    if (row !== 0) return row
    return a.box.left - b.box.left
  })

  const avgW =
    sorted.reduce((s, i) => s + i.box.width, 0) / sorted.length || DEFAULT_NODE_WIDTH

  const minL = Math.min(...sorted.map((i) => i.box.left))
  const minT = Math.min(...sorted.map((i) => i.box.top))
  const maxR = Math.max(...sorted.map((i) => i.box.right))
  const spanW = maxR - minL

  // Choose column count from current span; fall back to a single column.
  let cols = Math.max(1, Math.round(spanW / (avgW + gap)))
  if (cols > sorted.length) cols = sorted.length
  // Prefer column when mostly stacked.
  const heightSpan =
    Math.max(...sorted.map((i) => i.box.bottom)) - Math.min(...sorted.map((i) => i.box.top))
  if (heightSpan > spanW * 1.2) cols = 1

  const cellW = Math.max(...sorted.map((i) => i.box.width))
  const cellH = Math.max(...sorted.map((i) => i.box.height))
  const updates: Array<{ id: string; position: { x: number; y: number } }> = []

  sorted.forEach((item, index) => {
    const col = index % cols
    const row = Math.floor(index / cols)
    const x = minL + col * (cellW + gap)
    const y = minT + row * (cellH + gap)
    updates.push({
      id: item.node.id,
      position: toStoredPosition(item.node, { x, y }, nodes),
    })
  })

  return updates
}
