import { describe, expect, it } from 'vitest'
import { createNodeOfKind } from './kinds'
import { autoLayoutDiagram } from './layout'

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
})
