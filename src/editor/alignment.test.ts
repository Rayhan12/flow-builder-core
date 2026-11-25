import { describe, expect, it } from 'vitest'
import {
  computeAlignment,
  cycleGridMode,
  snapToGrid,
  type NodeBox,
} from './alignment'

function box(
  id: string,
  left: number,
  top: number,
  width = 256,
  height = 96,
): NodeBox {
  return {
    id,
    left,
    right: left + width,
    top,
    bottom: top + height,
    centerX: left + width / 2,
    centerY: top + height / 2,
    width,
    height,
  }
}

describe('alignment helpers', () => {
  it('snaps values to the 16px grid', () => {
    expect(snapToGrid(0)).toBe(0)
    expect(snapToGrid(7)).toBe(0)
    expect(snapToGrid(8)).toBe(16)
    expect(snapToGrid(23)).toBe(16)
    expect(snapToGrid(24)).toBe(32)
    expect(snapToGrid(25)).toBe(32)
  })

  it('cycles grid modes', () => {
    expect(cycleGridMode('dots')).toBe('lines')
    expect(cycleGridMode('lines')).toBe('none')
    expect(cycleGridMode('none')).toBe('dots')
  })

  it('snaps to a nearby left edge and emits a vertical guide', () => {
    const moving = box('a', 102, 40)
    const other = box('b', 100, 200)
    const result = computeAlignment(moving, [other], 6)
    expect(result.box.left).toBe(100)
    expect(result.guides.some((g) => g.orientation === 'vertical' && g.position === 100)).toBe(
      true,
    )
  })

  it('snaps centres horizontally', () => {
    const moving = box('a', 10, 0)
    const other = box('b', 14, 200)
    // centres: a=138, b=142 — within 6
    const result = computeAlignment(moving, [other], 6)
    expect(result.box.centerX).toBe(other.centerX)
  })

  it('emits equal spacing hints when gaps match', () => {
    const left = box('l', 0, 0, 100, 80)
    const right = box('r', 300, 0, 100, 80)
    // Nearly equal gaps: gapL=50, gapR=50 when left=150. At 148: 48 vs 52 (within 6).
    const moving = box('m', 148, 0, 100, 80)
    const result = computeAlignment(moving, [left, right], 6)
    expect(result.spacings.length).toBeGreaterThan(0)
    expect(result.spacings[0]?.distance).toBe(50)
  })
})
