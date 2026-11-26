import { describe, expect, it } from 'vitest'
import { nearestSideHandle, nearestSidesBetween, type Box } from './nearestSide'

const box = (left: number, top: number, width = 100, height = 80): Box => ({
  left,
  top,
  width,
  height,
})

describe('nearestSideHandle', () => {
  const b = box(0, 0, 100, 80)

  it('picks the side nearest to a point outside the box', () => {
    expect(nearestSideHandle({ x: 150, y: 40 }, b)).toBe('right')
    expect(nearestSideHandle({ x: -20, y: 40 }, b)).toBe('left')
    expect(nearestSideHandle({ x: 50, y: -10 }, b)).toBe('top')
    expect(nearestSideHandle({ x: 50, y: 120 }, b)).toBe('bottom')
  })

  it('normalises by box size so wide boxes favour horizontal sides less', () => {
    const wide = box(0, 0, 400, 40)
    expect(nearestSideHandle({ x: 200, y: 80 }, wide)).toBe('bottom')
    expect(nearestSideHandle({ x: 450, y: 20 }, wide)).toBe('right')
  })

  it('breaks ties by preferring the larger absolute axis', () => {
    // Equal normalised dx/dy → vertical branch (abs(dx) is not greater)
    expect(nearestSideHandle({ x: 100, y: 80 }, box(0, 0, 100, 80))).toBe('bottom')
    expect(nearestSideHandle({ x: 0, y: 0 }, box(0, 0, 100, 80))).toBe('top')
  })

  it('handles degenerate zero-size boxes without dividing by zero', () => {
    const point = nearestSideHandle({ x: 5, y: 0 }, box(0, 0, 0, 0))
    expect(['top', 'right', 'bottom', 'left']).toContain(point)
  })
})

describe('nearestSidesBetween', () => {
  it('returns opposing side handles for A→B when boxes sit side by side', () => {
    const a = box(0, 0, 100, 80)
    const b = box(200, 0, 100, 80)
    expect(nearestSidesBetween(a, b)).toEqual({
      sourceHandle: 'right',
      targetHandle: 'left',
    })
  })

  it('returns top/bottom when B is above A', () => {
    const a = box(0, 200, 100, 80)
    const b = box(0, 0, 100, 80)
    expect(nearestSidesBetween(a, b)).toEqual({
      sourceHandle: 'top',
      targetHandle: 'bottom',
    })
  })

  it('returns bottom/top when B is below A', () => {
    const a = box(0, 0, 100, 80)
    const b = box(0, 200, 100, 80)
    expect(nearestSidesBetween(a, b)).toEqual({
      sourceHandle: 'bottom',
      targetHandle: 'top',
    })
  })

  it('is consistent with nearestSideHandle on each centre', () => {
    const a = box(10, 20, 120, 90)
    const b = box(300, 40, 80, 100)
    const aCenter = { x: a.left + a.width / 2, y: a.top + a.height / 2 }
    const bCenter = { x: b.left + b.width / 2, y: b.top + b.height / 2 }
    expect(nearestSidesBetween(a, b)).toEqual({
      sourceHandle: nearestSideHandle(bCenter, a),
      targetHandle: nearestSideHandle(aCenter, b),
    })
  })
})
