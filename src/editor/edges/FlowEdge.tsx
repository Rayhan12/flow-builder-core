import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  getSmoothStepPath,
  getStraightPath,
  type EdgeProps,
} from '@xyflow/react'
import { Plus, Type } from 'lucide-react'
import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react'
import type { NodeKind } from '../../schema'
import { useEditorStore } from '../../store/editorStore'
import { resolveColor } from '../colors'
import type { FlowEdge as FlowEdgeType } from '../flowTypes'
import { KIND_META } from '../kinds'

const INSERT_KINDS: NodeKind[] = ['step', 'decision', 'rule', 'mapping', 'integration', 'note']

function pointAlongPath(
  path: string,
  t: number,
): { x: number; y: number } {
  if (typeof document === 'undefined') return { x: 0, y: 0 }
  const el = document.createElementNS('http://www.w3.org/2000/svg', 'path')
  el.setAttribute('d', path)
  const len = el.getTotalLength()
  if (!len) return { x: 0, y: 0 }
  const p = el.getPointAtLength(Math.max(0, Math.min(1, t)) * len)
  return { x: p.x, y: p.y }
}

export function FlowEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  selected,
  label,
  markerEnd,
}: EdgeProps<FlowEdgeType>) {
  const edge = data?.diagramEdge
  const edgeType = edge?.type ?? 'elbow'

  const [path, midX, midY] =
    edgeType === 'straight'
      ? getStraightPath({ sourceX, sourceY, targetX, targetY })
      : edgeType === 'curved'
        ? getBezierPath({
            sourceX,
            sourceY,
            targetX,
            targetY,
            sourcePosition,
            targetPosition,
          })
        : getSmoothStepPath({
            sourceX,
            sourceY,
            targetX,
            targetY,
            sourcePosition,
            targetPosition,
            borderRadius: 8,
          })

  const labelT = edge?.labelPosition ?? 0.5
  const labelPoint =
    labelT === 0.5 ? { x: midX, y: midY } : pointAlongPath(path, labelT)

  const insertNodeOnEdge = useEditorStore((s) => s.insertNodeOnEdge)
  const updateEdge = useEditorStore((s) => s.updateEdge)
  const [hovered, setHovered] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(typeof label === 'string' ? label : '')
  const wrapRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const color = resolveColor(edge?.color, 'gray')
  const isNeutral = color.solid === '#98a2b3'
  const stroke = selected
    ? 'var(--color-accent)'
    : isNeutral
      ? '#8b8d98'
      : color.solid
  const strokeWidth = edge?.style?.width ?? (selected ? 2 : 1.5)
  const dash = edge?.style?.dash === 'dashed' ? '6 4' : undefined

  useEffect(() => {
    if (!menuOpen) return
    function onDoc(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) {
        setMenuOpen(false)
        setHovered(false)
      }
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [menuOpen])

  useEffect(() => {
    if (editing) {
      setDraft(typeof label === 'string' ? label : '')
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [editing, label])

  function onInsert(kind: NodeKind) {
    insertNodeOnEdge(id, kind)
    setMenuOpen(false)
    setHovered(false)
  }

  function commitLabel() {
    const next = draft.trim()
    updateEdge(id, { label: next || undefined })
    setEditing(false)
  }

  function startAddLabel(e: ReactMouseEvent) {
    e.stopPropagation()
    setDraft(typeof label === 'string' && label ? label : '')
    setEditing(true)
  }

  function onLabelPointerDown(e: React.PointerEvent) {
    if (editing || e.detail > 1) return
    e.stopPropagation()
    const startX = e.clientX
    const startT = labelT
    const dxTotal = Math.max(Math.abs(targetX - sourceX), 1)
    let dragging = false

    function onMove(ev: PointerEvent) {
      if (!dragging && Math.abs(ev.clientX - startX) < 4) return
      dragging = true
      const delta = (ev.clientX - startX) / dxTotal
      const next = Math.max(0.05, Math.min(0.95, startT + delta))
      updateEdge(id, { labelPosition: next })
    }
    function onUp() {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  const showLabel = Boolean(label) || editing

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        markerEnd={markerEnd}
        style={{ stroke, strokeWidth, strokeDasharray: dash }}
        interactionWidth={24}
      />
      <EdgeLabelRenderer>
        <div
          ref={wrapRef}
          className="flow-edge-midpoint"
          style={{
            position: 'absolute',
            transform: `translate(-50%, -50%) translate(${labelPoint.x}px, ${labelPoint.y}px)`,
            pointerEvents: 'all',
          }}
          data-testid="edge-midpoint"
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => {
            if (!menuOpen && !editing) setHovered(false)
          }}
          onDoubleClick={(e) => {
            e.stopPropagation()
            setEditing(true)
          }}
        >
          {showLabel ? (
            editing ? (
              <input
                ref={inputRef}
                className="flow-edge-label-input"
                value={draft}
                aria-label="Edge label"
                data-testid="edge-label-input"
                maxLength={200}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={commitLabel}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitLabel()
                  if (e.key === 'Escape') {
                    setDraft(typeof label === 'string' ? label : '')
                    setEditing(false)
                  }
                }}
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <div
                className={`flow-edge-label ${selected ? 'is-selected' : ''}`}
                data-testid="edge-label"
                onPointerDown={onLabelPointerDown}
                onDoubleClick={(e) => {
                  e.stopPropagation()
                  setEditing(true)
                }}
                title="Drag to move along the path. Double-click to edit."
              >
                {label}
              </div>
            )
          ) : null}

          <div className="flow-edge-actions">
            <button
              type="button"
              className={`flow-edge-insert ${hovered || menuOpen || selected || editing ? 'is-visible' : ''} ${menuOpen ? 'is-open' : ''}`}
              aria-label="Insert node on this connection"
              title="Insert node"
              onClick={(e) => {
                e.stopPropagation()
                setMenuOpen((v) => !v)
              }}
            >
              <Plus size={12} strokeWidth={2.5} />
            </button>
            {!showLabel ? (
              <button
                type="button"
                className={`flow-edge-add-label ${hovered || selected ? 'is-visible' : ''}`}
                aria-label="Add label"
                title="Add label"
                data-testid="edge-add-label"
                onClick={startAddLabel}
              >
                <Type size={11} strokeWidth={2.5} />
              </button>
            ) : null}
          </div>

          {menuOpen ? (
            <div className="flow-edge-insert-menu" role="menu">
              {INSERT_KINDS.map((kind) => {
                const meta = KIND_META[kind]
                const Icon = meta.icon
                return (
                  <button
                    key={kind}
                    type="button"
                    className="flow-edge-insert-item"
                    role="menuitem"
                    onClick={(e) => {
                      e.stopPropagation()
                      onInsert(kind)
                    }}
                  >
                    <Icon size={14} aria-hidden />
                    {meta.label}
                  </button>
                )
              })}
            </div>
          ) : null}
        </div>
      </EdgeLabelRenderer>
    </>
  )
}
