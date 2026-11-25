import { describe, expect, it } from 'vitest'
import type { DiagramNode } from '../schema'
import { applyZOrder, sortNodesForCanvas } from './zOrder'

function step(id: string, z?: number): DiagramNode {
  return {
    id,
    kind: 'step',
    label: id,
    position: { x: 0, y: 0 },
    ...(typeof z === 'number' ? { zIndex: z } : {}),
  }
}

function group(id: string): DiagramNode {
  return {
    id,
    kind: 'group',
    label: id,
    position: { x: 0, y: 0 },
    size: { w: 360, h: 240 },
    data: { label: id, collapsed: false },
  }
}

describe('zOrder', () => {
  it('keeps containers before nodes in canvas paint order', () => {
    const nodes = [step('a'), group('g'), step('b')]
    const ordered = sortNodesForCanvas(nodes)
    expect(ordered[0].id).toBe('g')
  })

  it('brings a node to front', () => {
    const nodes = [step('a', 0), step('b', 1), step('c', 2)]
    const next = applyZOrder(nodes, ['a'], 'front')
    const zs = Object.fromEntries(next.map((n) => [n.id, n.zIndex]))
    expect(zs.a).toBeGreaterThan(zs.b as number)
    expect(zs.a).toBeGreaterThan(zs.c as number)
  })

  it('sends a node to back', () => {
    const nodes = [step('a', 0), step('b', 1), step('c', 2)]
    const next = applyZOrder(nodes, ['c'], 'back')
    const zs = Object.fromEntries(next.map((n) => [n.id, n.zIndex]))
    expect(zs.c).toBeLessThan(zs.a as number)
  })
})
