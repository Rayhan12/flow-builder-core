import { useViewport } from '@xyflow/react'
import type { AlignmentGuide, SpacingHint } from './alignment'
import type { DistanceMeasurement } from './measure'

type Props = {
  guides: AlignmentGuide[]
  spacings: SpacingHint[]
  measurements?: DistanceMeasurement[]
}

/**
 * Overlay for snap guides (teal) and distance measurements (red).
 * Coordinates are in flow space; we transform with the current viewport.
 */
export function AlignmentGuides({ guides, spacings, measurements = [] }: Props) {
  const { x, y, zoom } = useViewport()

  if (guides.length === 0 && spacings.length === 0 && measurements.length === 0) {
    return null
  }

  return (
    <div className="alignment-guides" aria-hidden data-testid="alignment-guides">
      <svg className="alignment-guides-svg">
        <g transform={`translate(${x}, ${y}) scale(${zoom})`}>
          {guides.map((guide, index) =>
            guide.orientation === 'vertical' ? (
              <line
                key={`v-${index}-${guide.position}`}
                className="alignment-guide-line"
                x1={guide.position}
                y1={guide.start}
                x2={guide.position}
                y2={guide.end}
              />
            ) : (
              <line
                key={`h-${index}-${guide.position}`}
                className="alignment-guide-line"
                x1={guide.start}
                y1={guide.position}
                x2={guide.end}
                y2={guide.position}
              />
            ),
          )}
          {measurements.map((m, index) => (
            <line
              key={`m-${index}-${m.x1}-${m.y1}`}
              className="alignment-measure-line"
              x1={m.x1}
              y1={m.y1}
              x2={m.x2}
              y2={m.y2}
            />
          ))}
        </g>
      </svg>
      {spacings.map((hint, index) => (
        <div
          key={`s-${index}-${hint.x}-${hint.y}`}
          className="alignment-spacing-badge"
          style={{
            transform: `translate(-50%, -50%) translate(${x + hint.x * zoom}px, ${y + hint.y * zoom}px)`,
          }}
        >
          {hint.distance}
        </div>
      ))}
      {measurements.map((m, index) => (
        <div
          key={`ml-${index}-${m.labelX}-${m.labelY}`}
          className="alignment-measure-badge"
          data-testid="distance-measure"
          style={{
            transform: `translate(-50%, -50%) translate(${x + m.labelX * zoom}px, ${y + m.labelY * zoom}px)`,
          }}
        >
          {m.distance}
        </div>
      ))}
    </div>
  )
}
