import { z } from 'zod'
import {
  formatGraphProblems,
  validateGraph,
  type GraphProblem,
} from '../../shared/layout/validateGraph.ts'
import { createNodeOfKind, newEdgeId, newNodeId } from '../editor/kinds.ts'
import {
  CURRENT_SCHEMA_VERSION,
  DiagramDocSchema,
  DiagramEdgeSchema,
  DiagramNodeSchema,
  NodeKindSchema,
  type Diagram,
  type DiagramDoc,
  type DiagramEdge,
  type DiagramNode,
  type NodeKind,
} from '../schema/index.ts'

const PositionSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
})

const SizeSchema = z.object({
  w: z.number().finite().positive(),
  h: z.number().finite().positive(),
})

/** AI may omit id/position/data; defaults are filled when applying. */
const AddNodeOpSchema = z.object({
  op: z.literal('addNode'),
  node: z.object({
    id: z.string().min(1).optional(),
    kind: NodeKindSchema,
    label: z.string().max(200),
    description: z.string().max(2000).optional(),
    icon: z.string().optional(),
    color: z.string().optional(),
    position: PositionSchema.optional(),
    size: SizeSchema.optional(),
    parentId: z.string().min(1).optional(),
    data: z.unknown().optional(),
  }),
})

const UpdateNodeOpSchema = z.object({
  op: z.literal('updateNode'),
  id: z.string().min(1),
  patch: z.record(z.string(), z.unknown()),
})

const RemoveNodeOpSchema = z.object({
  op: z.literal('removeNode'),
  id: z.string().min(1),
})

const AddEdgeOpSchema = z.object({
  op: z.literal('addEdge'),
  edge: z.object({
    id: z.string().min(1).optional(),
    source: z.string().min(1),
    target: z.string().min(1),
    sourceHandle: z.string().optional(),
    targetHandle: z.string().optional(),
    label: z.string().max(200).optional(),
    color: z.string().optional(),
    type: z.enum(['elbow', 'straight', 'curved']).optional(),
    startMarker: z.enum(['none', 'arrow', 'arrowFilled', 'circle', 'diamond']).optional(),
    endMarker: z.enum(['none', 'arrow', 'arrowFilled', 'circle', 'diamond']).optional(),
    style: z
      .object({
        color: z.string().optional(),
        width: z.number().finite().min(1).max(4).optional(),
        dash: z.enum(['solid', 'dashed']).optional(),
      })
      .optional(),
  }),
})

const UpdateEdgeOpSchema = z.object({
  op: z.literal('updateEdge'),
  id: z.string().min(1),
  patch: z.record(z.string(), z.unknown()),
})

const RemoveEdgeOpSchema = z.object({
  op: z.literal('removeEdge'),
  id: z.string().min(1),
})

const SetGroupOpSchema = z.object({
  op: z.literal('setGroup'),
  nodeId: z.string().min(1),
  parentId: z.string().min(1).nullable(),
})

const SetTitleOpSchema = z.object({
  op: z.literal('setTitle'),
  title: z.string().min(1).max(200),
})

export const EditOpSchema = z.discriminatedUnion('op', [
  AddNodeOpSchema,
  UpdateNodeOpSchema,
  RemoveNodeOpSchema,
  AddEdgeOpSchema,
  UpdateEdgeOpSchema,
  RemoveEdgeOpSchema,
  SetGroupOpSchema,
  SetTitleOpSchema,
])

export type EditOp = z.infer<typeof EditOpSchema>

export const AiReplaceResponseSchema = z.object({
  type: z.literal('replace'),
  diagram: z.unknown(),
  summary: z.string().min(1),
})

export const AiOpsResponseSchema = z.object({
  type: z.literal('ops'),
  ops: z.array(EditOpSchema).min(1),
  summary: z.string().min(1),
})

export const AiMessageResponseSchema = z.object({
  type: z.literal('message'),
  text: z.string().min(1),
})

export const AiResponseSchema = z.discriminatedUnion('type', [
  AiReplaceResponseSchema,
  AiOpsResponseSchema,
  AiMessageResponseSchema,
])

export type AiResponse = z.infer<typeof AiResponseSchema>

export type DiagramDiff = {
  addedNodes: string[]
  changedNodes: string[]
  removedNodes: string[]
  addedEdges: string[]
  changedEdges: string[]
  removedEdges: string[]
  titleChanged: boolean
  summary: string
}

export type ApplyResult =
  | { ok: true; diagram: Diagram; diff: DiagramDiff }
  | { ok: false; error: string; code?: 'graph_invalid'; problems?: GraphProblem[] }

function nodeFingerprint(node: DiagramNode): string {
  const { position: _p, ...rest } = node
  return JSON.stringify(rest)
}

function edgeFingerprint(edge: DiagramEdge): string {
  return JSON.stringify(edge)
}

export function computeDiff(before: Diagram, after: Diagram, summary: string): DiagramDiff {
  const beforeNodes = new Map(before.nodes.map((n) => [n.id, n]))
  const afterNodes = new Map(after.nodes.map((n) => [n.id, n]))
  const beforeEdges = new Map(before.edges.map((e) => [e.id, e]))
  const afterEdges = new Map(after.edges.map((e) => [e.id, e]))

  const addedNodes: string[] = []
  const changedNodes: string[] = []
  const removedNodes: string[] = []
  const addedEdges: string[] = []
  const changedEdges: string[] = []
  const removedEdges: string[] = []

  for (const [id, node] of afterNodes) {
    const prev = beforeNodes.get(id)
    if (!prev) addedNodes.push(id)
    else if (nodeFingerprint(prev) !== nodeFingerprint(node)) changedNodes.push(id)
  }
  for (const id of beforeNodes.keys()) {
    if (!afterNodes.has(id)) removedNodes.push(id)
  }

  for (const [id, edge] of afterEdges) {
    const prev = beforeEdges.get(id)
    if (!prev) addedEdges.push(id)
    else if (edgeFingerprint(prev) !== edgeFingerprint(edge)) changedEdges.push(id)
  }
  for (const id of beforeEdges.keys()) {
    if (!afterEdges.has(id)) removedEdges.push(id)
  }

  return {
    addedNodes,
    changedNodes,
    removedNodes,
    addedEdges,
    changedEdges,
    removedEdges,
    titleChanged: before.title !== after.title,
    summary,
  }
}

function defaultPosition(index: number): { x: number; y: number } {
  return { x: 80 + (index % 4) * 260, y: 80 + Math.floor(index / 4) * 140 }
}

type LooseNode = z.infer<typeof AddNodeOpSchema>['node']

function buildNodeFromLoose(loose: LooseNode, index: number): DiagramNode | null {
  const kind = loose.kind as NodeKind
  const base = createNodeOfKind(kind, loose.position ?? defaultPosition(index), {
    id: loose.id,
    label: loose.label,
    color: loose.color,
    icon: loose.icon,
  })

  let merged: DiagramNode = {
    ...base,
    description: loose.description ?? base.description,
    size: loose.size ?? base.size,
    parentId: loose.parentId ?? base.parentId,
  }

  if (loose.data !== undefined && loose.data !== null && typeof loose.data === 'object') {
    merged = {
      ...merged,
      data: { ...(merged.data as object), ...(loose.data as object) },
    } as DiagramNode
  }

  const parsed = DiagramNodeSchema.safeParse(merged)
  if (parsed.success) return parsed.data

  // Kind-specific data from the AI may be incomplete; keep createNodeOfKind defaults.
  return base
}

export function applyOps(diagram: Diagram, ops: EditOp[]): ApplyResult {
  let title = diagram.title
  let description = diagram.description
  let nodes = structuredClone(diagram.nodes)
  let edges = structuredClone(diagram.edges)
  const groups = structuredClone(diagram.groups ?? [])

  for (const op of ops) {
    switch (op.op) {
      case 'addNode': {
        const built = buildNodeFromLoose(op.node, nodes.length)
        if (!built) {
          return { ok: false, error: `Invalid addNode for kind ${op.node.kind}` }
        }
        if (nodes.some((n) => n.id === built.id)) {
          return { ok: false, error: `Node id already exists: ${built.id}` }
        }
        if (built.parentId && !nodes.some((n) => n.id === built.parentId)) {
          return { ok: false, error: `Parent group missing: ${built.parentId}` }
        }
        nodes = [...nodes, built]
        break
      }
      case 'updateNode': {
        const idx = nodes.findIndex((n) => n.id === op.id)
        if (idx < 0) return { ok: false, error: `Node not found: ${op.id}` }
        const current = nodes[idx]
        const next = { ...current, ...op.patch, id: current.id, kind: current.kind }
        const parsed = DiagramNodeSchema.safeParse(next)
        if (!parsed.success) {
          return { ok: false, error: `Invalid updateNode for ${op.id}` }
        }
        nodes = nodes.map((n, i) => (i === idx ? parsed.data : n))
        break
      }
      case 'removeNode': {
        const idSet = new Set([op.id])
        if (!nodes.some((n) => n.id === op.id)) {
          return { ok: false, error: `Node not found: ${op.id}` }
        }
        nodes = nodes
          .filter((n) => !idSet.has(n.id))
          .map((n) => (n.parentId && idSet.has(n.parentId) ? { ...n, parentId: undefined } : n))
        edges = edges.filter((e) => !idSet.has(e.source) && !idSet.has(e.target))
        break
      }
      case 'addEdge': {
        const edge: DiagramEdge = {
          id: op.edge.id ?? newEdgeId(),
          source: op.edge.source,
          target: op.edge.target,
          sourceHandle: op.edge.sourceHandle,
          targetHandle: op.edge.targetHandle,
          label: op.edge.label,
          color: op.edge.color,
        }
        const parsed = DiagramEdgeSchema.safeParse(edge)
        if (!parsed.success) return { ok: false, error: 'Invalid addEdge' }
        if (edges.some((e) => e.id === parsed.data.id)) {
          return { ok: false, error: `Edge id already exists: ${parsed.data.id}` }
        }
        if (!nodes.some((n) => n.id === parsed.data.source)) {
          return { ok: false, error: `Edge source missing: ${parsed.data.source}` }
        }
        if (!nodes.some((n) => n.id === parsed.data.target)) {
          return { ok: false, error: `Edge target missing: ${parsed.data.target}` }
        }
        edges = [...edges, parsed.data]
        break
      }
      case 'updateEdge': {
        const idx = edges.findIndex((e) => e.id === op.id)
        if (idx < 0) return { ok: false, error: `Edge not found: ${op.id}` }
        const current = edges[idx]
        const next = { ...current, ...op.patch, id: current.id }
        const parsed = DiagramEdgeSchema.safeParse(next)
        if (!parsed.success) return { ok: false, error: `Invalid updateEdge for ${op.id}` }
        edges = edges.map((e, i) => (i === idx ? parsed.data : e))
        break
      }
      case 'removeEdge': {
        if (!edges.some((e) => e.id === op.id)) {
          return { ok: false, error: `Edge not found: ${op.id}` }
        }
        edges = edges.filter((e) => e.id !== op.id)
        break
      }
      case 'setGroup': {
        const idx = nodes.findIndex((n) => n.id === op.nodeId)
        if (idx < 0) return { ok: false, error: `Node not found: ${op.nodeId}` }
        if (nodes[idx].kind === 'group') {
          return { ok: false, error: 'Cannot nest a group inside another group this way' }
        }
        if (op.parentId) {
          const parent = nodes.find((n) => n.id === op.parentId)
          if (!parent || parent.kind !== 'group') {
            return { ok: false, error: `Group not found: ${op.parentId}` }
          }
        }
        nodes = nodes.map((n, i) =>
          i === idx ? ({ ...n, parentId: op.parentId ?? undefined } as DiagramNode) : n,
        )
        break
      }
      case 'setTitle': {
        title = op.title
        break
      }
      default: {
        const _exhaustive: never = op
        return { ok: false, error: `Unknown op: ${String(_exhaustive)}` }
      }
    }
  }

  const docCandidate: DiagramDoc = {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    title,
    description,
    nodes,
    edges,
    groups,
    viewport: diagram.viewport,
    theme: diagram.theme,
  }

  const parsed = DiagramDocSchema.safeParse(docCandidate)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Ops produced an invalid diagram' }
  }

  const next: Diagram = { ...parsed.data, id: diagram.id }
  const editedNodeIds = ops.flatMap((op) => {
    if (op.op === 'addNode') return op.node.id ? [op.node.id] : []
    if (op.op === 'updateNode') return [op.id]
    return []
  })
  // Include newly assigned ids from the resulting diagram for addNode without id.
  const beforeIds = new Set(diagram.nodes.map((n) => n.id))
  for (const n of next.nodes) {
    if (!beforeIds.has(n.id)) editedNodeIds.push(n.id)
  }
  const problems = validateGraph(next.nodes, next.edges, { editedNodeIds })
  if (problems.length > 0) {
    return {
      ok: false,
      code: 'graph_invalid',
      error: `Graph invalid:\n${formatGraphProblems(problems)}`,
      problems,
    }
  }

  return {
    ok: true,
    diagram: next,
    diff: computeDiff(diagram, next, `${ops.length} change${ops.length === 1 ? '' : 's'}`),
  }
}

export function applyReplace(diagram: Diagram, rawDiagram: unknown, summary: string): ApplyResult {
  if (!rawDiagram || typeof rawDiagram !== 'object') {
    return { ok: false, error: 'Replace payload is not an object' }
  }

  const record = rawDiagram as Record<string, unknown>
  const nodesRaw = Array.isArray(record.nodes) ? record.nodes : null
  const edgesRaw = Array.isArray(record.edges) ? record.edges : null
  if (!nodesRaw || !edgesRaw) {
    return { ok: false, error: 'Replace diagram must include nodes and edges arrays' }
  }

  const nodes: DiagramNode[] = []
  for (let i = 0; i < nodesRaw.length; i++) {
    const item = nodesRaw[i]
    if (!item || typeof item !== 'object') {
      return { ok: false, error: `Invalid node at index ${i}` }
    }
    const obj = item as Record<string, unknown>
    const kindParsed = NodeKindSchema.safeParse(obj.kind)
    if (!kindParsed.success || typeof obj.label !== 'string') {
      return { ok: false, error: `Node at index ${i} needs kind and label` }
    }

    const loose: LooseNode = {
      id: typeof obj.id === 'string' ? obj.id : newNodeId(),
      kind: kindParsed.data,
      label: obj.label,
      description: typeof obj.description === 'string' ? obj.description : undefined,
      icon: typeof obj.icon === 'string' ? obj.icon : undefined,
      color: typeof obj.color === 'string' ? obj.color : undefined,
      position:
        obj.position && typeof obj.position === 'object'
          ? (obj.position as { x: number; y: number })
          : defaultPosition(i),
      size: obj.size && typeof obj.size === 'object' ? (obj.size as { w: number; h: number }) : undefined,
      parentId: typeof obj.parentId === 'string' ? obj.parentId : undefined,
      data: obj.data,
    }

    const built = buildNodeFromLoose(loose, i)
    if (!built) return { ok: false, error: `Could not build node at index ${i}` }
    nodes.push(built)
  }

  const edges: DiagramEdge[] = []
  for (let i = 0; i < edgesRaw.length; i++) {
    const item = edgesRaw[i]
    if (!item || typeof item !== 'object') {
      return { ok: false, error: `Invalid edge at index ${i}` }
    }
    const obj = item as Record<string, unknown>
    const edge = {
      id: typeof obj.id === 'string' ? obj.id : newEdgeId(),
      source: obj.source,
      target: obj.target,
      sourceHandle: typeof obj.sourceHandle === 'string' ? obj.sourceHandle : undefined,
      targetHandle: typeof obj.targetHandle === 'string' ? obj.targetHandle : undefined,
      label: typeof obj.label === 'string' ? obj.label : undefined,
      color: typeof obj.color === 'string' ? obj.color : undefined,
    }
    const parsed = DiagramEdgeSchema.safeParse(edge)
    if (!parsed.success) {
      return { ok: false, error: `Invalid edge at index ${i}` }
    }
    edges.push(parsed.data)
  }

  const title =
    typeof record.title === 'string' && record.title.trim()
      ? record.title.trim().slice(0, 200)
      : diagram.title

  const docCandidate: DiagramDoc = {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    title,
    description:
      typeof record.description === 'string' ? record.description : diagram.description,
    nodes,
    edges,
    groups: Array.isArray(record.groups) ? record.groups : [],
    viewport:
      record.viewport && typeof record.viewport === 'object'
        ? (record.viewport as Diagram['viewport'])
        : diagram.viewport,
    theme:
      record.theme && typeof record.theme === 'object'
        ? (record.theme as Diagram['theme'])
        : diagram.theme,
  }

  const parsed = DiagramDocSchema.safeParse(docCandidate)
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? 'Replace produced an invalid diagram',
    }
  }

  const next: Diagram = { ...parsed.data, id: diagram.id }
  const beforeIds = new Set(diagram.nodes.map((n) => n.id))
  const editedNodeIds = next.nodes.filter((n) => !beforeIds.has(n.id)).map((n) => n.id)
  // Full replace of an empty/nearly empty board: treat all nodes as edited.
  const problems = validateGraph(next.nodes, next.edges, {
    editedNodeIds: editedNodeIds.length > 0 ? editedNodeIds : next.nodes.map((n) => n.id),
  })
  if (problems.length > 0) {
    return {
      ok: false,
      code: 'graph_invalid',
      error: `Graph invalid:\n${formatGraphProblems(problems)}`,
      problems,
    }
  }
  return { ok: true, diagram: next, diff: computeDiff(diagram, next, summary) }
}

export function parseAiResponse(
  raw: unknown,
): { ok: true; value: AiResponse } | { ok: false; error: string } {
  const parsed = AiResponseSchema.safeParse(raw)
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? 'AI reply is not valid JSON for this app',
    }
  }
  return { ok: true, value: parsed.data }
}

export function parseAiResponseText(
  text: string,
): { ok: true; value: AiResponse } | { ok: false; error: string } {
  let raw: unknown
  try {
    const trimmed = text.trim()
    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/)
    raw = JSON.parse(fenced ? fenced[1].trim() : trimmed)
  } catch {
    return { ok: false, error: 'AI reply was not valid JSON' }
  }
  return parseAiResponse(raw)
}

export type PreviewResult =
  | { ok: true; kind: 'message'; text: string }
  | { ok: true; kind: 'change'; diagram: Diagram; diff: DiagramDiff }
  | { ok: false; error: string }

export function previewFromResponse(diagram: Diagram, response: AiResponse): PreviewResult {
  if (response.type === 'message') {
    return { ok: true, kind: 'message', text: response.text }
  }
  if (response.type === 'ops') {
    const result = applyOps(diagram, response.ops)
    if (!result.ok) return result
    return {
      ok: true,
      kind: 'change',
      diagram: result.diagram,
      diff: { ...result.diff, summary: response.summary },
    }
  }
  const replaced = applyReplace(diagram, response.diagram, response.summary)
  if (!replaced.ok) return replaced
  return { ok: true, kind: 'change', diagram: replaced.diagram, diff: replaced.diff }
}
