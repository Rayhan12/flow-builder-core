import { z } from 'zod'
import { MCP_TOOL_NAMES, type ToolName } from './mcpToolNames.ts'
import type { ToolDefinition } from './types.ts'

const ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/

const id = (what: string) =>
  z
    .string()
    .regex(ID_PATTERN, `${what} must be 1 to 128 letters, digits, "_" or "-"`)
    .describe(what)

const projectId = id('Project id, as returned by list_projects or create_project')
const diagramId = id('Diagram id, as returned by list_diagrams or create_diagram')

const title = z.string().trim().min(1).max(200).describe('Diagram title, up to 200 characters')

const DIAGRAM_HINT =
  'Diagram JSON (schemaVersion 3): { title, description?, nodes: [{ id, kind, label, description?, icon?, color?, ' +
  'position?: {x, y}, size?, parentId?, locked?, hidden?, zIndex?, style?, data? }], ' +
  'edges: [{ id, source, target, sourceHandle?, targetHandle?, label?, color?, type?, waypoints?, startMarker?, endMarker?, style?, labelPosition? }] }. ' +
  'Node kinds: start, end, step, decision, switch, loop, parallelSplit, parallelJoin, delay, subflow, error, ' +
  'mapping, integration, database, inputForm, output, score, rule, lookup, actor, approval, notification, timer, event, ' +
  'note, callout, image, divider, link, group, shape, sticky, section. ' +
  'Shape data.shape: rect|rounded|diamond|ellipse|parallelogram|cylinder|document|hexagon|triangle. ' +
  'A decision/switch node needs data.branches: [{ id, label }], and each branch id is an edge sourceHandle. ' +
  'Positions are optional hints only — automatic layout runs after create/update (ELK layered, branch-aware). ' +
  'Do not invent precise coordinates or spacing. Max 2000 nodes and 4000 edges. Every edge must point at real node ids.'

const OPS_HINT =
  'Edit operations applied in order. Allowed: { op: "addNode", node: { kind, label, id?, position?, data? } }, ' +
  '{ op: "updateNode", id, patch }, { op: "removeNode", id }, { op: "addEdge", edge: { source, target, id?, sourceHandle?, label? } }, ' +
  '{ op: "updateEdge", id, patch }, { op: "removeEdge", id }, { op: "setGroup", nodeId, parentId: string or null }, ' +
  '{ op: "setTitle", title }. Positions on addNode are optional hints; new nodes are placed automatically near their ' +
  'anchor without relaying out the whole board. All ops are validated together; if any op is invalid nothing is saved.'

const diagramJson = z.record(z.string(), z.unknown()).describe(DIAGRAM_HINT)
const opsJson = z
  .array(z.record(z.string(), z.unknown()))
  .min(1)
  .max(500)
  .describe(OPS_HINT)

export const TOOL_DEFINITIONS: { [K in ToolName]: ToolDefinition & { name: K } } = {
  list_projects: {
    name: 'list_projects',
    description:
      'List all of the user\'s projects with id, name and diagram count. Call this first to find a project id.',
    input: z.object({}),
    destructive: false,
    mutating: false,
    jsonArgs: [],
  },
  get_project: {
    name: 'get_project',
    description: 'Get one project by id.',
    input: z.object({ projectId }),
    destructive: false,
    mutating: false,
    jsonArgs: [],
  },
  create_project: {
    name: 'create_project',
    description: 'Create a new project. Returns its id.',
    input: z.object({
      name: z.string().trim().min(1).max(200).describe('Project name, up to 200 characters'),
    }),
    destructive: false,
    mutating: true,
    jsonArgs: [],
  },
  list_diagrams: {
    name: 'list_diagrams',
    description: 'List the diagrams in a project with id, title, node count and last update.',
    input: z.object({ projectId }),
    destructive: false,
    mutating: false,
    jsonArgs: [],
  },
  get_diagram: {
    name: 'get_diagram',
    description:
      'Get one diagram including its full JSON (nodes and edges). Call this before editing so you know the node ids.',
    input: z.object({ projectId, diagramId }),
    destructive: false,
    mutating: false,
    jsonArgs: [],
  },
  create_diagram: {
    name: 'create_diagram',
    description:
      'Create a diagram in a project. Pass the optional diagram to create it already filled in; omit it for an empty diagram.',
    input: z.object({ projectId, title, diagram: diagramJson.optional() }),
    destructive: false,
    mutating: true,
    jsonArgs: ['diagram'],
  },
  update_diagram: {
    name: 'update_diagram',
    description:
      'Replace the whole content of a diagram. Use for a big rewrite; use apply_diagram_edits for small changes. A version snapshot is saved.',
    input: z.object({ projectId, diagramId, diagram: diagramJson }),
    destructive: false,
    mutating: true,
    jsonArgs: ['diagram'],
  },
  apply_diagram_edits: {
    name: 'apply_diagram_edits',
    description:
      'Apply small edit operations (add, change or remove nodes and edges) to a diagram. Prefer this over update_diagram for small changes.',
    input: z.object({ projectId, diagramId, ops: opsJson }),
    destructive: false,
    mutating: true,
    jsonArgs: ['ops'],
  },
  rename_diagram: {
    name: 'rename_diagram',
    description: 'Rename a diagram.',
    input: z.object({ projectId, diagramId, title }),
    destructive: false,
    mutating: true,
    jsonArgs: [],
  },
  delete_diagram: {
    name: 'delete_diagram',
    description:
      'Permanently delete a diagram and its history. This cannot be undone. Only call it when the user clearly asked for it, and set confirm to true. The user is asked to confirm in the app as well.',
    input: z.object({
      projectId,
      diagramId,
      confirm: z.boolean().describe('Must be true. The call is refused otherwise.'),
    }),
    destructive: true,
    mutating: true,
    jsonArgs: [],
  },
}

export const TOOL_LIST: readonly ToolDefinition[] = MCP_TOOL_NAMES.map((n) => TOOL_DEFINITIONS[n])

export function isToolName(name: string): name is ToolName {
  return (MCP_TOOL_NAMES as readonly string[]).includes(name)
}

export function getToolDefinition(name: string): ToolDefinition | undefined {
  return isToolName(name) ? TOOL_DEFINITIONS[name] : undefined
}
