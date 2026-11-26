import { Handle, Position, useUpdateNodeInternals, type NodeProps } from '@xyflow/react'
import { Eye, EyeOff } from 'lucide-react'
import {
  createElement,
  memo,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react'
import { useEditorStore } from '../../store/editorStore'
import { resolveColor } from '../colors'
import {
  BRANCHES_PER_ROW,
  branchSlotWidth,
  decisionBranchColumns,
} from '../decisionLayout'
import type { FlowNode } from '../flowTypes'
import { getLucideIcon } from '../icons'
import { KIND_META } from '../kinds'
import { readShowNodeHints } from '../nodeHints'
import { ExpandableText } from '../ui/ExpandableText'
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

function useShowNodeHints(): boolean {
  const [show, setShow] = useState(readShowNodeHints)
  useEffect(() => {
    function onChange(e: Event) {
      const detail = (e as CustomEvent<boolean>).detail
      if (typeof detail === 'boolean') setShow(detail)
      else setShow(readShowNodeHints())
    }
    window.addEventListener('fb:node-hints', onChange)
    window.addEventListener('storage', onChange)
    return () => {
      window.removeEventListener('fb:node-hints', onChange)
      window.removeEventListener('storage', onChange)
    }
  }, [])
  return show
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
  const updateNodeInternals = useUpdateNodeInternals()
  const branchRowRef = useRef<HTMLDivElement>(null)
  const showHints = useShowNodeHints()
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

  const branchKey = sourceHandles?.map((b) => `${b.id}:${b.label}`).join('|')

  useEffect(() => {
    if (!hasBranches) return
    const el = branchRowRef.current
    if (!el) return

    function refresh() {
      if (typeof DOMMatrixReadOnly === 'undefined') return
      try {
        updateNodeInternals(node.id)
      } catch {
        /* ignore in non-browser */
      }
    }

    refresh()
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => refresh()) : null
    ro?.observe(el)
    document.fonts?.ready?.then(() => refresh()).catch(() => undefined)
    return () => ro?.disconnect()
  }, [
    hasBranches,
    branchKey,
    branchHandleSide,
    node.id,
    updateNodeInternals,
    node.size?.w,
    node.size?.h,
  ])

  if (groupStyle) {
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
  const maxSlot = sourceHandles
    ? Math.max(...sourceHandles.map((b) => branchSlotWidth(b.label)), 96)
    : 96

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
                minWidth: cols * maxSlot + 24,
              }
            : {}),
        } as CSSProperties
      }
      data-testid={hasBranches ? 'decision-card' : undefined}
      data-kind={node.kind}
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

          {node.description ? (
            <ExpandableText
              text={node.description}
              className="flow-node-desc-wrap"
              testId={`node-desc-${node.id}`}
            />
          ) : null}
        </>
      ) : null}

      {children}

      {showHints && !hideHeader && !noteStyle && !groupStyle ? (
        <p className="flow-node-hint" data-testid="node-kind-hint">
          {meta.hint}
        </p>
      ) : null}

      {hasBranches && sourceHandles ? (
        <>
          <div
            ref={branchRowRef}
            className={`flow-node-branches side-${branchHandleSide}`}
            style={{
              gridTemplateColumns: `repeat(${Math.min(branchCount, BRANCHES_PER_ROW)}, minmax(${maxSlot}px, 1fr))`,
            }}
            data-testid="decision-branch-row"
          >
            {sourceHandles.map((branch) => {
              const branchColor = resolveColor(branch.color, 'amber')
              return (
                <div
                  key={branch.id}
                  className="flow-branch"
                  data-testid="decision-branch-pill"
                  data-branch-id={branch.id}
                >
                  <span
                    className="flow-branch-chip"
                    style={{ borderColor: branchColor.solid, color: branchColor.solid }}
                    title={branch.label}
                    data-tooltip={branch.label}
                    aria-label={branch.label}
                  >
                    {branch.label}
                  </span>
                  {/* Visual handle marker aligned with the real RF handle on the card edge */}
                  <span
                    className="flow-branch-handle-dot"
                    style={{ background: branchColor.solid }}
                    aria-hidden
                  />
                </div>
              )
            })}
          </div>
          {sourceHandles.map((branch, index) => {
            const branchColor = resolveColor(branch.color, 'amber')
            const colCount = Math.min(branchCount, BRANCHES_PER_ROW)
            const col = index % colCount
            const row = Math.floor(index / BRANCHES_PER_ROW)
            const rows = Math.max(1, Math.ceil(branchCount / BRANCHES_PER_ROW))
            const leftPct = ((col + 0.5) / colCount) * 100
            const topPct = ((row + 0.5) / rows) * 100
            return (
              <Handle
                key={`bh-${branch.id}`}
                type="source"
                position={branchHandleSide === 'right' ? Position.Right : Position.Bottom}
                id={branch.id}
                className="flow-handle flow-branch-handle"
                style={
                  branchHandleSide === 'right'
                    ? { background: branchColor.solid, top: `${topPct}%` }
                    : { background: branchColor.solid, left: `${leftPct}%` }
                }
                data-branch-handle={branch.id}
              />
            )
          })}
        </>
      ) : null}

      {!noSideHandles && (showTarget || showSource || hasBranches) ? (
        <SideHandles omit={omitSides} noQuickAdd={hasBranches} />
      ) : null}
    </div>
  )
}

export const FlowNodeShell = memo(FlowNodeShellInner)
