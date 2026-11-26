import { describe, expect, it } from 'vitest'
import type { DiagramNode } from '../schema'
import { alignNodes, distributeNodes, tidyUpNodes } from './arrange'

function step(id: string, x: number, y: number, w = 100, h = 80): DiagramNode {
  return {
    id,
    kind: 'step',
    label: id,
    position: { x, y },
    size: { w, h },
    data: {},
  }
}

describe('arrange', () => {
  it('aligns left so all x match the leftmost', () => {
    const nodes = [step('a', 40, 0), step('b', 120, 100), step('c', 200, 50)]
    const updates = alignNodes(nodes, ['a', 'b', 'c'], 'left')
    expect(updates).toHaveLength(3)
    expect(updates.every((u) => u.position.x === 40)).toBe(true)
  })

  it('aligns top', () => {
    const nodes = [step('a', 0, 40), step('b', 120, 90)]
    const updates = alignNodes(nodes, ['a', 'b'], 'top')
    expect(updates.every((u) => u.position.y === 40)).toBe(true)
  })

  it('distributes horizontal gaps evenly', () => {
    const nodes = [
      step('a', 0, 0, 100, 80),
      step('b', 150, 0, 100, 80),
      step('c', 400, 0, 100, 80),
    ]
    const updates = distributeNodes(nodes, ['a', 'b', 'c'], 'horizontal')
    const byId = Object.fromEntries(updates.map((u) => [u.id, u.position]))
    expect(byId.a.x).toBe(0)
    expect(byId.c.x).toBe(400)
    // span 500, total width 300, two gaps => 100 each => b at 200
    expect(byId.b.x).toBe(200)
  })

  it('tidy up places nodes on a grid', () => {
    const nodes = [
      step('a', 10, 12),
      step('b', 140, 18),
      step('c', 20, 140),
      step('d', 150, 145),
    ]
    const updates = tidyUpNodes(nodes, ['a', 'b', 'c', 'd'], 32)
    expect(updates).toHaveLength(4)
    const xs = new Set(updates.map((u) => u.position.x))
    const ys = new Set(updates.map((u) => u.position.y))
    expect(xs.size).toBeGreaterThanOrEqual(2)
    expect(ys.size).toBeGreaterThanOrEqual(2)
  })
})
