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

type Waypoint = { x: number; y: number; routed?: boolean }

function nearlyEq(a: number, b: number): boolean {
  return Math.abs(a - b) < 0.75
}

/** Insert one bend when two points differ in both axes so the path stays orthogonal. */
function ensureOrthogonal(points: Array<{ x: number; y: number }>): Array<{ x: number; y: number }> {
  if (points.length < 2) return points
  const out: Array<{ x: number; y: number }> = [points[0]]
  for (let i = 1; i < points.length; i += 1) {
    const prev = out[out.length - 1]
    const cur = points[i]
    if (!nearlyEq(prev.x, cur.x) && !nearlyEq(prev.y, cur.y)) {
      // Prefer vertical then horizontal when coming from a handle (common for DOWN flow).
      out.push({ x: prev.x, y: cur.y })
    }
    out.push(cur)
  }
  return out
}

function buildWaypointPath(
  sourceX: number,
  sourceY: number,
  targetX: number,
  targetY: number,
  waypoints: Waypoint[],
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

  const routed = waypoints.some((w) => w.routed)
  const raw = [{ x: sourceX, y: sourceY }, ...waypoints.map((w) => ({ x: w.x, y: w.y })), { x: targetX, y: targetY }]
  // Routed bends from ELK / the independent router are already orthogonal; only
  // bridge handle endpoints. Drop collinear/backtrack stubs so markers stay at ends.
  const points = routed ? ensureOrthogonal(raw) : raw
  const cleaned: Array<{ x: number; y: number }> = []
  for (const p of points) {
    const prev = cleaned[cleaned.length - 1]
    if (prev && Math.abs(prev.x - p.x) < 0.5 && Math.abs(prev.y - p.y) < 0.5) continue
    cleaned.push(p)
  }

  if (edgeType === 'straight' || routed) {
    const d = cleaned.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')
    const mid = cleaned[Math.floor(cleaned.length / 2)]
    return [d, mid.x, mid.y]
  }

  // Manual elbow / curved with waypoints: orthogonal segments through each bend.
  let d = `M ${cleaned[0].x} ${cleaned[0].y}`
  for (let i = 1; i < cleaned.length; i += 1) {
    const prev = cleaned[i - 1]
    const cur = cleaned[i]
    if (edgeType === 'curved') {
      const cx = (prev.x + cur.x) / 2
      const cy = (prev.y + cur.y) / 2
      d += ` Q ${cx} ${prev.y} ${cx} ${cy} Q ${cx} ${cur.y} ${cur.x} ${cur.y}`
    } else {
      const elbowX = cur.x
      const elbowY = prev.y
      if (Math.abs(elbowX - prev.x) > 0.5 || Math.abs(elbowY - prev.y) > 0.5) {
        d += ` L ${elbowX} ${elbowY}`
      }
      d += ` L ${cur.x} ${cur.y}`
    }
  }
  const mid = cleaned[Math.floor(cleaned.length / 2)]
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
  const branchMeta =
    sourceNode &&
    (sourceNode.kind === 'decision' || sourceNode.kind === 'switch') &&
    branchHandleId
      ? sourceNode.data.branches.find((b) => b.id === branchHandleId)
      : undefined
  const branchChipLabel = branchMeta?.label
  // Chip already names the branch at the source — never draw a source-side tag.
  // Short hops hide the duplicate mid label; long edges keep the label near the target.
  const pathLenApprox = Math.hypot(targetX - sourceX, targetY - sourceY)
  const isLongBranchEdge = Boolean(branchChipLabel) && pathLenApprox > 180
  const labelMatchesChip =
    typeof label === 'string' && Boolean(branchChipLabel) && label === branchChipLabel
  const hideBranchDuplicate = labelMatchesChip && !isLongBranchEdge

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

  // Branch labels sit on the longest run, biased toward the target but kept off cards.
  const defaultBranchT = isLongBranchEdge && labelMatchesChip ? 0.68 : 0.5
  const labelT = edge?.labelPosition ?? defaultBranchT
  const rawLabelPoint =
    labelT === 0.5 && !isLongBranchEdge
      ? { x: midX, y: midY }
      : pointAlongPath(path, labelT)
  // Nudge labels off the stroke so they do not sit on node boxes.
  const labelPoint = isLongBranchEdge && labelMatchesChip
    ? { x: rawLabelPoint.x, y: rawLabelPoint.y - 14 }
    : rawLabelPoint

  const insertNodeOnEdge = useEditorStore((s) => s.insertNodeOnEdge)
  const updateEdge = useEditorStore((s) => s.updateEdge)
  const [hovered, setHovered] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(typeof label === 'string' ? label : '')
  const wrapRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const branchColorKey =
    (branchMeta && 'color' in branchMeta
      ? (branchMeta as { color?: string }).color
      : undefined) ?? edge?.style?.color ?? edge?.color
  const color = resolveColor(branchColorKey, branchChipLabel ? 'amber' : 'gray')
  const isNeutral = color.solid === '#98a2b3'
  const stroke = selected || hovered
    ? 'var(--color-accent)'
    : isNeutral
      ? branchChipLabel
        ? color.solid
        : '#8b8d98'
      : color.solid
  const strokeWidth = edge?.style?.width ?? (selected || hovered ? 2.5 : 1.5)
  const viewHighlight = data?.viewHighlight
  const dash =
    viewHighlight === 'flow'
      ? '8 6'
      : edge?.style?.dash === 'dashed'
        ? '6 4'
        : undefined

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

  const showLabel = (Boolean(label) && !hideBranchDuplicate) || editing
  // Markers only at true path ends (never mid-segment).
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
        style={{
          stroke: viewHighlight === 'flow' ? 'var(--color-accent)' : stroke,
          strokeWidth: viewHighlight === 'flow' ? Math.max(strokeWidth, 2.5) : strokeWidth,
          strokeDasharray: dash,
        }}
        className={
          viewHighlight === 'flow'
            ? 'is-view-flow-path'
            : viewHighlight === 'dim'
              ? 'is-view-dim-path'
              : undefined
        }
        interactionWidth={24}
      />
      {/* Wider invisible hit path so hover highlights the edge and its ends. */}
      <path
        d={path}
        fill="none"
        stroke="transparent"
        strokeWidth={24}
        className="flow-edge-hit"
        data-testid="edge-hit"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => {
          if (!menuOpen && !editing) setHovered(false)
        }}
      />
      {hovered || selected ? (
        <>
          <circle
            cx={sourceX}
            cy={sourceY}
            r={5}
            className="flow-edge-endpoint"
            data-testid="edge-endpoint-source"
            style={{ fill: stroke }}
          />
          <circle
            cx={targetX}
            cy={targetY}
            r={5}
            className="flow-edge-endpoint"
            data-testid="edge-endpoint-target"
            style={{ fill: stroke }}
          />
        </>
      ) : null}
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
