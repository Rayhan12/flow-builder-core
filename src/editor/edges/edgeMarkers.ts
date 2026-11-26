import { MarkerType, type EdgeMarkerType } from '@xyflow/react'
import type { EdgeMarker } from '../../schema'

/** Small neat filled arrowheads (~8px), FigJam / Whimsical scale. */
const ARROW_SIZE = 8

export function toReactFlowMarker(
  marker: EdgeMarker | undefined,
  color: string,
  fallback: 'none' | 'arrowFilled' = 'arrowFilled',
): EdgeMarkerType | undefined {
  const resolved = marker ?? fallback
  if (resolved === 'none') return undefined
  if (resolved === 'arrow') {
    return { type: MarkerType.Arrow, width: ARROW_SIZE, height: ARROW_SIZE, color }
  }
  if (resolved === 'arrowFilled') {
    return { type: MarkerType.ArrowClosed, width: ARROW_SIZE, height: ARROW_SIZE, color }
  }
  // circle and diamond: React Flow only ships arrow markers, so we use a closed
  // arrow as a stand-in and also paint custom SVG markers in FlowEdge.
  return { type: MarkerType.ArrowClosed, width: ARROW_SIZE, height: ARROW_SIZE, color }
}

export function needsCustomMarker(marker: EdgeMarker | undefined): marker is 'circle' | 'diamond' {
  return marker === 'circle' || marker === 'diamond'
}
