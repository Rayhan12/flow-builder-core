export type SideHandleId = 'top' | 'right' | 'bottom' | 'left'

export type Box = {
  left: number
  top: number
  width: number
  height: number
}

/**
 * Pick the side of a node box nearest to a point (flow coordinates).
 * Used when dropping a connection on a node body or connecting with the connector tool.
 */
export function nearestSideHandle(
  point: { x: number; y: number },
  box: Box,
): SideHandleId {
  const cx = box.left + box.width / 2
  const cy = box.top + box.height / 2
  const dx = (point.x - cx) / Math.max(box.width, 1)
  const dy = (point.y - cy) / Math.max(box.height, 1)
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? 'right' : 'left'
  return dy > 0 ? 'bottom' : 'top'
}

/** Midpoint of a box side, in the same coordinate space as the box. */
export function sideMidpoint(box: Box, side: SideHandleId): { x: number; y: number } {
  switch (side) {
    case 'top':
      return { x: box.left + box.width / 2, y: box.top }
    case 'bottom':
      return { x: box.left + box.width / 2, y: box.top + box.height }
    case 'left':
      return { x: box.left, y: box.top + box.height / 2 }
    case 'right':
      return { x: box.left + box.width, y: box.top + box.height / 2 }
  }
}

/**
 * Nearest sides between two boxes for A→B connector-tool links.
 */
export function nearestSidesBetween(
  a: Box,
  b: Box,
): { sourceHandle: SideHandleId; targetHandle: SideHandleId } {
  const aCenter = { x: a.left + a.width / 2, y: a.top + a.height / 2 }
  const bCenter = { x: b.left + b.width / 2, y: b.top + b.height / 2 }
  return {
    sourceHandle: nearestSideHandle(bCenter, a),
    targetHandle: nearestSideHandle(aCenter, b),
  }
}
