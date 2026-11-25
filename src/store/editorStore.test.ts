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

  it('nests a node in a group with relative position', () => {
    useEditorStore.getState().load(createEmptyDiagram('d1'), 0)
    const groupId = useEditorStore.getState().addNode('group', { x: 100, y: 50 })!
    const stepId = useEditorStore.getState().addNode('step', { x: 140, y: 90 })!

    useEditorStore.getState().setNodeParent(stepId, groupId, { x: 140, y: 90 })
    const step = useEditorStore.getState().diagram?.nodes.find((n) => n.id === stepId)
    expect(step?.parentId).toBe(groupId)
    expect(step?.position).toEqual({ x: 40, y: 40 })

    useEditorStore.getState().setNodeParent(stepId, undefined, { x: 200, y: 120 })
    const detached = useEditorStore.getState().diagram?.nodes.find((n) => n.id === stepId)
    expect(detached?.parentId).toBeUndefined()
    expect(detached?.position).toEqual({ x: 200, y: 120 })
  })

  it('replaces diagram content on import while keeping id', () => {
    useEditorStore.getState().load(createEmptyDiagram('d_keep', 'Old'), 3)
    useEditorStore.getState().addNode('step', { x: 0, y: 0 })

    useEditorStore.getState().replaceDiagramContent({
      ...createEmptyDiagram('d_imported', 'Imported flow'),
      nodes: [],
      edges: [],
    })

    const d = useEditorStore.getState().diagram
    expect(d?.id).toBe('d_keep')
    expect(d?.title).toBe('Imported flow')
    expect(d?.nodes).toHaveLength(0)
    expect(useEditorStore.getState().saveStatus).toBe('dirty')
  })

  it('inserts a node on an edge and splits the connection', () => {
    useEditorStore.getState().load(createEmptyDiagram('d1'), 0)
    const a = useEditorStore.getState().addNode('start', { x: 0, y: 0 })!
    const b = useEditorStore.getState().addNode('end', { x: 0, y: 160 })!
    useEditorStore.getState().addEdgeFromConnection({ source: a, target: b })
    const edgeId = useEditorStore.getState().diagram!.edges[0]!.id

    const midId = useEditorStore.getState().insertNodeOnEdge(edgeId, 'step')
    expect(midId).toBeTruthy()

    const d = useEditorStore.getState().diagram!
    expect(d.nodes).toHaveLength(3)
    expect(d.edges).toHaveLength(2)
    expect(d.edges.some((e) => e.id === edgeId)).toBe(false)
    expect(d.edges.some((e) => e.source === a && e.target === midId)).toBe(true)
    expect(d.edges.some((e) => e.source === midId && e.target === b)).toBe(true)
    expect(useEditorStore.getState().selectedNodeIds).toEqual([midId])
  })

  it('copies, pastes and duplicates selected nodes with new ids', () => {
    useEditorStore.getState().load(createEmptyDiagram('d1'), 0)
    const a = useEditorStore.getState().addNode('step', { x: 10, y: 20 })!
    const b = useEditorStore.getState().addNode('end', { x: 10, y: 140 })!
    useEditorStore.getState().addEdgeFromConnection({ source: a, target: b })
    useEditorStore.getState().setSelection([a, b], [])

    expect(useEditorStore.getState().copySelection()).toBe(true)
    expect(useEditorStore.getState().pasteClipboard()).toBe(true)

    const afterPaste = useEditorStore.getState().diagram!
    expect(afterPaste.nodes).toHaveLength(4)
    expect(afterPaste.edges).toHaveLength(2)
    const pastedIds = useEditorStore.getState().selectedNodeIds
    expect(pastedIds).toHaveLength(2)
    expect(pastedIds.includes(a)).toBe(false)

    useEditorStore.getState().setSelection([a], [])
    expect(useEditorStore.getState().duplicateSelection()).toBe(true)
    expect(useEditorStore.getState().diagram?.nodes).toHaveLength(5)
  })
})
