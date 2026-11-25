import {
  BaseEdge,
  EdgeLabelRenderer,
  getSmoothStepPath,
  type EdgeProps,
} from '@xyflow/react'
import { resolveColor } from '../colors'
import type { FlowEdge as FlowEdgeType } from '../flowTypes'

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
  })

  const edge = data?.diagramEdge
  const color = resolveColor(edge?.color, 'gray')
  const stroke = selected ? 'var(--color-accent)' : color.solid === '#98a2b3' ? 'var(--color-icon)' : color.solid

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        markerEnd={markerEnd}
        style={{ stroke, strokeWidth: selected ? 2 : 1.5 }}
      />
      {label ? (
        <EdgeLabelRenderer>
          <div
            className={`flow-edge-label ${selected ? 'is-selected' : ''}`}
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            }}
          >
            {label}
          </div>
        </EdgeLabelRenderer>
      ) : null}
    </>
  )
}
