import type { ShapeType } from '../../schema'

/** SVG path/elements for diagram shapes in a 0..100 viewBox. */
export function shapeSvgContent(shape: ShapeType): {
  path?: string
  ellipse?: { cx: number; cy: number; rx: number; ry: number }
  circle?: { cx: number; cy: number; r: number }
  rect?: { x: number; y: number; w: number; h: number; rx?: number }
  extra?: string
} {
  switch (shape) {
    case 'rect':
      return { rect: { x: 2, y: 2, w: 96, h: 96, rx: 0 } }
    case 'rounded':
      return { rect: { x: 2, y: 2, w: 96, h: 96, rx: 14 } }
    case 'diamond':
      return { path: 'M50 4 L96 50 L50 96 L4 50 Z' }
    case 'ellipse':
      return { ellipse: { cx: 50, cy: 50, rx: 46, ry: 36 } }
    case 'parallelogram':
      return { path: 'M18 8 L98 8 L82 92 L2 92 Z' }
    case 'cylinder':
      return {
        path: 'M10 22 C10 10, 90 10, 90 22 L90 78 C90 90, 10 90, 10 78 Z',
        extra: 'M10 22 C10 34, 90 34, 90 22',
      }
    case 'document':
      return { path: 'M8 6 H92 V70 Q70 88 50 70 Q30 52 8 70 Z' }
    case 'hexagon':
      return { path: 'M30 6 L70 6 L94 50 L70 94 L30 94 L6 50 Z' }
    case 'triangle':
      return { path: 'M50 6 L96 94 L4 94 Z' }
  }
}
