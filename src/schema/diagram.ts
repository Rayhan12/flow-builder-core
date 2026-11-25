import { z } from 'zod'

export const CURRENT_SCHEMA_VERSION = 1 as const

export const MAX_NODES = 2000
export const MAX_EDGES = 4000
export const MAX_LABEL_LENGTH = 200

const PositionSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
})

const SizeSchema = z.object({
  w: z.number().finite().positive(),
  h: z.number().finite().positive(),
})

export const NodeKindSchema = z.enum([
  'start',
  'end',
  'step',
  'decision',
  'mapping',
  'integration',
  'rule',
  'note',
  'group',
])

export type NodeKind = z.infer<typeof NodeKindSchema>

const BranchSchema = z.object({
  id: z.string().min(1),
  label: z.string().max(MAX_LABEL_LENGTH),
  condition: z.string().optional(),
  color: z.string().optional(),
})

const MappingRowSchema = z.object({
  from: z.string(),
  to: z.string(),
  transform: z.string().optional(),
})

const RuleRowSchema = z.object({
  condition: z.string(),
  outcome: z.string(),
  score: z.number().finite().optional(),
})

const NodeBaseSchema = z.object({
  id: z.string().min(1),
  label: z.string().max(MAX_LABEL_LENGTH),
  description: z.string().max(2000).optional(),
  icon: z.string().optional(),
  color: z.string().optional(),
  position: PositionSchema,
  size: SizeSchema.optional(),
  parentId: z.string().min(1).optional(),
})

export const DiagramNodeSchema = z.discriminatedUnion('kind', [
  NodeBaseSchema.extend({
    kind: z.literal('start'),
    data: z.object({}).optional(),
  }),
  NodeBaseSchema.extend({
    kind: z.literal('end'),
    data: z.object({}).optional(),
  }),
  NodeBaseSchema.extend({
    kind: z.literal('step'),
    data: z
      .object({
        owner: z.string().optional(),
        notes: z.string().optional(),
      })
      .optional(),
  }),
  NodeBaseSchema.extend({
    kind: z.literal('decision'),
    data: z.object({
      branches: z.array(BranchSchema).min(1),
    }),
  }),
  NodeBaseSchema.extend({
    kind: z.literal('mapping'),
    data: z.object({
      mappings: z.array(MappingRowSchema),
    }),
  }),
  NodeBaseSchema.extend({
    kind: z.literal('integration'),
    data: z.object({
      service: z.string().min(1),
      method: z.string().optional(),
      endpoint: z.string().optional(),
      inputs: z.array(z.string()).optional(),
      outputs: z.array(z.string()).optional(),
    }),
  }),
  NodeBaseSchema.extend({
    kind: z.literal('rule'),
    data: z.object({
      rules: z.array(RuleRowSchema),
      threshold: z.number().finite().optional(),
    }),
  }),
  NodeBaseSchema.extend({
    kind: z.literal('note'),
    data: z.object({
      text: z.string(),
    }),
  }),
  NodeBaseSchema.extend({
    kind: z.literal('group'),
    data: z.object({
      label: z.string().max(MAX_LABEL_LENGTH),
      color: z.string().optional(),
      collapsed: z.boolean().optional(),
    }),
  }),
])

export type DiagramNode = z.infer<typeof DiagramNodeSchema>

export const DiagramEdgeSchema = z.object({
  id: z.string().min(1),
  source: z.string().min(1),
  target: z.string().min(1),
  sourceHandle: z.string().optional(),
  targetHandle: z.string().optional(),
  label: z.string().max(MAX_LABEL_LENGTH).optional(),
  color: z.string().optional(),
})

export type DiagramEdge = z.infer<typeof DiagramEdgeSchema>

export const ViewportSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
  zoom: z.number().finite().positive(),
})

export const DiagramThemeSchema = z.object({
  palette: z.string().default('default'),
})

/** Diagram body as stored in Firestore `doc` (no id). */
export const DiagramDocSchema = z
  .object({
    schemaVersion: z.literal(CURRENT_SCHEMA_VERSION),
    title: z.string().min(1).max(MAX_LABEL_LENGTH),
    description: z.string().max(5000).optional(),
    nodes: z.array(DiagramNodeSchema).max(MAX_NODES),
    edges: z.array(DiagramEdgeSchema).max(MAX_EDGES),
    groups: z.array(z.unknown()).default([]),
    viewport: ViewportSchema.default({ x: 0, y: 0, zoom: 1 }),
    theme: DiagramThemeSchema.default({ palette: 'default' }),
  })
  .superRefine((doc, ctx) => {
    const nodeIds = new Set<string>()
    for (const node of doc.nodes) {
      if (nodeIds.has(node.id)) {
        ctx.addIssue({
          code: 'custom',
          message: `Duplicate node id: ${node.id}`,
          path: ['nodes'],
        })
      }
      nodeIds.add(node.id)
    }

    const edgeIds = new Set<string>()
    for (const edge of doc.edges) {
      if (edgeIds.has(edge.id)) {
        ctx.addIssue({
          code: 'custom',
          message: `Duplicate edge id: ${edge.id}`,
          path: ['edges'],
        })
      }
      edgeIds.add(edge.id)

      if (!nodeIds.has(edge.source)) {
        ctx.addIssue({
          code: 'custom',
          message: `Edge ${edge.id} source ${edge.source} is missing`,
          path: ['edges'],
        })
      }
      if (!nodeIds.has(edge.target)) {
        ctx.addIssue({
          code: 'custom',
          message: `Edge ${edge.id} target ${edge.target} is missing`,
          path: ['edges'],
        })
      }
    }

    for (const node of doc.nodes) {
      if (node.parentId && !nodeIds.has(node.parentId)) {
        ctx.addIssue({
          code: 'custom',
          message: `Node ${node.id} parent ${node.parentId} is missing`,
          path: ['nodes'],
        })
      }
    }
  })

export type DiagramDoc = z.infer<typeof DiagramDocSchema>

/** Full diagram including id (used in the editor and export). */
export const DiagramSchema = DiagramDocSchema.and(
  z.object({
    id: z.string().min(1),
  }),
)

export type Diagram = z.infer<typeof DiagramSchema>

export function createEmptyDiagramDoc(title = 'Untitled diagram'): DiagramDoc {
  return DiagramDocSchema.parse({
    schemaVersion: CURRENT_SCHEMA_VERSION,
    title: title.slice(0, MAX_LABEL_LENGTH) || 'Untitled diagram',
    nodes: [],
    edges: [],
    groups: [],
    viewport: { x: 0, y: 0, zoom: 1 },
    theme: { palette: 'default' },
  })
}

export function createEmptyDiagram(id: string, title = 'Untitled diagram'): Diagram {
  return {
    ...createEmptyDiagramDoc(title),
    id,
  }
}

export function parseDiagramDoc(raw: unknown): DiagramDoc {
  return DiagramDocSchema.parse(raw)
}

export function parseDiagram(raw: unknown): Diagram {
  return DiagramSchema.parse(raw)
}
