import { describe, expect, it } from 'vitest'
import {
  CURRENT_SCHEMA_VERSION,
  createEmptyDiagram,
  createEmptyDiagramDoc,
  DiagramDocSchema,
  parseDiagram,
  parseDiagramDoc,
} from './diagram'
import { migrateDiagramDoc, migrations } from './migrations'

const validDoc = {
  schemaVersion: 1 as const,
  title: 'BNPL approval flow',
  description: 'optional',
  nodes: [
    {
      id: 'n1',
      kind: 'start' as const,
      label: 'Customer applies',
      icon: 'user',
      color: 'green',
      position: { x: 0, y: 0 },
    },
    {
      id: 'n2',
      kind: 'decision' as const,
      label: 'Credit OK?',
      color: 'amber',
      position: { x: 0, y: 120 },
      data: {
        branches: [
          { id: 'yes', label: 'Yes', color: 'green' },
          { id: 'no', label: 'No', color: 'red' },
        ],
      },
    },
    {
      id: 'n3',
      kind: 'integration' as const,
      label: 'Credit check',
      color: 'blue',
      position: { x: 200, y: 120 },
      data: {
        service: 'credit-bureau',
        method: 'POST',
        endpoint: '/check',
      },
    },
  ],
  edges: [
    {
      id: 'e1',
      source: 'n1',
      target: 'n2',
    },
    {
      id: 'e2',
      source: 'n2',
      target: 'n3',
      sourceHandle: 'yes',
      label: 'Yes',
      color: 'green',
    },
  ],
  groups: [],
  viewport: { x: 0, y: 0, zoom: 1 },
  theme: { palette: 'default' },
}

describe('diagram schema v1', () => {
  it('parses a valid diagram doc', () => {
    const doc = parseDiagramDoc(validDoc)
    expect(doc.schemaVersion).toBe(CURRENT_SCHEMA_VERSION)
    expect(doc.nodes).toHaveLength(3)
    expect(doc.edges).toHaveLength(2)
  })

  it('parses a full diagram with id', () => {
    const diagram = parseDiagram({ ...validDoc, id: 'd_abc123' })
    expect(diagram.id).toBe('d_abc123')
    expect(diagram.title).toBe('BNPL approval flow')
  })

  it('creates an empty diagram', () => {
    const diagram = createEmptyDiagram('d_empty', 'Untitled diagram')
    expect(diagram.nodes).toEqual([])
    expect(diagram.edges).toEqual([])
    expect(diagram.schemaVersion).toBe(1)
  })

  it('rejects duplicate node ids', () => {
    const result = DiagramDocSchema.safeParse({
      ...validDoc,
      nodes: [
        validDoc.nodes[0],
        { ...validDoc.nodes[0], id: 'n1', kind: 'end', label: 'Done' },
      ],
      edges: [],
    })
    expect(result.success).toBe(false)
  })

  it('rejects edges that point at missing nodes', () => {
    const result = DiagramDocSchema.safeParse({
      ...validDoc,
      edges: [{ id: 'e-bad', source: 'n1', target: 'missing' }],
    })
    expect(result.success).toBe(false)
  })

  it('rejects titles over 200 characters', () => {
    const result = DiagramDocSchema.safeParse({
      ...createEmptyDiagramDoc(),
      title: 'x'.repeat(201),
    })
    expect(result.success).toBe(false)
  })

  it('rejects more than 2000 nodes', () => {
    const nodes = Array.from({ length: 2001 }, (_, i) => ({
      id: `n${i}`,
      kind: 'note' as const,
      label: `N${i}`,
      position: { x: 0, y: i },
      data: { text: 'x' },
    }))
    const result = DiagramDocSchema.safeParse({
      ...createEmptyDiagramDoc(),
      nodes,
    })
    expect(result.success).toBe(false)
  })
})

describe('migrateDiagramDoc', () => {
  it('returns a parsed v1 doc unchanged', () => {
    const migrated = migrateDiagramDoc(validDoc)
    expect(migrated.schemaVersion).toBe(1)
    expect(migrated.title).toBe(validDoc.title)
  })

  it('throws when schemaVersion is missing', () => {
    expect(() => migrateDiagramDoc({ title: 'x', nodes: [], edges: [] })).toThrow(
      /schemaVersion/,
    )
  })

  it('throws when the doc is newer than the app', () => {
    expect(() =>
      migrateDiagramDoc({ ...validDoc, schemaVersion: CURRENT_SCHEMA_VERSION + 1 }),
    ).toThrow(/newer/)
  })

  it('exposes an empty migrations map while only v1 exists', () => {
    expect(Object.keys(migrations)).toEqual([])
  })
})
