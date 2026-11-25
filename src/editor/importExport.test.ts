import { describe, expect, it } from 'vitest'
import { createEmptyDiagram } from '../schema'
import { createNodeOfKind } from './kinds'
import {
  exportDiagramJson,
  mergeImportedDiagram,
  parseImportedJson,
  stableStringify,
} from './importExport'

describe('importExport', () => {
  it('round trips a full diagram exactly after stable stringify', () => {
    const diagram = createEmptyDiagram('d_roundtrip', 'BNPL approval flow')
    diagram.description = 'Credit check then payout'
    diagram.nodes = [
      createNodeOfKind('start', { x: 0, y: 0 }, { id: 'n1', label: 'Start' }),
      createNodeOfKind('decision', { x: 100, y: 80 }, { id: 'n2', label: 'Approved?' }),
      createNodeOfKind('group', { x: 40, y: 200 }, { id: 'g1', label: 'Checks' }),
      {
        ...createNodeOfKind('integration', { x: 24, y: 40 }, { id: 'n3', label: 'Credit API' }),
        parentId: 'g1',
        icon: 'shield-check',
        color: '#2e6be6',
      },
      createNodeOfKind('end', { x: 280, y: 80 }, { id: 'n4', label: 'Done' }),
    ]
    diagram.edges = [
      { id: 'e1', source: 'n1', target: 'n2' },
      { id: 'e2', source: 'n2', target: 'n3', sourceHandle: 'yes', label: 'Yes', color: 'green' },
      { id: 'e3', source: 'n2', target: 'n4', sourceHandle: 'no', label: 'No', color: 'red' },
    ]

    const json = exportDiagramJson(diagram)
    const parsed = parseImportedJson(json, 'ignored')
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return

    expect(parsed.diagram).toEqual(diagram)
    expect(exportDiagramJson(parsed.diagram)).toBe(json)
  })

  it('imports a doc without id onto the current diagram id', () => {
    const diagram = createEmptyDiagram('d_keep', 'Original')
    diagram.nodes = [createNodeOfKind('step', { x: 10, y: 20 }, { id: 'n1', label: 'Review' })]
    const { id: _id, ...doc } = diagram
    const result = parseImportedJson(stableStringify(doc), 'd_current')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.source).toBe('doc')
    expect(result.diagram.id).toBe('d_current')
    expect(mergeImportedDiagram('d_current', result.diagram).id).toBe('d_current')
    expect(result.diagram.nodes).toHaveLength(1)
  })

  it('rejects invalid JSON and invalid diagrams', () => {
    expect(parseImportedJson('{', 'd1').ok).toBe(false)
    expect(parseImportedJson('{"title":"x"}', 'd1').ok).toBe(false)
    const bad = parseImportedJson(
      JSON.stringify({
        schemaVersion: 1,
        id: 'd1',
        title: 'Broken',
        nodes: [{ id: 'n1', kind: 'step', label: 'A', position: { x: 0, y: 0 } }],
        edges: [{ id: 'e1', source: 'n1', target: 'missing' }],
        groups: [],
        viewport: { x: 0, y: 0, zoom: 1 },
        theme: { palette: 'default' },
      }),
      'd1',
    )
    expect(bad.ok).toBe(false)
  })
})
