import { describe, expect, it } from 'vitest'
import { createNodeOfKind } from './kinds'
import { remapEdgesForCollapsedGroups } from './collapsedEdges'

describe('remapEdgesForCollapsedGroups', () => {
  it('reroutes child edges to the collapsed group boundary', () => {
    const group = createNodeOfKind('group', { x: 0, y: 0 }, { id: 'g1' })
    const child = {
      ...createNodeOfKind('step', { x: 20, y: 40 }, { id: 'c1' }),
      parentId: 'g1',
    }
    const outside = createNodeOfKind('end', { x: 300, y: 40 }, { id: 'e1' })
    const edges = [
      { id: 'edge1', source: 'c1', target: 'e1', sourceHandle: 'bottom', targetHandle: 'top' },
      { id: 'edge2', source: 'c1', target: 'c1' },
    ]
    const remapped = remapEdgesForCollapsedGroups(edges, [group, child, outside], new Set(['g1']))
    expect(remapped).toHaveLength(1)
    expect(remapped[0].source).toBe('g1')
    expect(remapped[0].target).toBe('e1')
    expect(remapped[0].sourceHandle).toBe('bottom')
  })
})
