import type { NodeBox } from './alignment'

export type DistanceMeasurement = {
  orientation: 'horizontal' | 'vertical'
  /** Line start in flow space */
  x1: number
  y1: number
  x2: number
  y2: number
  /** Label midpoint */
  labelX: number
  labelY: number
  distance: number
}

/**
 * While dragging, show red distance lines from the moving box to the nearest
 * neighbour on each side (outer edge gaps only).
 */
export function distancesWhileDragging(
  moving: NodeBox,
  others: NodeBox[],
): DistanceMeasurement[] {
  const result: DistanceMeasurement[] = []
  if (!others.length) return result

  let nearestLeft: { box: NodeBox; gap: number } | null = null
  let nearestRight: { box: NodeBox; gap: number } | null = null
  let nearestAbove: { box: NodeBox; gap: number } | null = null
  let nearestBelow: { box: NodeBox; gap: number } | null = null

  for (const other of others) {
    const overlapY = moving.top < other.bottom && moving.bottom > other.top
    const overlapX = moving.left < other.right && moving.right > other.left

    if (overlapY) {
      const gapL = moving.left - other.right
      if (gapL > 0 && (!nearestLeft || gapL < nearestLeft.gap)) {
        nearestLeft = { box: other, gap: gapL }
      }
      const gapR = other.left - moving.right
      if (gapR > 0 && (!nearestRight || gapR < nearestRight.gap)) {
        nearestRight = { box: other, gap: gapR }
      }
    }
    if (overlapX) {
      const gapA = moving.top - other.bottom
      if (gapA > 0 && (!nearestAbove || gapA < nearestAbove.gap)) {
        nearestAbove = { box: other, gap: gapA }
      }
      const gapB = other.top - moving.bottom
      if (gapB > 0 && (!nearestBelow || gapB < nearestBelow.gap)) {
        nearestBelow = { box: other, gap: gapB }
      }
    }
  }

  if (nearestLeft) {
    const y = Math.max(
      Math.min(moving.centerY, nearestLeft.box.bottom - 4),
      nearestLeft.box.top + 4,
    )
    const x1 = nearestLeft.box.right
    const x2 = moving.left
    result.push({
      orientation: 'horizontal',
      x1,
      y1: y,
      x2,
      y2: y,
      labelX: (x1 + x2) / 2,
      labelY: y,
      distance: Math.round(nearestLeft.gap),
    })
  }
  if (nearestRight) {
    const y = Math.max(
      Math.min(moving.centerY, nearestRight.box.bottom - 4),
      nearestRight.box.top + 4,
    )
    const x1 = moving.right
    const x2 = nearestRight.box.left
    result.push({
      orientation: 'horizontal',
      x1,
      y1: y,
      x2,
      y2: y,
      labelX: (x1 + x2) / 2,
      labelY: y,
      distance: Math.round(nearestRight.gap),
    })
  }
  if (nearestAbove) {
    const x = Math.max(
      Math.min(moving.centerX, nearestAbove.box.right - 4),
      nearestAbove.box.left + 4,
    )
    const y1 = nearestAbove.box.bottom
    const y2 = moving.top
    result.push({
      orientation: 'vertical',
      x1: x,
      y1,
      x2: x,
      y2,
      labelX: x,
      labelY: (y1 + y2) / 2,
      distance: Math.round(nearestAbove.gap),
    })
  }
  if (nearestBelow) {
    const x = Math.max(
      Math.min(moving.centerX, nearestBelow.box.right - 4),
      nearestBelow.box.left + 4,
    )
    const y1 = moving.bottom
    const y2 = nearestBelow.box.top
    result.push({
      orientation: 'vertical',
      x1: x,
      y1,
      x2: x,
      y2,
      labelX: x,
      labelY: (y1 + y2) / 2,
      distance: Math.round(nearestBelow.gap),
    })
  }

  return result
}

/**
 * Alt + hover: distances between a selected box and the hovered box
 * (outer edges on both axes when they do not overlap).
 */
export function distancesBetweenBoxes(
  selected: NodeBox,
  hovered: NodeBox,
): DistanceMeasurement[] {
  const result: DistanceMeasurement[] = []

  if (selected.right < hovered.left) {
    const y = (Math.max(selected.top, hovered.top) + Math.min(selected.bottom, hovered.bottom)) / 2
    const x1 = selected.right
    const x2 = hovered.left
    result.push({
      orientation: 'horizontal',
      x1,
      y1: y,
      x2,
      y2: y,
      labelX: (x1 + x2) / 2,
      labelY: y,
      distance: Math.round(hovered.left - selected.right),
    })
  } else if (hovered.right < selected.left) {
    const y = (Math.max(selected.top, hovered.top) + Math.min(selected.bottom, hovered.bottom)) / 2
    const x1 = hovered.right
    const x2 = selected.left
    result.push({
      orientation: 'horizontal',
      x1,
      y1: y,
      x2,
      y2: y,
      labelX: (x1 + x2) / 2,
      labelY: y,
      distance: Math.round(selected.left - hovered.right),
    })
  }

  if (selected.bottom < hovered.top) {
    const x = (Math.max(selected.left, hovered.left) + Math.min(selected.right, hovered.right)) / 2
    const y1 = selected.bottom
    const y2 = hovered.top
    result.push({
      orientation: 'vertical',
      x1: x,
      y1,
      x2: x,
      y2,
      labelX: x,
      labelY: (y1 + y2) / 2,
      distance: Math.round(hovered.top - selected.bottom),
    })
  } else if (hovered.bottom < selected.top) {
    const x = (Math.max(selected.left, hovered.left) + Math.min(selected.right, hovered.right)) / 2
    const y1 = hovered.bottom
    const y2 = selected.top
    result.push({
      orientation: 'vertical',
      x1: x,
      y1,
      x2: x,
      y2,
      labelX: x,
      labelY: (y1 + y2) / 2,
      distance: Math.round(selected.top - hovered.bottom),
    })
  }

  // When overlapping on one axis, still show centre-to-centre deltas for the other.
  if (result.length === 0) {
    const dx = Math.round(hovered.centerX - selected.centerX)
    const dy = Math.round(hovered.centerY - selected.centerY)
    if (Math.abs(dx) > 0) {
      result.push({
        orientation: 'horizontal',
        x1: selected.centerX,
        y1: selected.centerY,
        x2: hovered.centerX,
        y2: selected.centerY,
        labelX: (selected.centerX + hovered.centerX) / 2,
        labelY: selected.centerY,
        distance: Math.abs(dx),
      })
    }
    if (Math.abs(dy) > 0) {
      result.push({
        orientation: 'vertical',
        x1: hovered.centerX,
        y1: selected.centerY,
        x2: hovered.centerX,
        y2: hovered.centerY,
        labelX: hovered.centerX,
        labelY: (selected.centerY + hovered.centerY) / 2,
        distance: Math.abs(dy),
      })
    }
  }

  return result
}
