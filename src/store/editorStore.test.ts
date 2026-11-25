import { beforeEach, describe, expect, it } from 'vitest'
import { createEmptyDiagram } from '../schema'
import { useEditorStore } from './editorStore'

describe('editorStore', () => {
  beforeEach(() => {
    useEditorStore.getState().reset()
  })

  it('loads a diagram and supports undo redo for node edits', () => {
    const diagram = createEmptyDiagram('d1', 'Test flow')
    useEditorStore.getState().load(diagram, 0)

    const id = useEditorStore.getState().addNode('step', { x: 10, y: 20 })
    expect(id).toBeTruthy()
    expect(useEditorStore.getState().diagram?.nodes).toHaveLength(1)
    expect(useEditorStore.getState().saveStatus).toBe('dirty')

    useEditorStore.getState().updateNode(id!, { label: 'Review' })
    expect(useEditorStore.getState().diagram?.nodes[0]?.label).toBe('Review')

    useEditorStore.getState().undo()
    expect(useEditorStore.getState().diagram?.nodes[0]?.label).toBe('Step')

    useEditorStore.getState().redo()
    expect(useEditorStore.getState().diagram?.nodes[0]?.label).toBe('Review')

    useEditorStore.getState().undo()
    useEditorStore.getState().undo()
    expect(useEditorStore.getState().diagram?.nodes).toHaveLength(0)
  })

  it('adds decision edges with branch labels', () => {
    useEditorStore.getState().load(createEmptyDiagram('d1'), 0)
    const decisionId = useEditorStore.getState().addNode('decision', { x: 0, y: 0 })!
    const endId = useEditorStore.getState().addNode('end', { x: 0, y: 120 })!

    useEditorStore.getState().addEdgeFromConnection({
      source: decisionId,
      target: endId,
      sourceHandle: 'yes',
    })

    const edge = useEditorStore.getState().diagram?.edges[0]
    expect(edge?.label).toBe('Yes')
    expect(edge?.color).toBe('green')
    expect(edge?.sourceHandle).toBe('yes')
  })

  it('removes connected edges when nodes are deleted', () => {
    useEditorStore.getState().load(createEmptyDiagram('d1'), 0)
    const a = useEditorStore.getState().addNode('start', { x: 0, y: 0 })!
    const b = useEditorStore.getState().addNode('end', { x: 0, y: 100 })!
    useEditorStore.getState().addEdgeFromConnection({ source: a, target: b })
    expect(useEditorStore.getState().diagram?.edges).toHaveLength(1)

    useEditorStore.getState().removeNodes([a])
    expect(useEditorStore.getState().diagram?.nodes).toHaveLength(1)
    expect(useEditorStore.getState().diagram?.edges).toHaveLength(0)
  })
})
