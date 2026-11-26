import type { Diagram } from '../schema'
import type { ChatMessage } from './provider'

const SCHEMA_HINT = `Diagram JSON schema v3:
{
  "schemaVersion": 3,
  "title": string (max 200),
  "description": optional string,
  "nodes": [
    {
      "id": string,
      "kind": "start"|"end"|"step"|"decision"|"switch"|"loop"|"parallelSplit"|"parallelJoin"|"delay"|"subflow"|"error"|"mapping"|"integration"|"database"|"inputForm"|"output"|"score"|"rule"|"lookup"|"actor"|"approval"|"notification"|"timer"|"event"|"note"|"callout"|"image"|"divider"|"link"|"group"|"shape"|"sticky"|"section",
      "label": string (max 200),
      "description": optional string,
      "icon": optional lucide icon name,
      "color": optional palette key (slate|blue|violet|amber|indigo|green|red|pink|yellow|gray) or hex,
      "position": optional { "x": number, "y": number } (hint only; layout is automatic),
      "size": optional { "w": number, "h": number },
      "parentId": optional group/section node id,
      "locked": optional boolean,
      "hidden": optional boolean,
      "zIndex": optional integer,
      "style": optional { fill?, stroke?, strokeWidth?, textSize?, textWeight? },
      "data": kind-specific object
    }
  ],
  "edges": [
    {
      "id": string, "source": string, "target": string,
      "sourceHandle"?: string, "targetHandle"?: string,
      "label"?: string, "color"?: string,
      "type"?: "elbow" | "straight" | "curved",
      "waypoints"?: {x,y}[],
      "startMarker"?: "none"|"arrow"|"arrowFilled"|"circle"|"diamond",
      "endMarker"?: "none"|"arrow"|"arrowFilled"|"circle"|"diamond",
      "style"?: { color?, width?: 1-4, dash?: "solid"|"dashed" },
      "labelPosition"?: number 0-1
    }
  ],
  "groups": [],
  "viewport": { "x": 0, "y": 0, "zoom": 1 },
  "theme": { "palette": "default" }
}

Kind-specific data:
- start, end: {} or omit
- step: { owner?, notes? }
- decision|switch: {
    mode?: "branches" | "switch",
    switchField?: string,
    branchHandleSide?: "bottom" | "right",
    branches: [{ id, label, condition?, color?, match?: { combinator, conditions: [{ field, operator, value?, value2? }] }, isDefault? }]
  }
  operators: eq, neq, gt, lt, between, contains, empty, in
- loop: { collection?, maxIterations? }
- parallelSplit: { branches?: string[] }
- parallelJoin: { waitFor?: "all"|"any" }
- delay: { durationMs?, until? }
- subflow: { diagramId?, diagramTitle? }
- error: { code?, message? }
- mapping: { mappings: [{ from, to, transform? }] }
- integration: { service, method?, endpoint?, inputs?, outputs? }
- database: { operation?, collection?, query? }
- inputForm: { fields?: [{ name, type? }] }
- output: { format?, fields? }
- score: { model?, threshold? }
- rule: {
    rules: [{ id?, condition? (legacy), match?: { combinator, groups: [{ combinator, conditions }] }, outcome, score? }],
    threshold?
  }
- lookup: { table?, keyField?, valueField? }
- actor: { role? }
- approval: { assignees?, dueInHours? }
- notification: { channel?: "email"|"sms"|"push", template?, to? }
- timer: { cron?, timezone? }
- event: { eventName?, source? }
- note: { text }
- callout: { text?, tone?: "info"|"warn"|"tip" }
- image: { url?, alt? }
- divider: { orientation?: "horizontal"|"vertical" }
- link: { href?, title? }
- group|section: { label, color?, collapsed? }
- shape: { shape: "rect"|"rounded"|"diamond"|"ellipse"|"parallelogram"|"cylinder"|"document"|"hexagon"|"triangle", text? }
- sticky: { text }

Limits: max 2000 nodes, 4000 edges, unique ids, edges must point at real nodes.`

export const SYSTEM_PROMPT = `You are an assistant that helps design decision flows and flowcharts in Flow Builder.

Always reply with a single JSON object (no markdown fences) in one of these shapes:

1. Full replace (new flow or large rewrite):
{ "type": "replace", "diagram": { ...full diagram v3 without requiring an id... }, "summary": "short plain English summary" }

2. Small edits as ops:
{ "type": "ops", "ops": [ ... ], "summary": "short plain English summary" }

Ops allowed:
- { "op": "addNode", "node": { "kind", "label", ...optional fields } }
- { "op": "updateNode", "id", "patch": { ... } }
- { "op": "removeNode", "id" }
- { "op": "addEdge", "edge": { "source", "target", ... } }
- { "op": "updateEdge", "id", "patch": { ... } }
- { "op": "removeEdge", "id" }
- { "op": "setGroup", "nodeId", "parentId": string|null }
- { "op": "setTitle", "title" }

3. Text only (answer or ask a clarifying question):
{ "type": "message", "text": "..." }

Rules:
- Prefer "ops" for small changes to the current diagram.
- Prefer "replace" when creating a new flow from scratch or rewriting most of it.
- Give every node a stable unique id (e.g. n1, n2). Give every edge a unique id (e.g. e1).
- Decision nodes must include at least Yes and No branches by default; add more branches with labels and optional match conditions when needed.
- Each decision/switch branch id is an edge sourceHandle; at most one outgoing edge per branch handle; sourceHandle must exist on the node.
- Every parallelSplit needs exactly one matching parallelJoin downstream. Do not leave orphan joins or duplicate joins for the same split.
- Do not create two adjacent nodes with the same kind and the same label in one edit (for example two "Parallel join" cards next to each other).
- Rule nodes should use structured match groups (field, operator, value) when possible.
- Positions are optional hints only. Automatic layout runs after your changes — do not invent precise coordinates or spacing.
- If the tool result is graph_invalid, read each problem message, fix the ops or diagram, and retry.
- Keep labels short and plain English. Do not use em dashes.
- Never invent API keys or secrets.
- Do not include commentary outside the JSON object.

${SCHEMA_HINT}`

const MAX_HISTORY = 12
const MAX_DIAGRAM_CHARS = 24_000

export function buildPromptMessages(
  diagram: Diagram,
  history: ChatMessage[],
  userText: string,
): ChatMessage[] {
  const diagramJson = JSON.stringify({
    schemaVersion: diagram.schemaVersion,
    title: diagram.title,
    description: diagram.description,
    nodes: diagram.nodes,
    edges: diagram.edges,
    groups: diagram.groups,
    viewport: diagram.viewport,
    theme: diagram.theme,
  })
  const trimmedDiagram =
    diagramJson.length > MAX_DIAGRAM_CHARS
      ? `${diagramJson.slice(0, MAX_DIAGRAM_CHARS)}\n...[trimmed]`
      : diagramJson

  const recent = history.slice(-MAX_HISTORY)

  return [
    ...recent,
    {
      role: 'user',
      text: `Current diagram JSON:\n${trimmedDiagram}\n\nUser request:\n${userText}`,
    },
  ]
}
