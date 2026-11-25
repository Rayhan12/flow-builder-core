import { beforeEach, describe, expect, it } from 'vitest'
import { createEmptyDiagram } from '../schema'
import { useEditorStore } from './editorStore'

describe('editorStore selection and visibility', () => {
  beforeEach(() => {
    useEditorStore.getState().reset()
    useEditorStore.getState().load(createEmptyDiagram('d1', 'Test'), 1)
  })

  it('keeps selection bound to setSelection for any node', () => {
    const a = useEditorStore.getState().addNode('step', { x: 0, y: 0 })!
    const b = useEditorStore.getState().addNode('decision', { x: 100, y: 0 })!
    expect(useEditorStore.getState().selectedNodeIds).toEqual([b])

    useEditorStore.getState().setSelection([a], [])
    expect(useEditorStore.getState().selectedNodeIds).toEqual([a])

    useEditorStore.getState().updateNodes([a], { label: 'Renamed' })
    expect(useEditorStore.getState().diagram?.nodes.find((n) => n.id === a)?.label).toBe(
      'Renamed',
    )
  })

  it('applies multi-select patches to all selected nodes', () => {
    const a = useEditorStore.getState().addNode('step', { x: 0, y: 0 })!
    const b = useEditorStore.getState().addNode('step', { x: 40, y: 0 })!
    useEditorStore.getState().setSelection([a, b], [])
    useEditorStore.getState().updateNodes([a, b], { color: 'blue', icon: 'user' })
    const nodes = useEditorStore.getState().diagram!.nodes.filter((n) =>
      [a, b].includes(n.id),
    )
    expect(nodes.every((n) => n.color === 'blue' && n.icon === 'user')).toBe(true)
  })

  it('hides nodes and showAllHidden restores them', () => {
    const a = useEditorStore.getState().addNode('step', { x: 0, y: 0 })!
    useEditorStore.getState().toggleHidden([a])
    expect(useEditorStore.getState().diagram?.nodes.find((n) => n.id === a)?.hidden).toBe(
      true,
    )
    useEditorStore.getState().showAllHidden()
    expect(useEditorStore.getState().diagram?.nodes.find((n) => n.id === a)?.hidden).toBeFalsy()
  })

  it('parents and unparents while keeping absolute position', () => {
    const g = useEditorStore.getState().addNode('group', { x: 100, y: 100 })!
    const n = useEditorStore.getState().addNode('step', { x: 140, y: 160 })!
    useEditorStore.getState().setNodeParent(n, g, { x: 140, y: 160 })
    const nested = useEditorStore.getState().diagram!.nodes.find((node) => node.id === n)!
    expect(nested.parentId).toBe(g)
    expect(nested.position).toEqual({ x: 40, y: 60 })

    useEditorStore.getState().setNodeParent(n, undefined, { x: 140, y: 160 })
    const freed = useEditorStore.getState().diagram!.nodes.find((node) => node.id === n)!
    expect(freed.parentId).toBeUndefined()
    expect(freed.position).toEqual({ x: 140, y: 160 })
  })

  it('reorders z-index for selected nodes', () => {
    const a = useEditorStore.getState().addNode('step', { x: 0, y: 0 })!
    const b = useEditorStore.getState().addNode('step', { x: 20, y: 0 })!
    useEditorStore.getState().reorderZ([a], 'front')
    const nodes = useEditorStore.getState().diagram!.nodes
    const za = nodes.find((n) => n.id === a)!.zIndex!
    const zb = nodes.find((n) => n.id === b)!.zIndex!
    expect(za).toBeGreaterThan(zb)
  })

  it('selectSimilar selects all nodes of the same kind', () => {
    const a = useEditorStore.getState().addNode('step', { x: 0, y: 0 })!
    useEditorStore.getState().addNode('step', { x: 40, y: 0 })
    useEditorStore.getState().addNode('decision', { x: 80, y: 0 })
    useEditorStore.getState().setSelection([a], [])
    expect(useEditorStore.getState().selectSimilar()).toBe(true)
    expect(useEditorStore.getState().selectedNodeIds).toHaveLength(2)
  })
})
