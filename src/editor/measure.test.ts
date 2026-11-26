import { describe, expect, it } from 'vitest'
import type { NodeBox } from './alignment'
import { distancesBetweenBoxes, distancesWhileDragging } from './measure'

function box(id: string, left: number, top: number, w = 100, h = 80): NodeBox {
  return {
    id,
    left,
    right: left + w,
    top,
    bottom: top + h,
    centerX: left + w / 2,
    centerY: top + h / 2,
    width: w,
    height: h,
  }
}

describe('measure', () => {
  it('reports gap to the nearest neighbour while dragging', () => {
    const moving = box('m', 160, 0)
    const left = box('l', 0, 0)
    const measures = distancesWhileDragging(moving, [left])
    expect(measures.some((m) => m.orientation === 'horizontal' && m.distance === 60)).toBe(
      true,
    )
  })

  it('measures between selected and hovered boxes', () => {
    const selected = box('a', 0, 0)
    const hovered = box('b', 200, 0)
    const measures = distancesBetweenBoxes(selected, hovered)
    expect(measures).toHaveLength(1)
    expect(measures[0].distance).toBe(100)
  })
})
