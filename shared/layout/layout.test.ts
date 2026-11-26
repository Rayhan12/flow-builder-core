import { describe, expect, it } from 'vitest'
import {
  hasOverlappingNodes,
  layoutDiagram,
  nodeBoundingBoxes,
  placeNodesIncremental,
} from './index.ts'
import type { LayoutEdgeLike, LayoutNodeLike } from './types.ts'

function node(
  id: string,
  kind: string,
  position = { x: 0, y: 0 },
  extra: Partial<LayoutNodeLike> = {},
): LayoutNodeLike {
  return {
    id,
    kind,
    label: id,
    position,
    ...extra,
  }
}

function edge(
  id: string,
  source: string,
  target: string,
  sourceHandle?: string,
): LayoutEdgeLike {
  return { id, source, target, sourceHandle }
}

/** 15+ node branching flow: decision(3), switch(4), loop, parallel split/join. */
function buildBranchingFlow(): { nodes: LayoutNodeLike[]; edges: LayoutEdgeLike[] } {
  const decisionBranches = [
    { id: 'yes', label: 'Yes' },
    { id: 'no', label: 'No' },
    { id: 'maybe', label: 'Maybe' },
  ]
  const switchBranches = [
    { id: 'a', label: 'Alpha' },
    { id: 'b', label: 'Beta' },
    { id: 'c', label: 'Gamma' },
    { id: 'd', label: 'Delta' },
  ]

  const nodes: LayoutNodeLike[] = [
    node('n1', 'start', { x: 10, y: 10 }),
    node('n2', 'step', { x: 10, y: 10 }),
    node('n3', 'decision', { x: 10, y: 10 }, { data: { branches: decisionBranches } }),
    node('n4', 'step', { x: 10, y: 10 }, { label: 'Yes path' }),
    node('n5', 'step', { x: 10, y: 10 }, { label: 'No path' }),
    node('n6', 'step', { x: 10, y: 10 }, { label: 'Maybe path' }),
    node('n7', 'parallelSplit', { x: 10, y: 10 }),
    node('n8', 'step', { x: 10, y: 10 }, { label: 'Parallel A' }),
    node('n9', 'step', { x: 10, y: 10 }, { label: 'Parallel B' }),
    node('n10', 'parallelJoin', { x: 10, y: 10 }),
    node('n11', 'switch', { x: 10, y: 10 }, { data: { branches: switchBranches, mode: 'switch' } }),
    node('n12', 'step', { x: 10, y: 10 }, { label: 'Alpha' }),
    node('n13', 'step', { x: 10, y: 10 }, { label: 'Beta' }),
    node('n14', 'step', { x: 10, y: 10 }, { label: 'Gamma' }),
    node('n15', 'step', { x: 10, y: 10 }, { label: 'Delta' }),
    node('n16', 'loop', { x: 10, y: 10 }),
    node('n17', 'step', { x: 10, y: 10 }, { label: 'Loop body' }),
    node('n18', 'end', { x: 10, y: 10 }),
    node('sticky1', 'sticky', { x: 10, y: 10 }, { label: 'Note' }),
  ]

  const edges: LayoutEdgeLike[] = [
    edge('e1', 'n1', 'n2'),
    edge('e2', 'n2', 'n3'),
    edge('e3', 'n3', 'n4', 'yes'),
    edge('e4', 'n3', 'n5', 'no'),
    edge('e5', 'n3', 'n6', 'maybe'),
    edge('e6', 'n4', 'n7'),
    edge('e7', 'n5', 'n7'),
    edge('e8', 'n6', 'n7'),
    edge('e9', 'n7', 'n8'),
    edge('e10', 'n7', 'n9'),
    edge('e11', 'n8', 'n10'),
    edge('e12', 'n9', 'n10'),
    edge('e13', 'n10', 'n11'),
    edge('e14', 'n11', 'n12', 'a'),
    edge('e15', 'n11', 'n13', 'b'),
    edge('e16', 'n11', 'n14', 'c'),
    edge('e17', 'n11', 'n15', 'd'),
    edge('e18', 'n12', 'n16'),
    edge('e19', 'n13', 'n16'),
    edge('e20', 'n14', 'n16'),
    edge('e21', 'n15', 'n16'),
    edge('e22', 'n16', 'n17'),
    edge('e23', 'n17', 'n16'),
    edge('e24', 'n16', 'n18'),
  ]

  return { nodes, edges }
}

describe('layoutDiagram', () => {
  it('lays out a 15+ node branching flow with no overlaps', async () => {
    const { nodes, edges } = buildBranchingFlow()
    const result = await layoutDiagram(nodes, edges, { direction: 'DOWN' })
    expect(result.nodes.length).toBe(nodes.length)
    expect(hasOverlappingNodes(result.nodes)).toBe(false)

    const byId = Object.fromEntries(result.nodes.map((n) => [n.id, n]))
    expect(byId.n2.position.y).toBeGreaterThan(byId.n1.position.y)
    expect(byId.n3.position.y).toBeGreaterThan(byId.n2.position.y)
  })

  it('keeps decision branch targets left-to-right in chip order', async () => {
    const { nodes, edges } = buildBranchingFlow()
    const result = await layoutDiagram(nodes, edges, { direction: 'DOWN' })
    const byId = Object.fromEntries(result.nodes.map((n) => [n.id, n]))
    // yes / no / maybe should fan left → right
    expect(byId.n4.position.x).toBeLessThan(byId.n5.position.x)
    expect(byId.n5.position.x).toBeLessThan(byId.n6.position.x)
    // switch branches a–d
    expect(byId.n12.position.x).toBeLessThan(byId.n13.position.x)
    expect(byId.n13.position.x).toBeLessThan(byId.n14.position.x)
    expect(byId.n14.position.x).toBeLessThan(byId.n15.position.x)
  })

  it('produces orthogonal bend points on routed edges', async () => {
    const { nodes, edges } = buildBranchingFlow()
    const result = await layoutDiagram(nodes, edges, { direction: 'DOWN' })
    const withBends = result.edges.filter((e) => (e.waypoints?.length ?? 0) > 0)
    // Not every edge needs bends, but a branching flow should have some.
    expect(withBends.length).toBeGreaterThan(0)
    for (const e of withBends) {
      for (const wp of e.waypoints ?? []) {
        expect(Number.isFinite(wp.x)).toBe(true)
        expect(Number.isFinite(wp.y)).toBe(true)
      }
    }
  })

  it('layouts children inside a group', async () => {
    const nodes: LayoutNodeLike[] = [
      node('g1', 'group', { x: 0, y: 0 }, { size: { w: 360, h: 240 } }),
      { ...node('a', 'step', { x: 0, y: 0 }), parentId: 'g1' },
      { ...node('b', 'step', { x: 0, y: 0 }), parentId: 'g1' },
    ]
    const edges = [edge('e1', 'a', 'b')]
    const result = await layoutDiagram(nodes, edges, { direction: 'DOWN' })
    const a = result.nodes.find((n) => n.id === 'a')!
    const b = result.nodes.find((n) => n.id === 'b')!
    const g = result.nodes.find((n) => n.id === 'g1')!
    expect(a.parentId).toBe('g1')
    expect(b.position.y).toBeGreaterThan(a.position.y)
    expect(g.size?.w).toBeGreaterThan(200)
  })
})

describe('placeNodesIncremental', () => {
  it('never moves existing nodes (manual or not) when placing a new one', () => {
    const nodes: LayoutNodeLike[] = [
      node('a', 'start', { x: 0, y: 0 }),
      node('b', 'step', { x: 0, y: 200 }, { manuallyPositioned: true }),
      node('c', 'step', { x: 0, y: 200 }), // piled on b — new
    ]
    const edges = [edge('e1', 'a', 'b'), edge('e2', 'b', 'c')]
    const beforeA = { ...nodes[0].position }
    const beforeB = { ...nodes[1].position }
    const result = placeNodesIncremental(nodes, edges, ['c'], { direction: 'DOWN' })
    const byId = Object.fromEntries(result.nodes.map((n) => [n.id, n]))
    expect(byId.a.position).toEqual(beforeA)
    expect(byId.b.position.x).toBe(beforeB.x)
    expect(byId.b.position.y).toBe(beforeB.y)
    expect(byId.c.position.y).toBeGreaterThan(byId.b.position.y)
  })

  it('does not shift non-manual existing nodes to clear space', () => {
    const nodes: LayoutNodeLike[] = [
      node('a', 'step', { x: 0, y: 0 }),
      node('b', 'step', { x: 0, y: 120 }),
      node('c', 'step', { x: 50, y: 50 }), // new, near both
    ]
    const edges = [edge('e1', 'a', 'c')]
    const beforeA = { ...nodes[0].position }
    const beforeB = { ...nodes[1].position }
    const result = placeNodesIncremental(nodes, edges, ['c'], { direction: 'DOWN' })
    const byId = Object.fromEntries(result.nodes.map((n) => [n.id, n]))
    expect(byId.a.position).toEqual(beforeA)
    expect(byId.b.position).toEqual(beforeB)
  })

  it('places new nodes near the anchor', () => {
    const nodes: LayoutNodeLike[] = [
      node('a', 'step', { x: 100, y: 100 }),
      node('b', 'step', { x: 0, y: 0 }),
    ]
    const edges = [edge('e1', 'a', 'b')]
    const result = placeNodesIncremental(nodes, edges, ['b'], { direction: 'DOWN' })
    const byId = Object.fromEntries(result.nodes.map((n) => [n.id, n]))
    expect(byId.b.position.y).toBeGreaterThan(byId.a.position.y)
    expect(Math.abs(byId.b.position.x - byId.a.position.x)).toBeLessThan(400)
  })
})

describe('nodeBoundingBoxes', () => {
  it('returns boxes for top-level nodes', () => {
    const boxes = nodeBoundingBoxes([node('a', 'step', { x: 10, y: 20 })])
    expect(boxes).toHaveLength(1)
    expect(boxes[0].x).toBe(10)
    expect(boxes[0].y).toBe(20)
  })
})
