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

  it('adds decision edges with branch colour (chip names the branch; no duplicate label)', () => {
    useEditorStore.getState().load(createEmptyDiagram('d1'), 0)
    const decisionId = useEditorStore.getState().addNode('decision', { x: 0, y: 0 })!
    const endId = useEditorStore.getState().addNode('end', { x: 0, y: 120 })!

    useEditorStore.getState().addEdgeFromConnection({
      source: decisionId,
      target: endId,
      sourceHandle: 'yes',
    })

    const edge = useEditorStore.getState().diagram?.edges[0]
    expect(edge?.label).toBeUndefined()
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

  describe('group, ungroup and paste in place', () => {
    function setup() {
      useEditorStore.getState().load(createEmptyDiagram('d1'), 0)
      const a = useEditorStore.getState().addNode('step', { x: 100, y: 200 })!
      const b = useEditorStore.getState().addNode('end', { x: 500, y: 320 })!
      return { a, b }
    }

    it('groups selected nodes into a padded group with relative children', () => {
      const { a, b } = setup()
      useEditorStore.getState().setSelection([a, b], [])
      const groupId = useEditorStore.getState().groupSelection()
      expect(groupId).toBeTruthy()

      const d = useEditorStore.getState().diagram!
      const group = d.nodes.find((n) => n.id === groupId)!
      expect(group.kind).toBe('group')
      expect(group.position).toEqual({ x: 76, y: 132 })
      // 100..676 wide (end is 176 wide) plus padding; 200..384 tall plus padding and header.
      expect(group.size).toEqual({ w: 576 + 48, h: 184 + 48 + 44 })

      const step = d.nodes.find((n) => n.id === a)!
      expect(step.parentId).toBe(groupId)
      expect(step.position).toEqual({ x: 24, y: 24 + 44 })
      expect(useEditorStore.getState().selectedNodeIds).toEqual([groupId])
      // Parent comes before children.
      expect(d.nodes.findIndex((n) => n.id === groupId)).toBeLessThan(
        d.nodes.findIndex((n) => n.id === a),
      )

      useEditorStore.getState().undo()
      expect(useEditorStore.getState().diagram!.nodes.some((n) => n.kind === 'group')).toBe(false)
    })

    it('does not group locked nodes and returns null for empty selection', () => {
      const { a } = setup()
      useEditorStore.getState().clearSelection()
      expect(useEditorStore.getState().groupSelection()).toBeNull()
      useEditorStore.getState().toggleLocked([a])
      useEditorStore.getState().setSelection([a], [])
      expect(useEditorStore.getState().groupSelection()).toBeNull()
    })

    it('skips nodes already inside a selected container when grouping', () => {
      const { a, b } = setup()
      useEditorStore.getState().setSelection([a, b], [])
      const inner = useEditorStore.getState().groupSelection()!
      useEditorStore.getState().setSelection([inner, a], [])
      const outer = useEditorStore.getState().groupSelection()!
      const d = useEditorStore.getState().diagram!
      expect(d.nodes.find((n) => n.id === outer)!.parentId).toBeUndefined()
      expect(d.nodes.find((n) => n.id === inner)!.parentId).toBe(outer)
      expect(d.nodes.find((n) => n.id === a)!.parentId).toBe(inner)
    })

    it('ungroups a container back to absolute positions', () => {
      const { a, b } = setup()
      useEditorStore.getState().setSelection([a, b], [])
      const groupId = useEditorStore.getState().groupSelection()!
      expect(useEditorStore.getState().ungroupSelection()).toBe(true)

      const d = useEditorStore.getState().diagram!
      expect(d.nodes.some((n) => n.id === groupId)).toBe(false)
      const step = d.nodes.find((n) => n.id === a)!
      expect(step.parentId).toBeUndefined()
      expect(step.position).toEqual({ x: 100, y: 200 })
      expect(d.nodes.find((n) => n.id === b)!.position).toEqual({ x: 500, y: 320 })
      expect(useEditorStore.getState().selectedNodeIds.sort()).toEqual([a, b].sort())
    })

    it('ungroups via a selected child when no container is selected', () => {
      const { a, b } = setup()
      useEditorStore.getState().setSelection([a, b], [])
      const groupId = useEditorStore.getState().groupSelection()!
      useEditorStore.getState().setSelection([a], [])
      expect(useEditorStore.getState().ungroupSelection()).toBe(true)
      expect(useEditorStore.getState().diagram!.nodes.some((n) => n.id === groupId)).toBe(false)
    })

    it('pastes in place with new ids at identical positions', () => {
      const { a, b } = setup()
      useEditorStore.getState().addEdgeFromConnection({ source: a, target: b })
      useEditorStore.getState().setSelection([a, b], [])
      useEditorStore.getState().copySelection()
      expect(useEditorStore.getState().pasteClipboardInPlace()).toBe(true)

      const d = useEditorStore.getState().diagram!
      expect(d.nodes).toHaveLength(4)
      expect(d.edges).toHaveLength(2)
      const pasted = useEditorStore.getState().selectedNodeIds
      expect(pasted).toHaveLength(2)
      expect(pasted.includes(a)).toBe(false)
      const pastedNodes = d.nodes.filter((n) => pasted.includes(n.id))
      expect(pastedNodes.map((n) => n.position)).toEqual(
        expect.arrayContaining([
          { x: 100, y: 200 },
          { x: 500, y: 320 },
        ]),
      )
    })

    it('renames nodes and keeps group data label in sync', () => {
      const { a, b } = setup()
      useEditorStore.getState().renameNode(a, 'Check ID')
      expect(useEditorStore.getState().diagram!.nodes.find((n) => n.id === a)!.label).toBe('Check ID')
      useEditorStore.getState().setSelection([a, b], [])
      const groupId = useEditorStore.getState().groupSelection()!
      useEditorStore.getState().renameNode(groupId, 'Intake')
      const group = useEditorStore.getState().diagram!.nodes.find((n) => n.id === groupId)!
      expect(group.label).toBe('Intake')
      expect(group.kind === 'group' && group.data.label).toBe('Intake')
    })

    it('reorders layers by sibling and into containers', () => {
      const { a, b } = setup()
      const c = useEditorStore.getState().addNode('step', { x: 0, y: 0 })!
      // Move c above b (list shows front first, so "before" b means higher z).
      expect(useEditorStore.getState().reorderLayer(c, b, 'before')).toBe(true)
      let nodes = useEditorStore.getState().diagram!.nodes
      const z = (id: string) => nodes.find((n) => n.id === id)!.zIndex!
      expect(z(c)).toBeGreaterThan(z(b))
      expect(z(b)).toBeGreaterThan(z(a))

      const g = useEditorStore.getState().addNode('group', { x: 1000, y: 1000 })!
      expect(useEditorStore.getState().reorderLayer(a, g, 'inside')).toBe(true)
      nodes = useEditorStore.getState().diagram!.nodes
      const moved = nodes.find((n) => n.id === a)!
      expect(moved.parentId).toBe(g)
      expect(moved.position).toEqual({ x: -900, y: -800 })

      expect(useEditorStore.getState().reorderLayer(g, a, 'inside')).toBe(false)
      expect(useEditorStore.getState().reorderLayer(a, a, 'after')).toBe(false)
    })
  })
})
