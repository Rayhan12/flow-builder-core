import type { LucideIcon } from 'lucide-react'
import {
  AlertTriangle,
  ArrowLeftRight,
  Bell,
  BookOpen,
  CircleDot,
  CircleStop,
  Database,
  FileOutput,
  FormInput,
  Frame,
  Gauge,
  GitBranch,
  GitMerge,
  GitFork,
  Hourglass,
  Image as ImageIcon,
  Layers,
  Link2,
  MessageSquare,
  Minus,
  Plug,
  RefreshCw,
  Scale,
  Split,
  Square,
  StickyNote,
  Table,
  Timer,
  Type,
  User,
  UserCheck,
  Workflow,
  Zap,
} from 'lucide-react'
import { emptyRuleMatch, type DiagramNode, type NodeKind, type ShapeType } from '../schema/index.ts'
import type { DataColorKey } from './colors.ts'

export type KindMeta = {
  kind: NodeKind
  label: string
  /** One-line hint under 60 chars, shown on the node card. */
  hint: string
  /** 2 to 3 sentences: what this is and when to use it. */
  description: string
  /** One concrete example. */
  example: string
  icon: LucideIcon
  defaultColor: DataColorKey
  defaultIcon: string
}

export const KIND_META: Record<NodeKind, KindMeta> = {
  start: {
    kind: 'start',
    label: 'Start',
    hint: 'Entry point of the flow',
    description:
      'Marks where the flow begins. Every diagram should have one clear start so readers know the entry path.',
    example: 'Start of a loan application review.',
    icon: CircleDot,
    defaultColor: 'green',
    defaultIcon: 'circle-dot',
  },
  end: {
    kind: 'end',
    label: 'End',
    hint: 'Exit or reject',
    description:
      'Marks a terminal outcome such as approve, reject, or complete. Use one end per distinct result path.',
    example: 'End: application approved.',
    icon: CircleStop,
    defaultColor: 'red',
    defaultIcon: 'circle-stop',
  },
  step: {
    kind: 'step',
    label: 'Step',
    hint: 'A process task',
    description:
      'A generic work step in the flow. Use it for actions that are not a specialised kind such as API call or rule.',
    example: 'Validate applicant identity documents.',
    icon: Layers,
    defaultColor: 'slate',
    defaultIcon: 'layers',
  },
  decision: {
    kind: 'decision',
    label: 'Decision',
    hint: 'Branch on a condition',
    description:
      'Splits the flow into labelled branches based on a condition. Prefer this when outcomes are Yes/No or a small set of named cases.',
    example: 'Credit score above 700? Yes or No.',
    icon: GitBranch,
    defaultColor: 'amber',
    defaultIcon: 'git-branch',
  },
  switch: {
    kind: 'switch',
    label: 'Switch',
    hint: 'Route by field value',
    description:
      'Routes on the value of a single field, similar to a switch statement. Use when many discrete values need their own path.',
    example: 'Switch on status: pending, active, closed.',
    icon: GitFork,
    defaultColor: 'amber',
    defaultIcon: 'git-fork',
  },
  loop: {
    kind: 'loop',
    label: 'Loop',
    hint: 'Iterate over a collection',
    description:
      'Repeats downstream steps for each item in a collection. Use when the same logic must run per row or per file.',
    example: 'For each uploaded document, extract fields.',
    icon: RefreshCw,
    defaultColor: 'violet',
    defaultIcon: 'refresh-cw',
  },
  parallelSplit: {
    kind: 'parallelSplit',
    label: 'Parallel split',
    hint: 'Split into parallel paths',
    description:
      'Starts several paths that can run at the same time. Pair with a parallel join when you need to wait for them later.',
    example: 'Run fraud check and credit bureau call together.',
    icon: Split,
    defaultColor: 'indigo',
    defaultIcon: 'split',
  },
  parallelJoin: {
    kind: 'parallelJoin',
    label: 'Parallel join',
    hint: 'Wait for parallel paths',
    description:
      'Waits for parallel branches to finish before continuing. Choose wait-for-all or wait-for-any depending on the policy.',
    example: 'Continue only after both bureau and fraud checks return.',
    icon: GitMerge,
    defaultColor: 'indigo',
    defaultIcon: 'git-merge',
  },
  delay: {
    kind: 'delay',
    label: 'Delay',
    hint: 'Wait before continuing',
    description:
      'Pauses the flow for a set duration. Useful for cooling-off periods, retries, or scheduled waits.',
    example: 'Wait 24 hours before sending a reminder.',
    icon: Hourglass,
    defaultColor: 'gray',
    defaultIcon: 'hourglass',
  },
  subflow: {
    kind: 'subflow',
    label: 'Sub-flow',
    hint: 'Link to another diagram',
    description:
      'References another diagram as a reusable unit. Use it to keep large flows modular and share common sub-processes.',
    example: 'Call the shared KYC verification sub-flow.',
    icon: Workflow,
    defaultColor: 'blue',
    defaultIcon: 'workflow',
  },
  error: {
    kind: 'error',
    label: 'Error',
    hint: 'Fallback or error path',
    description:
      'Represents a failure or fallback path. Connect error outcomes here so recovery or alerting stays visible.',
    example: 'API timeout: open a manual review ticket.',
    icon: AlertTriangle,
    defaultColor: 'red',
    defaultIcon: 'alert-triangle',
  },
  mapping: {
    kind: 'mapping',
    label: 'Transform',
    hint: 'Map and transform fields',
    description:
      'Maps fields from one shape to another, optionally with transforms. Use between systems that use different schemas.',
    example: 'Map bureau.score to application.creditScore.',
    icon: ArrowLeftRight,
    defaultColor: 'violet',
    defaultIcon: 'arrow-left-right',
  },
  integration: {
    kind: 'integration',
    label: 'API call',
    hint: 'Call an API or webhook',
    description:
      'Calls an external HTTP API or webhook. Use for third-party services, internal APIs, or event posts.',
    example: 'POST applicant data to the underwriting service.',
    icon: Plug,
    defaultColor: 'blue',
    defaultIcon: 'plug',
  },
  database: {
    kind: 'database',
    label: 'Database',
    hint: 'Read or write data',
    description:
      'Reads or writes a collection or table. Use for lookups, persistence, or updating stored application state.',
    example: 'Load customer record by customerId.',
    icon: Database,
    defaultColor: 'blue',
    defaultIcon: 'database',
  },
  inputForm: {
    kind: 'inputForm',
    label: 'Input form',
    hint: 'Collect user input',
    description:
      'Collects structured input from a user or operator. Use when the flow needs missing fields before continuing.',
    example: 'Ask for employer name and monthly income.',
    icon: FormInput,
    defaultColor: 'slate',
    defaultIcon: 'form-input',
  },
  output: {
    kind: 'output',
    label: 'Output',
    hint: 'Emit a result payload',
    description:
      'Emits a result payload for downstream systems or the caller. Use at the end of a path that returns data.',
    example: 'Return decision, score, and reason codes as JSON.',
    icon: FileOutput,
    defaultColor: 'green',
    defaultIcon: 'file-output',
  },
  score: {
    kind: 'score',
    label: 'Score',
    hint: 'Run a score or model',
    description:
      'Runs a scorecard or model and stores the result. Use when a numeric score drives later decisions.',
    example: 'Compute fraud risk score with threshold 0.8.',
    icon: Gauge,
    defaultColor: 'indigo',
    defaultIcon: 'gauge',
  },
  rule: {
    kind: 'rule',
    label: 'Rule set',
    hint: 'Score or policy rules',
    description:
      'Evaluates a set of policy or scoring rules. Prefer this for explicit if/then business rules that need auditability.',
    example: 'If income < 20k then decline with reason LOW_INCOME.',
    icon: Scale,
    defaultColor: 'indigo',
    defaultIcon: 'scale',
  },
  lookup: {
    kind: 'lookup',
    label: 'Lookup table',
    hint: 'Look up a value by key',
    description:
      'Looks up a value from a table by key. Use for fee schedules, country codes, or other static mappings.',
    example: 'Lookup country risk tier from ISO country code.',
    icon: Table,
    defaultColor: 'violet',
    defaultIcon: 'table',
  },
  actor: {
    kind: 'actor',
    label: 'User',
    hint: 'Person or actor in the flow',
    description:
      'Represents a person or role involved in the process. Useful in swimlane-style or human-in-the-loop diagrams.',
    example: 'Underwriter reviews the flagged application.',
    icon: User,
    defaultColor: 'pink',
    defaultIcon: 'user',
  },
  approval: {
    kind: 'approval',
    label: 'Approval',
    hint: 'Manual review step',
    description:
      'A manual review or sign-off gate. Use when a human must approve, reject, or escalate before the flow continues.',
    example: 'Manager approval required above $10,000.',
    icon: UserCheck,
    defaultColor: 'amber',
    defaultIcon: 'user-check',
  },
  notification: {
    kind: 'notification',
    label: 'Notification',
    hint: 'Send email or SMS',
    description:
      'Sends a message such as email, SMS, or push. Use to inform users or operators about outcomes and next steps.',
    example: 'Email the applicant that documents are needed.',
    icon: Bell,
    defaultColor: 'pink',
    defaultIcon: 'bell',
  },
  timer: {
    kind: 'timer',
    label: 'Timer',
    hint: 'Schedule or cron trigger',
    description:
      'A schedule or cron-style trigger. Use when the flow should start or resume at a specific time.',
    example: 'Every night at 02:00 run batch re-scoring.',
    icon: Timer,
    defaultColor: 'gray',
    defaultIcon: 'timer',
  },
  event: {
    kind: 'event',
    label: 'Event',
    hint: 'External event trigger',
    description:
      'An external event that starts or resumes the flow. Use for webhooks, message bus topics, or domain events.',
    example: 'On payment.received, continue fulfilment.',
    icon: Zap,
    defaultColor: 'amber',
    defaultIcon: 'zap',
  },
  note: {
    kind: 'note',
    label: 'Text',
    hint: 'Annotation on the canvas',
    description:
      'Free-form text annotation on the canvas. Use for comments, TODOs, or explanations that are not part of execution.',
    example: 'Note: legacy path kept for Q1 migration.',
    icon: Type,
    defaultColor: 'yellow',
    defaultIcon: 'type',
  },
  callout: {
    kind: 'callout',
    label: 'Callout',
    hint: 'Highlighted callout note',
    description:
      'A highlighted callout for important guidance. Use sparingly so critical notes stand out from ordinary text.',
    example: 'Callout: never skip sanctions screening.',
    icon: MessageSquare,
    defaultColor: 'amber',
    defaultIcon: 'message-square',
  },
  image: {
    kind: 'image',
    label: 'Image',
    hint: 'Image by URL',
    description:
      'Places an image on the canvas by URL. Useful for screenshots, logos, or reference diagrams beside the flow.',
    example: 'Embed a screenshot of the current policy PDF cover.',
    icon: ImageIcon,
    defaultColor: 'slate',
    defaultIcon: 'image',
  },
  divider: {
    kind: 'divider',
    label: 'Divider',
    hint: 'Visual separator',
    description:
      'A visual separator between regions of the canvas. Use to split phases without creating a group container.',
    example: 'Divider between intake and underwriting phases.',
    icon: Minus,
    defaultColor: 'gray',
    defaultIcon: 'minus',
  },
  link: {
    kind: 'link',
    label: 'Link',
    hint: 'Hyperlink annotation',
    description:
      'A hyperlink annotation to external docs or tools. Use when readers need a quick jump to related material.',
    example: 'Link to the underwriting policy wiki page.',
    icon: Link2,
    defaultColor: 'blue',
    defaultIcon: 'link-2',
  },
  group: {
    kind: 'group',
    label: 'Group',
    hint: 'Coloured segment for related nodes',
    description:
      'A coloured container for related nodes. Use groups to show phases, teams, or logical segments that can collapse.',
    example: 'Group all KYC steps under Identity.',
    icon: BookOpen,
    defaultColor: 'gray',
    defaultIcon: 'book-open',
  },
  shape: {
    kind: 'shape',
    label: 'Shape',
    hint: 'Diagram shape with text',
    description:
      'A freeform diagram shape with optional text. Use shapes for sketching structure alongside executable nodes.',
    example: 'Diamond shape labelled Need more info?.',
    icon: Square,
    defaultColor: 'slate',
    defaultIcon: 'square',
  },
  sticky: {
    kind: 'sticky',
    label: 'Sticky',
    hint: 'Sticky note on the canvas',
    description:
      'A sticky note for informal comments during design. Stickies are for brainstorming, not for executable steps.',
    example: 'Sticky: confirm SLA with ops before ship.',
    icon: StickyNote,
    defaultColor: 'yellow',
    defaultIcon: 'sticky-note',
  },
  section: {
    kind: 'section',
    label: 'Section',
    hint: 'Titled frame for a set of nodes',
    description:
      'A titled frame that holds a set of nodes. Prefer sections for larger stages that need a clear heading.',
    example: 'Section: Post-decision notifications.',
    icon: Frame,
    defaultColor: 'gray',
    defaultIcon: 'frame',
  },
}

export const SHAPE_TYPES: { id: ShapeType; label: string; hint: string }[] = [
  { id: 'rect', label: 'Rectangle', hint: 'Process or step' },
  { id: 'rounded', label: 'Rounded', hint: 'Start, end or soft step' },
  { id: 'diamond', label: 'Diamond', hint: 'Decision point' },
  { id: 'ellipse', label: 'Ellipse', hint: 'Start or end terminal' },
  { id: 'parallelogram', label: 'Parallelogram', hint: 'Input or output' },
  { id: 'cylinder', label: 'Cylinder', hint: 'Database or storage' },
  { id: 'document', label: 'Document', hint: 'Report or file' },
  { id: 'hexagon', label: 'Hexagon', hint: 'Preparation or setup' },
  { id: 'triangle', label: 'Triangle', hint: 'Merge or extract' },
]

export type PaletteItem = {
  id: string
  kind: NodeKind
  label: string
  hint: string
  shape?: ShapeType
}

export type PaletteGroup = {
  id: string
  label: string
  items: PaletteItem[]
}

function paletteItem(kind: NodeKind, overrides?: Partial<Omit<PaletteItem, 'kind'>>): PaletteItem {
  const meta = KIND_META[kind]
  return {
    id: overrides?.id ?? kind,
    kind,
    label: overrides?.label ?? meta.label,
    hint: overrides?.hint ?? meta.description,
    shape: overrides?.shape,
  }
}

export const PALETTE_GROUPS: PaletteGroup[] = [
  {
    id: 'flow',
    label: 'Flow',
    items: [
      paletteItem('start'),
      paletteItem('end'),
      paletteItem('step'),
      paletteItem('decision'),
      paletteItem('switch'),
      paletteItem('loop'),
      paletteItem('parallelSplit'),
      paletteItem('parallelJoin'),
      paletteItem('delay'),
      paletteItem('subflow'),
      paletteItem('error'),
      paletteItem('group'),
    ],
  },
  {
    id: 'data',
    label: 'Data and integration',
    items: [
      paletteItem('integration'),
      paletteItem('database'),
      paletteItem('mapping'),
      paletteItem('inputForm'),
      paletteItem('output'),
      paletteItem('score'),
      paletteItem('rule'),
      paletteItem('lookup'),
    ],
  },
  {
    id: 'people',
    label: 'People and events',
    items: [
      paletteItem('actor'),
      paletteItem('approval'),
      paletteItem('notification'),
      paletteItem('timer'),
      paletteItem('event'),
    ],
  },
  {
    id: 'annotate',
    label: 'Annotate',
    items: [
      paletteItem('note'),
      paletteItem('sticky'),
      paletteItem('callout'),
      paletteItem('image'),
      paletteItem('section'),
      paletteItem('divider'),
      paletteItem('link'),
    ],
  },
  {
    id: 'shapes',
    label: 'Shapes',
    items: SHAPE_TYPES.map((s) => ({
      id: `shape-${s.id}`,
      kind: 'shape' as const,
      label: s.label,
      hint: s.hint,
      shape: s.id,
    })),
  },
]

/** Flat list of unique NodeKinds for code that still iterates kinds. */
export const PALETTE_KINDS: NodeKind[] = [
  ...new Set(PALETTE_GROUPS.flatMap((g) => g.items.map((i) => i.kind))),
]

let idCounter = 0

export function newNodeId(prefix = 'n'): string {
  idCounter += 1
  const raw =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().replace(/-/g, '').slice(0, 10)
      : `${Date.now().toString(36)}${idCounter}`
  return `${prefix}_${raw}`
}

export function newEdgeId(): string {
  return newNodeId('e')
}

function defaultBranches() {
  return [
    { id: 'yes', label: 'Yes', color: 'green' },
    { id: 'no', label: 'No', color: 'red' },
  ]
}

export function createNodeOfKind(
  kind: NodeKind,
  position: { x: number; y: number },
  overrides: Partial<Pick<DiagramNode, 'id' | 'label' | 'color' | 'icon'>> & {
    shape?: ShapeType
  } = {},
): DiagramNode {
  const meta = KIND_META[kind]
  const id = overrides.id ?? newNodeId()
  const label = overrides.label ?? meta.label
  const color = overrides.color ?? meta.defaultColor
  const icon = overrides.icon ?? meta.defaultIcon
  const base = { id, label, color, icon, position }

  switch (kind) {
    case 'start':
      return { ...base, kind: 'start', data: {} }
    case 'end':
      return { ...base, kind: 'end', data: {} }
    case 'step':
      return { ...base, kind: 'step', data: {} }
    case 'decision':
      return {
        ...base,
        kind: 'decision',
        size: { w: 256, h: 152 },
        data: {
          mode: 'branches',
          branchHandleSide: 'bottom',
          branches: defaultBranches(),
        },
      }
    case 'switch':
      return {
        ...base,
        kind: 'switch',
        size: { w: 256, h: 152 },
        data: {
          mode: 'switch',
          switchField: 'field',
          branchHandleSide: 'bottom',
          branches: [
            { id: 'case_a', label: 'Case A', color: 'green' },
            { id: 'default', label: 'Default', color: 'gray', isDefault: true },
          ],
        },
      }
    case 'loop':
      return { ...base, kind: 'loop', data: { collection: 'items' } }
    case 'parallelSplit':
      return { ...base, kind: 'parallelSplit', data: { branches: ['A', 'B'] } }
    case 'parallelJoin':
      return { ...base, kind: 'parallelJoin', data: { waitFor: 'all' } }
    case 'delay':
      return { ...base, kind: 'delay', data: { durationMs: 1000 } }
    case 'subflow':
      return { ...base, kind: 'subflow', data: { diagramTitle: '' } }
    case 'error':
      return { ...base, kind: 'error', data: { message: 'Error' } }
    case 'mapping':
      return {
        ...base,
        kind: 'mapping',
        data: { mappings: [{ from: '', to: '' }] },
      }
    case 'integration':
      return {
        ...base,
        kind: 'integration',
        data: { service: 'Service', method: 'POST' },
      }
    case 'database':
      return { ...base, kind: 'database', data: { operation: 'query', collection: '' } }
    case 'inputForm':
      return { ...base, kind: 'inputForm', data: { fields: [{ name: 'field1' }] } }
    case 'output':
      return { ...base, kind: 'output', data: { format: 'json' } }
    case 'score':
      return { ...base, kind: 'score', data: { model: 'model', threshold: 0.5 } }
    case 'rule':
      return {
        ...base,
        kind: 'rule',
        data: {
          rules: [
            {
              id: newNodeId('rule'),
              outcome: 'Approve',
              match: emptyRuleMatch(),
              condition: '',
            },
          ],
        },
      }
    case 'lookup':
      return { ...base, kind: 'lookup', data: { table: '', keyField: 'key', valueField: 'value' } }
    case 'actor':
      return { ...base, kind: 'actor', data: { role: 'User' } }
    case 'approval':
      return { ...base, kind: 'approval', data: { assignees: [] } }
    case 'notification':
      return { ...base, kind: 'notification', data: { channel: 'email', template: '' } }
    case 'timer':
      return { ...base, kind: 'timer', data: { cron: '0 * * * *' } }
    case 'event':
      return { ...base, kind: 'event', data: { eventName: 'event' } }
    case 'note':
      return {
        ...base,
        kind: 'note',
        data: { text: 'Note' },
      }
    case 'callout':
      return { ...base, kind: 'callout', data: { text: 'Callout', tone: 'info' } }
    case 'image':
      return { ...base, kind: 'image', data: { url: '', alt: label } }
    case 'divider':
      return {
        ...base,
        kind: 'divider',
        size: { w: 240, h: 24 },
        data: { orientation: 'horizontal' },
      }
    case 'link':
      return { ...base, kind: 'link', data: { href: 'https://', title: label } }
    case 'group':
      return {
        ...base,
        kind: 'group',
        size: { w: 360, h: 240 },
        zIndex: -1,
        data: { label, color, collapsed: false },
      }
    case 'shape':
      return {
        ...base,
        kind: 'shape',
        size: { w: 160, h: 96 },
        data: { shape: overrides.shape ?? 'rect', text: label },
        style: { fill: '#f1f5f9', stroke: '#64748b', strokeWidth: 1.5 },
      }
    case 'sticky':
      return {
        ...base,
        kind: 'sticky',
        size: { w: 192, h: 160 },
        data: { text: 'Sticky note' },
      }
    case 'section':
      return {
        ...base,
        kind: 'section',
        size: { w: 480, h: 320 },
        zIndex: -2,
        data: { label, color, collapsed: false },
      }
  }
}
