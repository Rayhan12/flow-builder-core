/** Last pointer position in flow coordinates (for paste / click-add). */

let lastFlowPoint: { x: number; y: number } | null = null

export function setLastFlowPoint(point: { x: number; y: number }): void {
  lastFlowPoint = { x: point.x, y: point.y }
}

export function getLastFlowPoint(): { x: number; y: number } | null {
  return lastFlowPoint ? { ...lastFlowPoint } : null
}
