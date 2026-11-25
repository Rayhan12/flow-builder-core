import { useViewport } from '@xyflow/react'
import type { AlignmentGuide, SpacingHint } from './alignment'

type Props = {
  guides: AlignmentGuide[]
  spacings: SpacingHint[]
}

/**
 * Overlay for snap guides. Coordinates are in flow space; we transform with
 * the current viewport so lines stay locked to nodes while dragging.
 */
export function AlignmentGuides({ guides, spacings }: Props) {
  const { x, y, zoom } = useViewport()

  if (guides.length === 0 && spacings.length === 0) return null

  return (
    <div className="alignment-guides" aria-hidden>
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
    </div>
  )
}
