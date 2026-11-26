import { describe, expect, it } from 'vitest'
import { placeNodesIncremental } from './incremental.ts'
import { applyElbowOffsets, resolveEdgeHandles, type RoutedEdge, type SizedNode } from './edgeRouting.ts'
import type { LayoutEdgeLike, LayoutNodeLike } from './types.ts'

function node(
  id: string,
  kind: string,
  position: { x: number; y: number },
  extra: Partial<LayoutNodeLike> = {},
): LayoutNodeLike {
  return { id, kind, label: id, position, size: { w: 200, h: 80 }, ...extra }
}

function edge(id: string, source: string, target: string, extra: Partial<LayoutEdgeLike> = {}): LayoutEdgeLike {
  return { id, source, target, ...extra }
}

describe('layout policy: never move existing nodes', () => {
  it('placeNodesIncremental keeps every existing x/y exactly', () => {
    const nodes = [
      node('a', 'start', { x: 10, y: 20 }),
      node('b', 'step', { x: 40, y: 200 }),
      node('c', 'step', { x: 40, y: 200 }),
    ]
    const edges = [edge('e1', 'a', 'b'), edge('e2', 'b', 'c')]
    const before = Object.fromEntries(nodes.filter((n) => n.id !== 'c').map((n) => [n.id, { ...n.position }]))
    const result = placeNodesIncremental(nodes, edges, ['c'], { direction: 'DOWN' })
    for (const n of result.nodes) {
      if (n.id === 'c') continue
      expect(n.position.x).toBe(before[n.id].x)
      expect(n.position.y).toBe(before[n.id].y)
    }
  })

  it('title-length growth neighbour would stay put (positions unchanged by incremental)', () => {
    const tall = node('a', 'step', { x: 0, y: 0 }, { size: { w: 360, h: 160 } })
    const neighbour = node('b', 'step', { x: 0, y: 100 })
    const newbie = node('c', 'step', { x: 0, y: 0 })
    const edges = [edge('e1', 'a', 'c')]
    const beforeB = { ...neighbour.position }
    const result = placeNodesIncremental([tall, neighbour, newbie], edges, ['c'], {
      direction: 'DOWN',
    })
    const b = result.nodes.find((n) => n.id === 'b')!
    expect(b.position).toEqual(beforeB)
  })
})

describe('resolveEdgeHandles floating vs pinned', () => {
  const src: SizedNode = { id: 'a', kind: 'step', position: { x: 0, y: 0 }, size: { w: 100, h: 60 } }
  const tgt: SizedNode = { id: 'b', kind: 'step', position: { x: 200, y: 0 }, size: { w: 100, h: 60 } }

  it('floats when pinnedSide is explicitly false', () => {
    const e: RoutedEdge = {
      id: 'e1',
      source: 'a',
      target: 'b',
      sourceHandle: 'bottom',
      targetHandle: 'top',
      data: { pinnedSide: { source: false, target: false } },
    }
    const h = resolveEdgeHandles(e, src, tgt, { w: 100, h: 60 }, { w: 100, h: 60 })
    expect(h.sourceHandle).toBe('right')
    expect(h.targetHandle).toBe('left')
  })

  it('keeps layout-assigned handles when pinnedSide is unset', () => {
    const e: RoutedEdge = {
      id: 'e1',
      source: 'a',
      target: 'b',
      sourceHandle: 'bottom',
      targetHandle: 'top',
    }
    const h = resolveEdgeHandles(e, src, tgt, { w: 100, h: 60 }, { w: 100, h: 60 })
    expect(h.sourceHandle).toBe('bottom')
    expect(h.targetHandle).toBe('top')
  })

  it('fills missing handles with facing sides only when floating', () => {
    const e: RoutedEdge = {
      id: 'e1',
      source: 'a',
      target: 'b',
      data: { pinnedSide: { source: false, target: false } },
    }
    const h = resolveEdgeHandles(e, src, tgt, { w: 100, h: 60 }, { w: 100, h: 60 })
    expect(h.sourceHandle).toBe('right')
    expect(h.targetHandle).toBe('left')
  })

  it('keeps pinned sides', () => {
    const e: RoutedEdge = {
      id: 'e1',
      source: 'a',
      target: 'b',
      sourceHandle: 'top',
      targetHandle: 'bottom',
      data: { pinnedSide: { source: true, target: true } },
    }
    const h = resolveEdgeHandles(e, src, tgt, { w: 100, h: 60 }, { w: 100, h: 60 })
    expect(h.sourceHandle).toBe('top')
    expect(h.targetHandle).toBe('bottom')
  })

  it('keeps decision branch chip handles', () => {
    const decision: SizedNode = {
      id: 'd',
      kind: 'decision',
      position: { x: 0, y: 0 },
      size: { w: 200, h: 100 },
      data: { branches: [{ id: 'yes' }, { id: 'no' }] },
    }
    const e: RoutedEdge = { id: 'e1', source: 'd', target: 'b', sourceHandle: 'yes' }
    const h = resolveEdgeHandles(e, decision, tgt, { w: 200, h: 100 }, { w: 100, h: 60 })
    expect(h.sourceHandle).toBe('yes')
  })
})

describe('applyElbowOffsets', () => {
  it('shifts a middle horizontal segment and snaps near-zero to auto', () => {
    const points = [
      { x: 0, y: 0 },
      { x: 0, y: 40 },
      { x: 100, y: 40 },
      { x: 100, y: 80 },
    ]
    const shifted = applyElbowOffsets(points, [20], 10)
    expect(shifted[1].y).toBe(60)
    expect(shifted[2].y).toBe(60)
    const snapped = applyElbowOffsets(points, [5], 10)
    expect(snapped[1].y).toBe(40)
  })
})
