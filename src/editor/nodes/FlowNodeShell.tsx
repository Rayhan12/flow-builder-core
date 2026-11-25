import { Handle, Position, type NodeProps } from '@xyflow/react'
import { createElement, type CSSProperties, type ReactNode } from 'react'
import { resolveColor } from '../colors'
import type { FlowNode } from '../flowTypes'
import { getLucideIcon } from '../icons'
import { KIND_META } from '../kinds'

type Props = NodeProps<FlowNode> & {
  children?: ReactNode
  showTarget?: boolean
  showSource?: boolean
  sourceHandles?: Array<{ id: string; label: string; color?: string }>
  compact?: boolean
  noteStyle?: boolean
  groupStyle?: boolean
}

export function FlowNodeShell({
  data,
  selected,
  children,
  showTarget = true,
  showSource = true,
  sourceHandles,
  compact = false,
  noteStyle = false,
  groupStyle = false,
}: Props) {
  const node = data.diagramNode
  const meta = KIND_META[node.kind]
  const color = resolveColor(node.color, meta.defaultColor)
  const iconEl = createElement(getLucideIcon(node.icon, meta.icon), {
    size: 14,
    color: color.solid,
    strokeWidth: 2,
  })

  if (groupStyle) {
    return (
      <div
        className={`flow-group ${selected ? 'is-selected' : ''}`}
        style={
          {
            '--node-solid': color.solid,
            '--node-tint': color.tint,
            width: '100%',
            height: '100%',
          } as CSSProperties
        }
      >
        <div className="flow-group-label">
          {node.kind === 'group' ? node.data.label : node.label}
        </div>
        {showTarget ? <Handle type="target" position={Position.Top} className="flow-handle" /> : null}
        {showSource ? <Handle type="source" position={Position.Bottom} className="flow-handle" /> : null}
      </div>
    )
  }

  return (
    <div
      className={[
        'flow-node',
        compact ? 'flow-node-compact' : '',
        noteStyle ? 'flow-node-note' : '',
        selected ? 'is-selected' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      style={
        {
          '--node-solid': color.solid,
          '--node-tint': color.tint,
        } as CSSProperties
      }
    >
      {showTarget ? <Handle type="target" position={Position.Top} className="flow-handle" /> : null}

      <div className="flow-node-header">
        <span className="flow-node-icon" aria-hidden>
          {iconEl}
        </span>
        <span className="flow-node-label">{node.label}</span>
        <span className="flow-node-kind">{meta.label}</span>
      </div>

      {node.description ? <p className="flow-node-desc">{node.description}</p> : null}
      {children}

      {sourceHandles && sourceHandles.length > 0 ? (
        <div className="flow-node-branches">
          {sourceHandles.map((branch, index) => {
            const left = ((index + 1) / (sourceHandles.length + 1)) * 100
            const branchColor = resolveColor(branch.color, 'amber')
            return (
              <div key={branch.id} className="flow-branch" style={{ left: `${left}%` }}>
                <span className="flow-branch-chip" style={{ borderColor: branchColor.solid, color: branchColor.solid }}>
                  {branch.label}
                </span>
                <Handle
                  type="source"
                  position={Position.Bottom}
                  id={branch.id}
                  className="flow-handle"
                  style={{ left: '50%', background: branchColor.solid }}
                />
              </div>
            )
          })}
        </div>
      ) : showSource ? (
        <Handle type="source" position={Position.Bottom} className="flow-handle" />
      ) : null}
    </div>
  )
}
