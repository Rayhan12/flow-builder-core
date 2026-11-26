import { describe, expect, it } from 'vitest'
import { hasOverlappingNodes } from '../../shared/layout/index.ts'
import { createNodeOfKind } from './kinds'
import { autoLayoutDiagram, layoutDiagram, placeNodesIncremental } from './layout'

describe('autoLayoutDiagram', () => {
  it('places connected nodes with distinct positions', async () => {
    const nodes = [
      createNodeOfKind('start', { x: 0, y: 0 }, { id: 'n1' }),
      createNodeOfKind('step', { x: 0, y: 0 }, { id: 'n2' }),
      createNodeOfKind('end', { x: 0, y: 0 }, { id: 'n3' }),
    ]
    const edges = [
      { id: 'e1', source: 'n1', target: 'n2' },
      { id: 'e2', source: 'n2', target: 'n3' },
    ]

    const laidOut = await autoLayoutDiagram(nodes, edges, 'DOWN')
    expect(laidOut).toHaveLength(3)

    const positions = laidOut.map((n) => `${n.position.x},${n.position.y}`)
    expect(new Set(positions).size).toBe(3)

    const byId = Object.fromEntries(laidOut.map((n) => [n.id, n]))
    expect(byId.n2.position.y).toBeGreaterThan(byId.n1.position.y)
    expect(byId.n3.position.y).toBeGreaterThan(byId.n2.position.y)
  })

  it('layouts children inside a group and grows the group', async () => {
    const group = createNodeOfKind('group', { x: 0, y: 0 }, { id: 'g1', label: 'Segment' })
    const childA = {
      ...createNodeOfKind('step', { x: 0, y: 0 }, { id: 'a' }),
      parentId: 'g1',
    }
    const childB = {
      ...createNodeOfKind('step', { x: 0, y: 0 }, { id: 'b' }),
      parentId: 'g1',
    }
    const laidOut = await autoLayoutDiagram(
      [group, childA, childB],
      [{ id: 'e1', source: 'a', target: 'b' }],
      'DOWN',
    )
    const g = laidOut.find((n) => n.id === 'g1')!
    const a = laidOut.find((n) => n.id === 'a')!
    const b = laidOut.find((n) => n.id === 'b')!
    expect(a.parentId).toBe('g1')
    expect(b.parentId).toBe('g1')
    expect(`${a.position.x},${a.position.y}`).not.toBe(`${b.position.x},${b.position.y}`)
    expect(g.size?.w).toBeGreaterThan(200)
    expect(g.size?.h).toBeGreaterThan(100)
  })

  it('layoutDiagram returns orthogonal waypoints for branching edges', async () => {
    const decision = createNodeOfKind('decision', { x: 0, y: 0 }, { id: 'd1' })
    const yes = createNodeOfKind('step', { x: 0, y: 0 }, { id: 'yes' })
    const no = createNodeOfKind('step', { x: 0, y: 0 }, { id: 'no' })
    const result = await layoutDiagram(
      [decision, yes, no],
      [
        { id: 'e1', source: 'd1', target: 'yes', sourceHandle: 'yes' },
        { id: 'e2', source: 'd1', target: 'no', sourceHandle: 'no' },
      ],
      'DOWN',
    )
    expect(hasOverlappingNodes(result.nodes)).toBe(false)
    const byId = Object.fromEntries(result.nodes.map((n) => [n.id, n]))
    expect(byId.yes.position.x).toBeLessThan(byId.no.position.x)
  })

  it('incremental place keeps existing nodes fixed (new node seeks free spot)', () => {
    const a = createNodeOfKind('start', { x: 0, y: 0 }, { id: 'a' })
    const b = {
      ...createNodeOfKind('step', { x: 40, y: 180 }, { id: 'b' }),
      manuallyPositioned: true as const,
    }
    const c = createNodeOfKind('step', { x: 40, y: 180 }, { id: 'c' })
    const edges = [
      { id: 'e1', source: 'a', target: 'b' },
      { id: 'e2', source: 'b', target: 'c' },
    ]
    const beforeA = { ...a.position }
    const result = placeNodesIncremental([a, b, c], edges, ['c'], 'DOWN')
    const byId = Object.fromEntries(result.nodes.map((n) => [n.id, n]))
    expect(byId.a.position).toEqual(beforeA)
    expect(byId.b.position).toEqual({ x: 40, y: 180 })
    expect(byId.c.position.y).toBeGreaterThan(byId.b.position.y)
  })

  it('lays out dozens of nodes quickly on the main thread (worker used above threshold in browser)', async () => {
    const nodes = Array.from({ length: 40 }, (_, i) =>
      createNodeOfKind(i === 0 ? 'start' : i === 39 ? 'end' : 'step', { x: 0, y: 0 }, { id: `n${i}` }),
    )
    const edges = nodes.slice(0, -1).map((n, i) => ({
      id: `e${i}`,
      source: n.id,
      target: nodes[i + 1].id,
    }))
    const start = performance.now()
    const result = await layoutDiagram(nodes, edges, 'DOWN')
    expect(result.nodes).toHaveLength(40)
    expect(hasOverlappingNodes(result.nodes)).toBe(false)
    expect(performance.now() - start).toBeLessThan(8_000)
  })
})
