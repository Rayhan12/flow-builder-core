import {
  BaseEdge,
  EdgeLabelRenderer,
  getSmoothStepPath,
  type EdgeProps,
} from '@xyflow/react'
import { Plus } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { NodeKind } from '../../schema'
import { useEditorStore } from '../../store/editorStore'
import { resolveColor } from '../colors'
import type { FlowEdge as FlowEdgeType } from '../flowTypes'
import { KIND_META } from '../kinds'

const INSERT_KINDS: NodeKind[] = ['step', 'decision', 'rule', 'mapping', 'integration', 'note']

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
  const [path, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    borderRadius: 8,
  })

  const insertNodeOnEdge = useEditorStore((s) => s.insertNodeOnEdge)
  const [hovered, setHovered] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  const edge = data?.diagramEdge
  const color = resolveColor(edge?.color, 'gray')
  const isNeutral = color.solid === '#98a2b3'
  const stroke = selected
    ? 'var(--color-accent)'
    : isNeutral
      ? '#8b8d98'
      : color.solid

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

  function onInsert(kind: NodeKind) {
    insertNodeOnEdge(id, kind)
    setMenuOpen(false)
    setHovered(false)
  }

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        markerEnd={markerEnd}
        style={{ stroke, strokeWidth: selected ? 2 : 1.5 }}
        interactionWidth={24}
      />
      <EdgeLabelRenderer>
        <div
          ref={wrapRef}
          className="flow-edge-midpoint"
          style={{
            position: 'absolute',
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            pointerEvents: 'all',
          }}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => {
            if (!menuOpen) setHovered(false)
          }}
        >
          {label ? (
            <div className={`flow-edge-label ${selected ? 'is-selected' : ''}`}>{label}</div>
          ) : null}
          <button
            type="button"
            className={`flow-edge-insert ${hovered || menuOpen || selected ? 'is-visible' : ''} ${menuOpen ? 'is-open' : ''}`}
            aria-label="Insert node on this connection"
            title="Insert node"
            onClick={(e) => {
              e.stopPropagation()
              setMenuOpen((v) => !v)
            }}
          >
            <Plus size={12} strokeWidth={2.5} />
          </button>
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
