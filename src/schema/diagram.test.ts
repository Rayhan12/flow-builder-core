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
import { rulePreviewSentence, ensureRuleMatch } from './conditions'

const validDocV1 = {
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
    {
      id: 'n4',
      kind: 'rule' as const,
      label: 'Scorecard',
      color: 'indigo',
      position: { x: 0, y: 240 },
      data: {
        rules: [{ condition: 'credit score > 650', outcome: 'Approve', score: 10 }],
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

describe('diagram schema', () => {
  it('parses a valid diagram doc', () => {
    const doc = migrateDiagramDoc(validDocV1)
    expect(doc.schemaVersion).toBe(CURRENT_SCHEMA_VERSION)
    expect(doc.nodes).toHaveLength(4)
    expect(doc.edges).toHaveLength(2)
  })

  it('parses a full diagram with id', () => {
    const diagram = parseDiagram({ ...migrateDiagramDoc(validDocV1), id: 'd_abc123' })
    expect(diagram.id).toBe('d_abc123')
    expect(diagram.title).toBe('BNPL approval flow')
  })

  it('creates an empty diagram at current schema', () => {
    const diagram = createEmptyDiagram('d_empty', 'Untitled diagram')
    expect(diagram.nodes).toEqual([])
    expect(diagram.edges).toEqual([])
    expect(diagram.schemaVersion).toBe(CURRENT_SCHEMA_VERSION)
  })

  it('rejects duplicate node ids', () => {
    const base = createEmptyDiagramDoc()
    const result = DiagramDocSchema.safeParse({
      ...base,
      nodes: [
        {
          id: 'n1',
          kind: 'start',
          label: 'A',
          position: { x: 0, y: 0 },
        },
        {
          id: 'n1',
          kind: 'end',
          label: 'Done',
          position: { x: 0, y: 40 },
        },
      ],
      edges: [],
    })
    expect(result.success).toBe(false)
  })

  it('rejects edges that point at missing nodes', () => {
    const base = createEmptyDiagramDoc()
    const result = DiagramDocSchema.safeParse({
      ...base,
      nodes: [
        {
          id: 'n1',
          kind: 'start',
          label: 'A',
          position: { x: 0, y: 0 },
        },
      ],
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

  it('accepts hidden locked zIndex and edge style fields', () => {
    const doc = parseDiagramDoc({
      ...createEmptyDiagramDoc(),
      nodes: [
        {
          id: 'n1',
          kind: 'step',
          label: 'Hidden step',
          position: { x: 0, y: 0 },
          hidden: true,
          locked: true,
          zIndex: 3,
        },
      ],
      edges: [
        {
          id: 'e1',
          source: 'n1',
          target: 'n1',
          type: 'elbow',
          endMarker: 'diamond',
          style: { dash: 'dashed', width: 2 },
        },
      ],
    })
    expect(doc.nodes[0].hidden).toBe(true)
    expect(doc.edges[0].endMarker).toBe('diamond')
  })
})

describe('migrateDiagramDoc', () => {
  it('migrates v1 docs to current with structured rules and decision mode', () => {
    const migrated = migrateDiagramDoc(validDocV1)
    expect(migrated.schemaVersion).toBe(CURRENT_SCHEMA_VERSION)
    const rule = migrated.nodes.find((n) => n.kind === 'rule')
    expect(rule?.kind).toBe('rule')
    if (rule?.kind === 'rule') {
      const match = ensureRuleMatch(rule.data.rules[0])
      expect(match.groups[0].conditions[0].field).toContain('credit score')
      expect(rulePreviewSentence(match, rule.data.rules[0].outcome)).toMatch(/Approve/)
    }
    const decision = migrated.nodes.find((n) => n.kind === 'decision')
    if (decision?.kind === 'decision') {
      expect(decision.data.mode).toBe('branches')
    }
  })

  it('migrates v2 docs to v3', () => {
    const v2 = { ...migrateDiagramDoc(validDocV1), schemaVersion: 2 }
    // Force a v2 document by running only the first migration step.
    const fromV2 = migrations[2]({ ...validDocV1, schemaVersion: 2, nodes: v2.nodes, edges: v2.edges })
    expect(fromV2.schemaVersion).toBe(3)
    const migrated = migrateDiagramDoc({
      ...validDocV1,
      schemaVersion: 2,
      nodes: [
        ...validDocV1.nodes,
        {
          id: 'n5',
          kind: 'shape',
          label: 'Rect',
          position: { x: 0, y: 400 },
          data: { shape: 'rect', text: 'Hello' },
        },
      ],
    })
    expect(migrated.schemaVersion).toBe(3)
    expect(migrated.nodes.some((n) => n.kind === 'shape')).toBe(true)
  })

  it('accepts new v3 node kinds', () => {
    const doc = createEmptyDiagramDoc('Kinds')
    const withKinds = DiagramDocSchema.parse({
      ...doc,
      nodes: [
        {
          id: 'loop1',
          kind: 'loop',
          label: 'Loop',
          position: { x: 0, y: 0 },
          data: { collection: 'items' },
        },
        {
          id: 'db1',
          kind: 'database',
          label: 'DB',
          position: { x: 0, y: 100 },
          data: { operation: 'query', collection: 'users' },
        },
        {
          id: 'shape1',
          kind: 'shape',
          label: 'Hex',
          position: { x: 0, y: 200 },
          data: { shape: 'hexagon', text: 'Hex' },
        },
      ],
    })
    expect(withKinds.nodes).toHaveLength(3)
    expect(withKinds.nodes.map((n) => n.kind)).toEqual(['loop', 'database', 'shape'])
  })

  it('throws when schemaVersion is missing', () => {
    expect(() => migrateDiagramDoc({ title: 'x', nodes: [], edges: [] })).toThrow(
      /schemaVersion/,
    )
  })

  it('throws when the doc is newer than the app', () => {
    expect(() =>
      migrateDiagramDoc({ ...validDocV1, schemaVersion: CURRENT_SCHEMA_VERSION + 1 }),
    ).toThrow(/newer/)
  })

  it('exposes v1 to v2 and v2 to v3 migrations', () => {
    expect(Object.keys(migrations).sort()).toEqual(['1', '2'])
  })
})
