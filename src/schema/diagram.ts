import { z } from 'zod'
import { ConditionSchema, RuleMatchSchema } from './conditions'

export const CURRENT_SCHEMA_VERSION = 3 as const

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

const NodeStyleSchema = z.object({
  fill: z.string().optional(),
  stroke: z.string().optional(),
  strokeWidth: z.number().finite().optional(),
  textSize: z.number().finite().optional(),
  textWeight: z.union([z.literal(400), z.literal(500), z.literal(600), z.string()]).optional(),
})

export const ShapeTypeSchema = z.enum([
  'rect',
  'rounded',
  'diamond',
  'ellipse',
  'parallelogram',
  'cylinder',
  'document',
  'hexagon',
  'triangle',
])

export type ShapeType = z.infer<typeof ShapeTypeSchema>

export const NodeKindSchema = z.enum([
  'start',
  'end',
  'step',
  'decision',
  'switch',
  'loop',
  'parallelSplit',
  'parallelJoin',
  'delay',
  'subflow',
  'error',
  'mapping',
  'integration',
  'database',
  'inputForm',
  'output',
  'score',
  'rule',
  'lookup',
  'actor',
  'approval',
  'notification',
  'timer',
  'event',
  'note',
  'callout',
  'image',
  'divider',
  'link',
  'group',
  'shape',
  'sticky',
  'section',
])

export type NodeKind = z.infer<typeof NodeKindSchema>

const BranchMatchSchema = z.object({
  combinator: z.enum(['and', 'or']).default('and'),
  conditions: z.array(ConditionSchema).min(1).max(20),
})

export const BranchSchema = z.object({
  id: z.string().min(1),
  label: z.string().max(MAX_LABEL_LENGTH),
  condition: z.string().optional(),
  color: z.string().optional(),
  match: BranchMatchSchema.optional(),
  isDefault: z.boolean().optional(),
})

export type Branch = z.infer<typeof BranchSchema>

const MappingRowSchema = z.object({
  from: z.string(),
  to: z.string(),
  transform: z.string().optional(),
})

export const RuleRowSchema = z.object({
  id: z.string().min(1).optional(),
  condition: z.string().optional(),
  match: RuleMatchSchema.optional(),
  outcome: z.string(),
  score: z.number().finite().optional(),
})

export type RuleRow = z.infer<typeof RuleRowSchema>

const NodeBaseSchema = z.object({
  id: z.string().min(1),
  label: z.string().max(MAX_LABEL_LENGTH),
  description: z.string().max(2000).optional(),
  icon: z.string().optional(),
  color: z.string().optional(),
  position: PositionSchema,
  size: SizeSchema.optional(),
  parentId: z.string().min(1).optional(),
  locked: z.boolean().optional(),
  hidden: z.boolean().optional(),
  zIndex: z.number().int().optional(),
  style: NodeStyleSchema.optional(),
})

const BranchesDataSchema = z.object({
  mode: z.enum(['branches', 'switch']).optional(),
  switchField: z.string().max(200).optional(),
  /** Where branch output handles sit; default bottom. */
  branchHandleSide: z.enum(['bottom', 'right']).optional(),
  branches: z.array(BranchSchema).min(1),
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
    data: BranchesDataSchema,
  }),
  NodeBaseSchema.extend({
    kind: z.literal('switch'),
    data: BranchesDataSchema.extend({
      switchField: z.string().max(200).optional(),
    }),
  }),
  NodeBaseSchema.extend({
    kind: z.literal('loop'),
    data: z
      .object({
        collection: z.string().optional(),
        maxIterations: z.number().int().positive().optional(),
      })
      .optional(),
  }),
  NodeBaseSchema.extend({
    kind: z.literal('parallelSplit'),
    data: z.object({ branches: z.array(z.string()).optional() }).optional(),
  }),
  NodeBaseSchema.extend({
    kind: z.literal('parallelJoin'),
    data: z.object({ waitFor: z.enum(['all', 'any']).optional() }).optional(),
  }),
  NodeBaseSchema.extend({
    kind: z.literal('delay'),
    data: z
      .object({
        durationMs: z.number().finite().nonnegative().optional(),
        until: z.string().optional(),
      })
      .optional(),
  }),
  NodeBaseSchema.extend({
    kind: z.literal('subflow'),
    data: z
      .object({
        diagramId: z.string().optional(),
        diagramTitle: z.string().optional(),
      })
      .optional(),
  }),
  NodeBaseSchema.extend({
    kind: z.literal('error'),
    data: z
      .object({
        code: z.string().optional(),
        message: z.string().optional(),
      })
      .optional(),
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
    kind: z.literal('database'),
    data: z
      .object({
        operation: z.enum(['read', 'write', 'query', 'upsert']).optional(),
        collection: z.string().optional(),
        query: z.string().optional(),
      })
      .optional(),
  }),
  NodeBaseSchema.extend({
    kind: z.literal('inputForm'),
    data: z
      .object({
        fields: z.array(z.object({ name: z.string(), type: z.string().optional() })).optional(),
      })
      .optional(),
  }),
  NodeBaseSchema.extend({
    kind: z.literal('output'),
    data: z.object({ format: z.string().optional(), fields: z.array(z.string()).optional() }).optional(),
  }),
  NodeBaseSchema.extend({
    kind: z.literal('score'),
    data: z
      .object({
        model: z.string().optional(),
        threshold: z.number().finite().optional(),
      })
      .optional(),
  }),
  NodeBaseSchema.extend({
    kind: z.literal('rule'),
    data: z.object({
      rules: z.array(RuleRowSchema),
      threshold: z.number().finite().optional(),
    }),
  }),
  NodeBaseSchema.extend({
    kind: z.literal('lookup'),
    data: z
      .object({
        table: z.string().optional(),
        keyField: z.string().optional(),
        valueField: z.string().optional(),
      })
      .optional(),
  }),
  NodeBaseSchema.extend({
    kind: z.literal('actor'),
    data: z.object({ role: z.string().optional() }).optional(),
  }),
  NodeBaseSchema.extend({
    kind: z.literal('approval'),
    data: z
      .object({
        assignees: z.array(z.string()).optional(),
        dueInHours: z.number().finite().optional(),
      })
      .optional(),
  }),
  NodeBaseSchema.extend({
    kind: z.literal('notification'),
    data: z
      .object({
        channel: z.enum(['email', 'sms', 'push']).optional(),
        template: z.string().optional(),
        to: z.string().optional(),
      })
      .optional(),
  }),
  NodeBaseSchema.extend({
    kind: z.literal('timer'),
    data: z
      .object({
        cron: z.string().optional(),
        timezone: z.string().optional(),
      })
      .optional(),
  }),
  NodeBaseSchema.extend({
    kind: z.literal('event'),
    data: z
      .object({
        eventName: z.string().optional(),
        source: z.string().optional(),
      })
      .optional(),
  }),
  NodeBaseSchema.extend({
    kind: z.literal('note'),
    data: z.object({
      text: z.string(),
    }),
  }),
  NodeBaseSchema.extend({
    kind: z.literal('callout'),
    data: z.object({ text: z.string().default(''), tone: z.enum(['info', 'warn', 'tip']).optional() }).optional(),
  }),
  NodeBaseSchema.extend({
    kind: z.literal('image'),
    data: z.object({ url: z.string().default(''), alt: z.string().optional() }).optional(),
  }),
  NodeBaseSchema.extend({
    kind: z.literal('divider'),
    data: z.object({ orientation: z.enum(['horizontal', 'vertical']).optional() }).optional(),
  }),
  NodeBaseSchema.extend({
    kind: z.literal('link'),
    data: z.object({ href: z.string().default(''), title: z.string().optional() }).optional(),
  }),
  NodeBaseSchema.extend({
    kind: z.literal('group'),
    data: z.object({
      label: z.string().max(MAX_LABEL_LENGTH),
      color: z.string().optional(),
      collapsed: z.boolean().optional(),
    }),
  }),
  NodeBaseSchema.extend({
    kind: z.literal('shape'),
    data: z.object({
      shape: ShapeTypeSchema.default('rect'),
      text: z.string().optional(),
    }),
  }),
  NodeBaseSchema.extend({
    kind: z.literal('sticky'),
    data: z.object({
      text: z.string().default(''),
    }),
  }),
  NodeBaseSchema.extend({
    kind: z.literal('section'),
    data: z.object({
      label: z.string().max(MAX_LABEL_LENGTH),
      color: z.string().optional(),
      collapsed: z.boolean().optional(),
    }),
  }),
])

export type DiagramNode = z.infer<typeof DiagramNodeSchema>

export const EdgeMarkerSchema = z.enum([
  'none',
  'arrow',
  'arrowFilled',
  'circle',
  'diamond',
])

export type EdgeMarker = z.infer<typeof EdgeMarkerSchema>

export const DiagramEdgeSchema = z.object({
  id: z.string().min(1),
  source: z.string().min(1),
  target: z.string().min(1),
  sourceHandle: z.string().optional(),
  targetHandle: z.string().optional(),
  label: z.string().max(MAX_LABEL_LENGTH).optional(),
  color: z.string().optional(),
  type: z.enum(['elbow', 'straight', 'curved']).optional(),
  waypoints: z.array(PositionSchema).max(32).optional(),
  startMarker: EdgeMarkerSchema.optional(),
  endMarker: EdgeMarkerSchema.optional(),
  style: z
    .object({
      color: z.string().optional(),
      width: z.number().finite().min(1).max(4).optional(),
      dash: z.enum(['solid', 'dashed']).optional(),
    })
    .optional(),
  labelPosition: z.number().finite().min(0).max(1).optional(),
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

export function isContainerKind(kind: NodeKind): boolean {
  return kind === 'group' || kind === 'section'
}
