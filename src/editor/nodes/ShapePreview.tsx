import type { CSSProperties } from 'react'
import type { ShapeType } from '../../schema'
import { shapeSvgContent } from './shapePaths'

type Props = {
  shape: ShapeType
  size?: number
  color?: string
  className?: string
  title?: string
}

/** Mini SVG preview using the same geometry as canvas shapes. */
export function ShapePreview({
  shape,
  size = 18,
  color = 'currentColor',
  className,
  title,
}: Props) {
  const svg = shapeSvgContent(shape)
  const stroke = color
  const fill = 'none'
  const style: CSSProperties = { width: size, height: size, display: 'block' }

  return (
    <svg
      className={className}
      viewBox="0 0 100 100"
      width={size}
      height={size}
      style={style}
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
      aria-label={title}
      data-shape-preview={shape}
      data-testid={`shape-preview-${shape}`}
    >
      {title ? <title>{title}</title> : null}
      {svg.rect ? (
        <rect
          x={svg.rect.x}
          y={svg.rect.y}
          width={svg.rect.w}
          height={svg.rect.h}
          rx={svg.rect.rx ?? 0}
          fill={fill}
          stroke={stroke}
          strokeWidth={6}
        />
      ) : null}
      {svg.ellipse ? (
        <ellipse
          cx={svg.ellipse.cx}
          cy={svg.ellipse.cy}
          rx={svg.ellipse.rx}
          ry={svg.ellipse.ry}
          fill={fill}
          stroke={stroke}
          strokeWidth={6}
        />
      ) : null}
      {svg.circle ? (
        <circle
          cx={svg.circle.cx}
          cy={svg.circle.cy}
          r={svg.circle.r}
          fill={fill}
          stroke={stroke}
          strokeWidth={6}
        />
      ) : null}
      {svg.path ? (
        <path d={svg.path} fill={fill} stroke={stroke} strokeWidth={6} strokeLinejoin="round" />
      ) : null}
      {svg.extra ? (
        <path d={svg.extra} fill="none" stroke={stroke} strokeWidth={6} />
      ) : null}
    </svg>
  )
}
