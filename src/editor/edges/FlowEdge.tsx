import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  getSmoothStepPath,
  getStraightPath,
  type EdgeProps,
} from '@xyflow/react'
import { Plus, Type } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react'
import type { NodeKind } from '../../schema'
import { useEditorStore } from '../../store/editorStore'
import { resolveColor } from '../colors'
import type { FlowEdge as FlowEdgeType } from '../flowTypes'
import { KIND_META } from '../kinds'
import { needsCustomMarker } from './edgeMarkers'

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

function buildWaypointPath(
  sourceX: number,
  sourceY: number,
  targetX: number,
  targetY: number,
  waypoints: Array<{ x: number; y: number }>,
  edgeType: 'elbow' | 'straight' | 'curved',
): [string, number, number] {
  if (!waypoints.length) {
    if (edgeType === 'straight') {
      const [d, lx, ly] = getStraightPath({ sourceX, sourceY, targetX, targetY })
      return [d, lx, ly]
    }
    if (edgeType === 'curved') {
      const [d, lx, ly] = getBezierPath({ sourceX, sourceY, targetX, targetY })
      return [d, lx, ly]
    }
    const [d, lx, ly] = getSmoothStepPath({
      sourceX,
      sourceY,
      targetX,
      targetY,
      borderRadius: 8,
    })
    return [d, lx, ly]
  }

  const points = [{ x: sourceX, y: sourceY }, ...waypoints, { x: targetX, y: targetY }]
  if (edgeType === 'straight') {
    const d = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')
    const mid = points[Math.floor(points.length / 2)]
    return [d, mid.x, mid.y]
  }

  // Elbow / curved with waypoints: orthogonal segments through each bend.
  let d = `M ${points[0].x} ${points[0].y}`
  for (let i = 1; i < points.length; i += 1) {
    const prev = points[i - 1]
    const cur = points[i]
    if (edgeType === 'curved') {
      const cx = (prev.x + cur.x) / 2
      const cy = (prev.y + cur.y) / 2
      d += ` Q ${cx} ${prev.y} ${cx} ${cy} Q ${cx} ${cur.y} ${cur.x} ${cur.y}`
    } else {
      const midX = cur.x
      const midY = prev.y
      d += ` L ${midX} ${midY} L ${cur.x} ${cur.y}`
    }
  }
  const mid = points[Math.floor(points.length / 2)]
  return [d, mid.x, mid.y]
}

function CustomMarkerDefs({
  id,
  color,
  start,
  end,
}: {
  id: string
  color: string
  start?: 'circle' | 'diamond'
  end?: 'circle' | 'diamond'
}) {
  return (
    <defs>
      {start === 'circle' ? (
        <marker
          id={`${id}-start-circle`}
          markerWidth="10"
          markerHeight="10"
          refX="5"
          refY="5"
          orient="auto"
          markerUnits="userSpaceOnUse"
        >
          <circle cx="5" cy="5" r="3.5" fill={color} />
        </marker>
      ) : null}
      {start === 'diamond' ? (
        <marker
          id={`${id}-start-diamond`}
          markerWidth="12"
          markerHeight="12"
          refX="6"
          refY="6"
          orient="auto"
          markerUnits="userSpaceOnUse"
        >
          <path d="M6 1 L11 6 L6 11 L1 6 Z" fill={color} />
        </marker>
      ) : null}
      {end === 'circle' ? (
        <marker
          id={`${id}-end-circle`}
          markerWidth="10"
          markerHeight="10"
          refX="5"
          refY="5"
          orient="auto"
          markerUnits="userSpaceOnUse"
        >
          <circle cx="5" cy="5" r="3.5" fill={color} />
        </marker>
      ) : null}
      {end === 'diamond' ? (
        <marker
          id={`${id}-end-diamond`}
          markerWidth="12"
          markerHeight="12"
          refX="6"
          refY="6"
          orient="auto"
          markerUnits="userSpaceOnUse"
        >
          <path d="M6 1 L11 6 L6 11 L1 6 Z" fill={color} />
        </marker>
      ) : null}
    </defs>
  )
}

export function FlowEdge({
  id,
  source,
  sourceHandleId,
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
  markerStart,
}: EdgeProps<FlowEdgeType>) {
  const edge = data?.diagramEdge
  const edgeType = edge?.type ?? 'elbow'
  const waypoints = edge?.waypoints ?? []
  const branchHandleId = edge?.sourceHandle ?? sourceHandleId ?? undefined
  const sourceNode = useEditorStore((s) => s.diagram?.nodes.find((n) => n.id === source))
  const branchChipLabel =
    sourceNode &&
    (sourceNode.kind === 'decision' || sourceNode.kind === 'switch') &&
    branchHandleId
      ? sourceNode.data.branches.find((b) => b.id === branchHandleId)?.label
      : undefined
  // Chip already names the branch — hide duplicate edge labels so they don't stack under the card.
  const isDuplicateBranchLabel =
    typeof label === 'string' && Boolean(branchChipLabel) && label === branchChipLabel

  const [path, midX, midY] = useMemo(() => {
    if (waypoints.length) {
      return buildWaypointPath(sourceX, sourceY, targetX, targetY, waypoints, edgeType)
    }
    if (edgeType === 'straight') {
      const [d, lx, ly] = getStraightPath({ sourceX, sourceY, targetX, targetY })
      return [d, lx, ly] as [string, number, number]
    }
    if (edgeType === 'curved') {
      const [d, lx, ly] = getBezierPath({
        sourceX,
        sourceY,
        targetX,
        targetY,
        sourcePosition,
        targetPosition,
      })
      return [d, lx, ly] as [string, number, number]
    }
    const [d, lx, ly] = getSmoothStepPath({
      sourceX,
      sourceY,
      targetX,
      targetY,
      sourcePosition,
      targetPosition,
      borderRadius: 8,
    })
    return [d, lx, ly] as [string, number, number]
    // waypoints contents are stable per edge update; length+coords change with the edge object.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: waypoints array identity changes every render
  }, [
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    edgeType,
    waypoints,
  ])

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

  const color = resolveColor(edge?.style?.color ?? edge?.color, 'gray')
  const isNeutral = color.solid === '#98a2b3'
  const stroke = selected
    ? 'var(--color-accent)'
    : isNeutral
      ? '#8b8d98'
      : color.solid
  const strokeWidth = edge?.style?.width ?? (selected ? 2 : 1.5)
  const dash = edge?.style?.dash === 'dashed' ? '6 4' : undefined

  const startCustom = needsCustomMarker(edge?.startMarker) ? edge?.startMarker : undefined
  const endCustom = needsCustomMarker(edge?.endMarker) ? edge?.endMarker : undefined

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

  function onWaypointPointerDown(index: number, e: React.PointerEvent) {
    e.stopPropagation()
    e.preventDefault()
    const start = waypoints[index]
    if (!start) return
    const originX = e.clientX
    const originY = e.clientY
    // Approximate flow delta using screen pixels (viewport handled roughly via zoom from path).
    const zoom = 1

    function onMove(ev: PointerEvent) {
      const dx = (ev.clientX - originX) / zoom
      const dy = (ev.clientY - originY) / zoom
      const next = waypoints.map((wp, i) =>
        i === index ? { x: start.x + dx, y: start.y + dy } : wp,
      )
      updateEdge(id, { waypoints: next })
    }
    function onUp() {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  function addWaypointFromMid(e: React.PointerEvent) {
    if (edgeType === 'curved') return
    e.stopPropagation()
    const point = { x: midX, y: midY }
    const next = [...waypoints, point]
    updateEdge(id, { waypoints: next })
  }

  function removeWaypoint(index: number) {
    const next = waypoints.filter((_, i) => i !== index)
    updateEdge(id, { waypoints: next.length ? next : undefined })
  }

  const showLabel = (Boolean(label) && !isDuplicateBranchLabel) || editing
  const markerStartUrl = startCustom ? `url(#${id}-start-${startCustom})` : markerStart
  const markerEndUrl = endCustom ? `url(#${id}-end-${endCustom})` : markerEnd

  return (
    <>
      {(startCustom || endCustom) && (
        <svg style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden' }}>
          <CustomMarkerDefs id={id} color={stroke} start={startCustom} end={endCustom} />
        </svg>
      )}
      <BaseEdge
        id={id}
        path={path}
        markerStart={markerStartUrl}
        markerEnd={markerEndUrl}
        style={{ stroke, strokeWidth, strokeDasharray: dash }}
        interactionWidth={24}
      />
      <EdgeLabelRenderer>
        {selected && edgeType !== 'curved'
          ? waypoints.map((wp, index) => (
              <div
                key={`wp-${index}`}
                className="flow-edge-waypoint"
                data-testid="edge-waypoint"
                style={{
                  position: 'absolute',
                  transform: `translate(-50%, -50%) translate(${wp.x}px, ${wp.y}px)`,
                  pointerEvents: 'all',
                }}
                onPointerDown={(e) => onWaypointPointerDown(index, e)}
                onDoubleClick={(e) => {
                  e.stopPropagation()
                  removeWaypoint(index)
                }}
                title="Drag to reshape. Double-click to remove."
              />
            ))
          : null}
        {selected && edgeType !== 'curved' && waypoints.length === 0 ? (
          <div
            className="flow-edge-waypoint is-mid"
            data-testid="edge-waypoint-add"
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${midX}px, ${midY}px)`,
              pointerEvents: 'all',
            }}
            onPointerDown={addWaypointFromMid}
            title="Drag to add a bend point"
          />
        ) : null}
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
