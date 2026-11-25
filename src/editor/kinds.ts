import type { LucideIcon } from 'lucide-react'
import {
  BookOpen,
  CircleDot,
  CircleStop,
  Database,
  GitBranch,
  Layers,
  Plug,
  Scale,
  StickyNote,
} from 'lucide-react'
import type { DiagramNode, NodeKind } from '../schema'
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
    hint: 'A process step',
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
  mapping: {
    kind: 'mapping',
    label: 'Mapping',
    hint: 'Map fields between systems',
    icon: Database,
    defaultColor: 'violet',
    defaultIcon: 'database',
  },
  integration: {
    kind: 'integration',
    label: 'Integration',
    hint: 'Call an API or service',
    icon: Plug,
    defaultColor: 'blue',
    defaultIcon: 'plug',
  },
  rule: {
    kind: 'rule',
    label: 'Rule',
    hint: 'Score or policy rules',
    icon: Scale,
    defaultColor: 'teal',
    defaultIcon: 'scale',
  },
  note: {
    kind: 'note',
    label: 'Note',
    hint: 'Annotation on the canvas',
    icon: StickyNote,
    defaultColor: 'yellow',
    defaultIcon: 'sticky-note',
  },
  group: {
    kind: 'group',
    label: 'Group',
    hint: 'Coloured segment for related nodes',
    icon: BookOpen,
    defaultColor: 'gray',
    defaultIcon: 'book-open',
  },
}

export const PALETTE_KINDS: NodeKind[] = [
  'start',
  'end',
  'step',
  'decision',
  'mapping',
  'integration',
  'rule',
  'note',
  'group',
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

export function createNodeOfKind(
  kind: NodeKind,
  position: { x: number; y: number },
  overrides: Partial<Pick<DiagramNode, 'id' | 'label' | 'color' | 'icon'>> = {},
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
        data: {
          branches: [
            { id: 'yes', label: 'Yes', color: 'green' },
            { id: 'no', label: 'No', color: 'red' },
          ],
        },
      }
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
    case 'rule':
      return {
        ...base,
        kind: 'rule',
        data: { rules: [{ condition: '', outcome: '' }] },
      }
    case 'note':
      return {
        ...base,
        kind: 'note',
        data: { text: 'Note' },
      }
    case 'group':
      return {
        ...base,
        kind: 'group',
        size: { w: 360, h: 240 },
        data: { label, color, collapsed: false },
      }
  }
}
