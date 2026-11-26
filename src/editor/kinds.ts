import type { LucideIcon } from 'lucide-react'
import {
  AlertTriangle,
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
  Square,
  StickyNote,
  Table,
  Timer,
  User,
  UserCheck,
  Workflow,
  Zap,
} from 'lucide-react'
import { emptyRuleMatch, type DiagramNode, type NodeKind, type ShapeType } from '../schema'
import type { DataColorKey } from './colors'

export type KindMeta = {
  kind: NodeKind
  label: string
  hint: string
  icon: LucideIcon
  defaultColor: DataColorKey
  defaultIcon: string
}

export const KIND_META: Record<NodeKind, KindMeta> = {
  start: {
    kind: 'start',
    label: 'Start',
    hint: 'Entry point of the flow',
    icon: CircleDot,
    defaultColor: 'green',
    defaultIcon: 'circle-dot',
  },
  end: {
    kind: 'end',
    label: 'End',
    hint: 'Exit or reject',
    icon: CircleStop,
    defaultColor: 'red',
    defaultIcon: 'circle-stop',
  },
  step: {
    kind: 'step',
    label: 'Step',
    hint: 'A process task',
    icon: Layers,
    defaultColor: 'slate',
    defaultIcon: 'layers',
  },
  decision: {
    kind: 'decision',
    label: 'Decision',
    hint: 'Branch on a condition',
    icon: GitBranch,
    defaultColor: 'amber',
    defaultIcon: 'git-branch',
  },
  switch: {
    kind: 'switch',
    label: 'Switch',
    hint: 'Route by field value',
    icon: GitFork,
    defaultColor: 'amber',
    defaultIcon: 'git-fork',
  },
  loop: {
    kind: 'loop',
    label: 'Loop',
    hint: 'Iterate over a collection',
    icon: RefreshCw,
    defaultColor: 'violet',
    defaultIcon: 'refresh-cw',
  },
  parallelSplit: {
    kind: 'parallelSplit',
    label: 'Parallel split',
    hint: 'Split into parallel paths',
    icon: GitFork,
    defaultColor: 'indigo',
    defaultIcon: 'git-fork',
  },
  parallelJoin: {
    kind: 'parallelJoin',
    label: 'Parallel join',
    hint: 'Wait for parallel paths',
    icon: GitMerge,
    defaultColor: 'indigo',
    defaultIcon: 'git-merge',
  },
  delay: {
    kind: 'delay',
    label: 'Delay',
    hint: 'Wait before continuing',
    icon: Hourglass,
    defaultColor: 'gray',
    defaultIcon: 'hourglass',
  },
  subflow: {
    kind: 'subflow',
    label: 'Sub-flow',
    hint: 'Link to another diagram',
    icon: Workflow,
    defaultColor: 'blue',
    defaultIcon: 'workflow',
  },
  error: {
    kind: 'error',
    label: 'Error',
    hint: 'Fallback or error path',
    icon: AlertTriangle,
    defaultColor: 'red',
    defaultIcon: 'alert-triangle',
  },
  mapping: {
    kind: 'mapping',
    label: 'Transform',
    hint: 'Map and transform fields',
    icon: RefreshCw,
    defaultColor: 'violet',
    defaultIcon: 'refresh-cw',
  },
  integration: {
    kind: 'integration',
    label: 'API call',
    hint: 'Call an API or webhook',
    icon: Plug,
    defaultColor: 'blue',
    defaultIcon: 'plug',
  },
  database: {
    kind: 'database',
    label: 'Database',
    hint: 'Read or write data',
    icon: Database,
    defaultColor: 'blue',
    defaultIcon: 'database',
  },
  inputForm: {
    kind: 'inputForm',
    label: 'Input form',
    hint: 'Collect user input',
    icon: FormInput,
    defaultColor: 'slate',
    defaultIcon: 'form-input',
  },
  output: {
    kind: 'output',
    label: 'Output',
    hint: 'Emit a result payload',
    icon: FileOutput,
    defaultColor: 'green',
    defaultIcon: 'file-output',
  },
  score: {
    kind: 'score',
    label: 'Score',
    hint: 'Run a score or model',
    icon: Gauge,
    defaultColor: 'indigo',
    defaultIcon: 'gauge',
  },
  rule: {
    kind: 'rule',
    label: 'Rule set',
    hint: 'Score or policy rules',
    icon: Scale,
    defaultColor: 'indigo',
    defaultIcon: 'scale',
  },
  lookup: {
    kind: 'lookup',
    label: 'Lookup table',
    hint: 'Look up a value by key',
    icon: Table,
    defaultColor: 'violet',
    defaultIcon: 'table',
  },
  actor: {
    kind: 'actor',
    label: 'User',
    hint: 'Person or actor in the flow',
    icon: User,
    defaultColor: 'pink',
    defaultIcon: 'user',
  },
  approval: {
    kind: 'approval',
    label: 'Approval',
    hint: 'Manual review step',
    icon: UserCheck,
    defaultColor: 'amber',
    defaultIcon: 'user-check',
  },
  notification: {
    kind: 'notification',
    label: 'Notification',
    hint: 'Send email or SMS',
    icon: Bell,
    defaultColor: 'pink',
    defaultIcon: 'bell',
  },
  timer: {
    kind: 'timer',
    label: 'Timer',
    hint: 'Schedule or cron trigger',
    icon: Timer,
    defaultColor: 'gray',
    defaultIcon: 'timer',
  },
  event: {
    kind: 'event',
    label: 'Event',
    hint: 'External event trigger',
    icon: Zap,
    defaultColor: 'amber',
    defaultIcon: 'zap',
  },
  note: {
    kind: 'note',
    label: 'Text',
    hint: 'Annotation on the canvas',
    icon: StickyNote,
    defaultColor: 'yellow',
    defaultIcon: 'sticky-note',
  },
  callout: {
    kind: 'callout',
    label: 'Callout',
    hint: 'Highlighted callout note',
    icon: MessageSquare,
    defaultColor: 'amber',
    defaultIcon: 'message-square',
  },
  image: {
    kind: 'image',
    label: 'Image',
    hint: 'Image by URL',
    icon: ImageIcon,
    defaultColor: 'slate',
    defaultIcon: 'image',
  },
  divider: {
    kind: 'divider',
    label: 'Divider',
    hint: 'Visual separator',
    icon: Minus,
    defaultColor: 'gray',
    defaultIcon: 'minus',
  },
  link: {
    kind: 'link',
    label: 'Link',
    hint: 'Hyperlink annotation',
    icon: Link2,
    defaultColor: 'blue',
    defaultIcon: 'link-2',
  },
  group: {
    kind: 'group',
    label: 'Group',
    hint: 'Coloured segment for related nodes',
    icon: BookOpen,
    defaultColor: 'gray',
    defaultIcon: 'book-open',
  },
  shape: {
    kind: 'shape',
    label: 'Shape',
    hint: 'Diagram shape with text',
    icon: Square,
    defaultColor: 'slate',
    defaultIcon: 'square',
  },
  sticky: {
    kind: 'sticky',
    label: 'Sticky',
    hint: 'Sticky note on the canvas',
    icon: StickyNote,
    defaultColor: 'yellow',
    defaultIcon: 'sticky-note',
  },
  section: {
    kind: 'section',
    label: 'Section',
    hint: 'Titled frame for a set of nodes',
    icon: Frame,
    defaultColor: 'gray',
    defaultIcon: 'frame',
  },
}

export const SHAPE_TYPES: { id: ShapeType; label: string }[] = [
  { id: 'rect', label: 'Rectangle' },
  { id: 'rounded', label: 'Rounded' },
  { id: 'diamond', label: 'Diamond' },
  { id: 'ellipse', label: 'Ellipse' },
  { id: 'parallelogram', label: 'Parallelogram' },
  { id: 'cylinder', label: 'Cylinder' },
  { id: 'document', label: 'Document' },
  { id: 'hexagon', label: 'Hexagon' },
  { id: 'triangle', label: 'Triangle' },
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

export const PALETTE_GROUPS: PaletteGroup[] = [
  {
    id: 'flow',
    label: 'Flow',
    items: [
      { id: 'start', kind: 'start', label: 'Start', hint: 'Entry point of the flow' },
      { id: 'end', kind: 'end', label: 'End', hint: 'Exit or reject' },
      { id: 'step', kind: 'step', label: 'Step', hint: 'A process task' },
      { id: 'decision', kind: 'decision', label: 'Decision', hint: 'Multi-branch condition' },
      { id: 'switch', kind: 'switch', label: 'Switch', hint: 'Route by field value' },
      { id: 'loop', kind: 'loop', label: 'Loop', hint: 'Iterate over a collection' },
      { id: 'parallelSplit', kind: 'parallelSplit', label: 'Parallel split', hint: 'Split into parallel paths' },
      { id: 'parallelJoin', kind: 'parallelJoin', label: 'Parallel join', hint: 'Wait for parallel paths' },
      { id: 'delay', kind: 'delay', label: 'Delay', hint: 'Wait before continuing' },
      { id: 'subflow', kind: 'subflow', label: 'Sub-flow', hint: 'Link to another diagram' },
      { id: 'error', kind: 'error', label: 'Error', hint: 'Fallback or error path' },
      { id: 'group', kind: 'group', label: 'Group', hint: 'Coloured segment for related nodes' },
    ],
  },
  {
    id: 'data',
    label: 'Data and integration',
    items: [
      { id: 'integration', kind: 'integration', label: 'API call', hint: 'Call an API or webhook' },
      { id: 'database', kind: 'database', label: 'Database', hint: 'Read or write data' },
      { id: 'mapping', kind: 'mapping', label: 'Transform', hint: 'Map and transform fields' },
      { id: 'inputForm', kind: 'inputForm', label: 'Input form', hint: 'Collect user input' },
      { id: 'output', kind: 'output', label: 'Output', hint: 'Emit a result payload' },
      { id: 'score', kind: 'score', label: 'Score', hint: 'Run a score or model' },
      { id: 'rule', kind: 'rule', label: 'Rule set', hint: 'Score or policy rules' },
      { id: 'lookup', kind: 'lookup', label: 'Lookup table', hint: 'Look up a value by key' },
    ],
  },
  {
    id: 'people',
    label: 'People and events',
    items: [
      { id: 'actor', kind: 'actor', label: 'User', hint: 'Person or actor in the flow' },
      { id: 'approval', kind: 'approval', label: 'Approval', hint: 'Manual review step' },
      { id: 'notification', kind: 'notification', label: 'Notification', hint: 'Send email or SMS' },
      { id: 'timer', kind: 'timer', label: 'Timer', hint: 'Schedule or cron trigger' },
      { id: 'event', kind: 'event', label: 'Event', hint: 'External event trigger' },
    ],
  },
  {
    id: 'annotate',
    label: 'Annotate',
    items: [
      { id: 'note', kind: 'note', label: 'Text', hint: 'Annotation on the canvas' },
      { id: 'sticky', kind: 'sticky', label: 'Sticky', hint: 'Sticky note on the canvas' },
      { id: 'callout', kind: 'callout', label: 'Callout', hint: 'Highlighted callout note' },
      { id: 'image', kind: 'image', label: 'Image', hint: 'Image by URL' },
      { id: 'section', kind: 'section', label: 'Section', hint: 'Titled frame for a set of nodes' },
      { id: 'divider', kind: 'divider', label: 'Divider', hint: 'Visual separator' },
      { id: 'link', kind: 'link', label: 'Link', hint: 'Hyperlink annotation' },
    ],
  },
  {
    id: 'shapes',
    label: 'Shapes',
    items: SHAPE_TYPES.map((s) => ({
      id: `shape-${s.id}`,
      kind: 'shape' as const,
      label: s.label,
      hint: `${s.label} diagram shape`,
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
