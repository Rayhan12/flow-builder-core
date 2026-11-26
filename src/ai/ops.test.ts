import { describe, expect, it } from 'vitest'
import { createEmptyDiagram } from '../schema'
import {
  applyOps,
  applyReplace,
  computeDiff,
  parseAiResponse,
  parseAiResponseText,
  previewFromResponse,
} from './ops'

describe('parseAiResponse', () => {
  it('accepts a message reply', () => {
    const result = parseAiResponse({ type: 'message', text: 'What kind of flow?' })
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value.type).toBe('message')
  })

  it('rejects invalid shapes', () => {
    const result = parseAiResponse({ type: 'ops', ops: [], summary: 'noop' })
    expect(result.ok).toBe(false)
  })

  it('parses fenced JSON text', () => {
    const result = parseAiResponseText('```json\n{"type":"message","text":"Hi"}\n```')
    expect(result.ok).toBe(true)
  })

  it('rejects non-JSON text', () => {
    const result = parseAiResponseText('Sure, here is a flow...')
    expect(result.ok).toBe(false)
  })
})

describe('applyOps', () => {
  it('adds a step and an edge', () => {
    const diagram = createEmptyDiagram('d1', 'Test')
    const withStart = applyOps(diagram, [
      {
        op: 'addNode',
        node: { id: 'n1', kind: 'start', label: 'Start', position: { x: 0, y: 0 } },
      },
      {
        op: 'addNode',
        node: { id: 'n2', kind: 'step', label: 'Review', position: { x: 0, y: 120 } },
      },
      {
        op: 'addEdge',
        edge: { id: 'e1', source: 'n1', target: 'n2' },
      },
      { op: 'setTitle', title: 'Review flow' },
    ])

    expect(withStart.ok).toBe(true)
    if (!withStart.ok) return
    expect(withStart.diagram.title).toBe('Review flow')
    expect(withStart.diagram.nodes).toHaveLength(2)
    expect(withStart.diagram.edges).toHaveLength(1)
    expect(withStart.diff.addedNodes).toEqual(['n1', 'n2'])
    expect(withStart.diff.addedEdges).toEqual(['e1'])
  })

  it('rejects ops that point at missing nodes', () => {
    const diagram = createEmptyDiagram('d1', 'Test')
    const result = applyOps(diagram, [
      { op: 'addEdge', edge: { source: 'missing', target: 'also' } },
    ])
    expect(result.ok).toBe(false)
  })

  it('removes a node and its edges', () => {
    const base = createEmptyDiagram('d1', 'Test')
    const built = applyOps(base, [
      { op: 'addNode', node: { id: 'n1', kind: 'start', label: 'Start' } },
      { op: 'addNode', node: { id: 'n2', kind: 'end', label: 'End' } },
      { op: 'addEdge', edge: { id: 'e1', source: 'n1', target: 'n2' } },
    ])
    expect(built.ok).toBe(true)
    if (!built.ok) return

    const removed = applyOps(built.diagram, [{ op: 'removeNode', id: 'n2' }])
    expect(removed.ok).toBe(true)
    if (!removed.ok) return
    expect(removed.diagram.nodes.map((n) => n.id)).toEqual(['n1'])
    expect(removed.diagram.edges).toHaveLength(0)
  })
})

describe('applyReplace', () => {
  it('builds a valid diagram from a replace payload', () => {
    const diagram = createEmptyDiagram('keep-id', 'Old')
    const result = applyReplace(
      diagram,
      {
        title: 'BNPL approval',
        nodes: [
          { id: 'n1', kind: 'start', label: 'Apply', position: { x: 0, y: 0 } },
          {
            id: 'n2',
            kind: 'decision',
            label: 'Credit ok?',
            position: { x: 0, y: 120 },
            data: {
              branches: [
                { id: 'yes', label: 'Yes' },
                { id: 'no', label: 'No' },
              ],
            },
          },
          { id: 'n3', kind: 'end', label: 'Approve', position: { x: 0, y: 240 } },
        ],
        edges: [
          { id: 'e1', source: 'n1', target: 'n2' },
          { id: 'e2', source: 'n2', target: 'n3', sourceHandle: 'yes', label: 'Yes' },
        ],
      },
      'Created BNPL flow',
    )

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.diagram.id).toBe('keep-id')
    expect(result.diagram.title).toBe('BNPL approval')
    expect(result.diagram.nodes).toHaveLength(3)
    expect(result.diff.addedNodes).toHaveLength(3)
  })

  it('fills defaults when decision data is missing', () => {
    const diagram = createEmptyDiagram('d1', 'Old')
    const result = applyReplace(
      diagram,
      {
        title: 'Simple',
        nodes: [{ id: 'n1', kind: 'decision', label: 'Check?' }],
        edges: [],
      },
      'One decision',
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const node = result.diagram.nodes[0]
    expect(node.kind).toBe('decision')
    if (node.kind === 'decision') {
      expect(node.data.branches.length).toBeGreaterThan(0)
    }
  })

  it('keeps edge style, markers, type and labelPosition through replace', () => {
    const diagram = createEmptyDiagram('d1', 'Old')
    const result = applyReplace(
      diagram,
      {
        title: 'Styled',
        nodes: [
          { id: 'a', kind: 'start', label: 'A' },
          { id: 'b', kind: 'end', label: 'B' },
        ],
        edges: [
          {
            id: 'e1',
            source: 'a',
            target: 'b',
            type: 'curved',
            label: 'go',
            labelPosition: 0.7,
            startMarker: 'circle',
            endMarker: 'diamond',
            style: { dash: 'dashed', width: 3 },
          },
        ],
      },
      'Styled edge',
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const edge = result.diagram.edges[0]
    expect(edge.style).toEqual({ dash: 'dashed', width: 3 })
    expect(edge.startMarker).toBe('circle')
    expect(edge.endMarker).toBe('diamond')
    expect(edge.type).toBe('curved')
    expect(edge.label).toBe('go')
    expect(edge.labelPosition).toBe(0.7)
  })
})

describe('applyOps edge style', () => {
  it('keeps style and markers on addEdge', () => {
    const diagram = createEmptyDiagram('d1', 'Test')
    const result = applyOps(diagram, [
      { op: 'addNode', node: { id: 'a', kind: 'start', label: 'A' } },
      { op: 'addNode', node: { id: 'b', kind: 'end', label: 'B' } },
      {
        op: 'addEdge',
        edge: {
          id: 'e1',
          source: 'a',
          target: 'b',
          type: 'elbow',
          startMarker: 'arrow',
          endMarker: 'diamond',
          style: { dash: 'dashed', width: 3 },
          labelPosition: 0.4,
        },
      },
    ])
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const edge = result.diagram.edges[0]
    expect(edge.style).toEqual({ dash: 'dashed', width: 3 })
    expect(edge.endMarker).toBe('diamond')
    expect(edge.labelPosition).toBe(0.4)
  })
})

describe('previewFromResponse', () => {
  it('returns message kind without changing the diagram', () => {
    const diagram = createEmptyDiagram('d1', 'Test')
    const preview = previewFromResponse(diagram, {
      type: 'message',
      text: 'Which product?',
    })
    expect(preview.ok).toBe(true)
    if (preview.ok) expect(preview.kind).toBe('message')
  })

  it('computes a diff for ops', () => {
    const diagram = createEmptyDiagram('d1', 'Test')
    const preview = previewFromResponse(diagram, {
      type: 'ops',
      summary: 'Added start',
      ops: [{ op: 'addNode', node: { id: 'n1', kind: 'start', label: 'Start' } }],
    })
    expect(preview.ok).toBe(true)
    if (!preview.ok || preview.kind !== 'change') return
    expect(preview.diff.summary).toBe('Added start')
    expect(preview.diff.addedNodes).toEqual(['n1'])
  })
})

describe('graph validation in applyOps', () => {
  it('returns graph_invalid when a parallelSplit has no join', () => {
    const diagram = createEmptyDiagram('d1', 'Test')
    const result = applyOps(diagram, [
      { op: 'addNode', node: { id: 'n1', kind: 'start', label: 'Start' } },
      { op: 'addNode', node: { id: 'n2', kind: 'parallelSplit', label: 'Split' } },
      { op: 'addNode', node: { id: 'n3', kind: 'step', label: 'A' } },
      { op: 'addEdge', edge: { id: 'e1', source: 'n1', target: 'n2' } },
      { op: 'addEdge', edge: { id: 'e2', source: 'n2', target: 'n3' } },
    ])
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.code).toBe('graph_invalid')
    expect(result.error).toMatch(/parallelSplit/)
  })
})

describe('computeDiff', () => {
  it('marks changed nodes when label updates', () => {
    const before = createEmptyDiagram('d1', 'T')
    const withNode = applyOps(before, [
      { op: 'addNode', node: { id: 'n1', kind: 'step', label: 'A' } },
    ])
    expect(withNode.ok).toBe(true)
    if (!withNode.ok) return
    const after = applyOps(withNode.diagram, [
      { op: 'updateNode', id: 'n1', patch: { label: 'B' } },
    ])
    expect(after.ok).toBe(true)
    if (!after.ok) return
    const diff = computeDiff(withNode.diagram, after.diagram, 'rename')
    expect(diff.changedNodes).toEqual(['n1'])
  })
})
