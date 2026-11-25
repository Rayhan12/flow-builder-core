import { Handle, Position, type NodeProps } from '@xyflow/react'
import { Eye, EyeOff } from 'lucide-react'
import { createElement, memo, type CSSProperties, type ReactNode } from 'react'
import { useEditorStore } from '../../store/editorStore'
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
  invalid?: boolean
}

function FlowNodeShellInner({
  data,
  selected,
  children,
  showTarget = true,
  showSource = true,
  sourceHandles,
  compact = false,
  noteStyle = false,
  groupStyle = false,
  invalid = false,
}: Props) {
  const node = data.diagramNode
  const toggleHidden = useEditorStore((s) => s.toggleHidden)
  const meta = KIND_META[node.kind]
  const color = resolveColor(node.color, meta.defaultColor)
  const iconEl = createElement(getLucideIcon(node.icon, meta.icon), {
    size: 16,
    color: selected && !noteStyle && !groupStyle ? '#ffffff' : color.solid,
    strokeWidth: 2,
  })
  const hidden = node.hidden === true

  if (groupStyle) {
    const collapsed = node.kind === 'group' && node.data.collapsed === true
    return (
      <div
        className={`flow-group ${selected ? 'is-selected' : ''} ${collapsed ? 'is-collapsed' : ''}`}
        style={
          {
            '--node-solid': color.solid,
            '--node-tint': color.tint,
            width: '100%',
            height: '100%',
          } as CSSProperties
        }
      >
        <div className="flow-group-label-row">
          {children}
          <div className="flow-group-label">
            {node.kind === 'group' || node.kind === 'section'
              ? node.data.label
              : node.label}
          </div>
          <button
            type="button"
            className="flow-node-hide-btn"
            aria-label={hidden ? 'Show' : 'Hide'}
            data-testid={`node-hide-${node.id}`}
            onClick={(e) => {
              e.stopPropagation()
              toggleHidden([node.id])
            }}
          >
            {hidden ? <EyeOff size={12} /> : <Eye size={12} />}
          </button>
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
        invalid ? 'is-invalid' : '',
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
      {invalid ? <span className="flow-node-error-dot" aria-hidden /> : null}
      {showTarget ? <Handle type="target" position={Position.Top} className="flow-handle" /> : null}

      <button
        type="button"
        className="flow-node-hide-btn"
        aria-label={hidden ? 'Show' : 'Hide'}
        data-testid={`node-hide-${node.id}`}
        onClick={(e) => {
          e.stopPropagation()
          toggleHidden([node.id])
        }}
      >
        {hidden ? <EyeOff size={12} /> : <Eye size={12} />}
      </button>

      <div className="flow-node-header">
        <span className="flow-node-icon" aria-hidden>
          {iconEl}
        </span>
        <div className="flow-node-title-block">
          <span className="flow-node-kind">{meta.label}</span>
          <span className="flow-node-label">{node.label}</span>
        </div>
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
                <span
                  className="flow-branch-chip"
                  style={{ borderColor: branchColor.solid, color: branchColor.solid }}
                >
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

export const FlowNodeShell = memo(FlowNodeShellInner)
