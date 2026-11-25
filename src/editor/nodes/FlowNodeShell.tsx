import { Handle, Position, type NodeProps } from '@xyflow/react'
import { Eye, EyeOff } from 'lucide-react'
import { createElement, memo, type CSSProperties, type ReactNode } from 'react'
import { useEditorStore } from '../../store/editorStore'
import { resolveColor } from '../colors'
import {
  BRANCHES_PER_ROW,
  decisionBranchColumns,
} from '../decisionLayout'
import type { FlowNode } from '../flowTypes'
import { getLucideIcon } from '../icons'
import { KIND_META } from '../kinds'
import { SideHandles, type SideHandleId } from './SideHandles'

type BranchHandle = { id: string; label: string; color?: string }

type Props = NodeProps<FlowNode> & {
  children?: ReactNode
  showTarget?: boolean
  showSource?: boolean
  sourceHandles?: BranchHandle[]
  /** Side for decision branch handles; other three sides stay as general connectors. */
  branchHandleSide?: 'bottom' | 'right'
  compact?: boolean
  noteStyle?: boolean
  groupStyle?: boolean
  invalid?: boolean
  /** Hide the default header (sticky uses its own chrome). */
  hideHeader?: boolean
  /** Skip default side handles (caller renders its own). */
  noSideHandles?: boolean
}

function FlowNodeShellInner({
  data,
  selected,
  children,
  showTarget = true,
  showSource = true,
  sourceHandles,
  branchHandleSide = 'bottom',
  compact = false,
  noteStyle = false,
  groupStyle = false,
  invalid = false,
  hideHeader = false,
  noSideHandles = false,
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
  const hasBranches = Boolean(sourceHandles && sourceHandles.length > 0)
  const omitSides: SideHandleId[] = []
  if (hasBranches) {
    omitSides.push(branchHandleSide)
  }

  if (groupStyle) {
    // Legacy path kept for note-style callers; GroupNode uses its own chrome.
    const collapsed =
      (node.kind === 'group' || node.kind === 'section') && node.data.collapsed === true
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
        {!noSideHandles ? <SideHandles /> : null}
      </div>
    )
  }

  const branchCount = sourceHandles?.length ?? 0
  const cols = decisionBranchColumns(branchCount)

  return (
    <div
      className={[
        'flow-node',
        compact ? 'flow-node-compact' : '',
        noteStyle ? 'flow-node-note' : '',
        hasBranches ? 'flow-node-decision' : '',
        selected ? 'is-selected' : '',
        invalid ? 'is-invalid' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      style={
        {
          '--node-solid': color.solid,
          '--node-tint': color.tint,
          ...(hasBranches
            ? {
                width: '100%',
                minWidth: cols * 96,
              }
            : {}),
        } as CSSProperties
      }
      data-testid={hasBranches ? 'decision-card' : undefined}
    >
      {invalid ? <span className="flow-node-error-dot" aria-hidden /> : null}

      {!hideHeader ? (
        <>
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
        </>
      ) : null}

      {children}

      {hasBranches && sourceHandles ? (
        <div
          className={`flow-node-branches side-${branchHandleSide}`}
          style={{
            gridTemplateColumns: `repeat(${Math.min(branchCount, BRANCHES_PER_ROW)}, minmax(96px, 1fr))`,
          }}
          data-testid="decision-branch-row"
        >
          {sourceHandles.map((branch) => {
            const branchColor = resolveColor(branch.color, 'amber')
            return (
              <div key={branch.id} className="flow-branch" data-testid="decision-branch-pill">
                <span
                  className="flow-branch-chip"
                  style={{ borderColor: branchColor.solid, color: branchColor.solid }}
                  title={branch.label}
                >
                  {branch.label}
                </span>
                <Handle
                  type="source"
                  position={branchHandleSide === 'right' ? Position.Right : Position.Bottom}
                  id={branch.id}
                  className="flow-handle"
                  style={{ background: branchColor.solid }}
                />
              </div>
            )
          })}
        </div>
      ) : null}

      {!noSideHandles && (showTarget || showSource || hasBranches) ? (
        <SideHandles omit={omitSides} />
      ) : null}
    </div>
  )
}

export const FlowNodeShell = memo(FlowNodeShellInner)
