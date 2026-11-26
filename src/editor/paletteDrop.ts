import { NodeKindSchema, ShapeTypeSchema, type NodeKind, type ShapeType } from '../schema'
import { DEFAULT_NODE_HEIGHT, DEFAULT_NODE_WIDTH, snapToGrid } from './alignment'

/** Custom MIME used by the palette for HTML5 drag and drop. */
export const PALETTE_MIME = 'application/flow-builder-kind'

/** Fallback MIME for browsers that are picky about custom types. */
export const PALETTE_MIME_TEXT = 'text/plain'

export type PaletteDragPayload = {
  kind: NodeKind
  shape?: ShapeType
}

/** Encode a palette item. Shapes use `shape:diamond` so plain kinds stay compatible. */
export function encodePalettePayload(payload: PaletteDragPayload): string {
  if (payload.kind === 'shape' && payload.shape) {
    return `shape:${payload.shape}`
  }
  return payload.kind
}

export function parsePalettePayload(raw: string): PaletteDragPayload | null {
  const value = raw.trim()
  if (!value) return null
  if (value.startsWith('shape:')) {
    const shapeParsed = ShapeTypeSchema.safeParse(value.slice('shape:'.length))
    if (!shapeParsed.success) return null
    return { kind: 'shape', shape: shapeParsed.data }
  }
  const kindParsed = NodeKindSchema.safeParse(value)
  if (!kindParsed.success) return null
  return { kind: kindParsed.data }
}

export function setPaletteDragData(
  dataTransfer: DataTransfer,
  kindOrPayload: string | PaletteDragPayload,
): void {
  const encoded =
    typeof kindOrPayload === 'string' ? kindOrPayload : encodePalettePayload(kindOrPayload)
  dataTransfer.setData(PALETTE_MIME, encoded)
  dataTransfer.setData(PALETTE_MIME_TEXT, encoded)
  dataTransfer.effectAllowed = 'copyMove'
}

export function readPaletteDragKind(dataTransfer: DataTransfer): string {
  return dataTransfer.getData(PALETTE_MIME) || dataTransfer.getData(PALETTE_MIME_TEXT) || ''
}

export function readPaletteDragPayload(dataTransfer: DataTransfer): PaletteDragPayload | null {
  return parsePalettePayload(readPaletteDragKind(dataTransfer))
}

export function isPaletteDrag(dataTransfer: DataTransfer | null | undefined): boolean {
  if (!dataTransfer) return false
  const types = Array.from(dataTransfer.types)
  return types.includes(PALETTE_MIME) || types.includes(PALETTE_MIME_TEXT)
}

/**
 * Convert a flow-space pointer position into a snapped top-left for a new node
 * so the node is centred on the drop point.
 */
export function dropPositionFromFlowPoint(
  flowPoint: { x: number; y: number },
  options: {
    nodeWidth?: number
    nodeHeight?: number
    snap?: boolean
  } = {},
): { x: number; y: number } {
  const width = options.nodeWidth ?? DEFAULT_NODE_WIDTH
  const height = options.nodeHeight ?? DEFAULT_NODE_HEIGHT
  let x = flowPoint.x - width / 2
  let y = flowPoint.y - height / 2
  if (options.snap !== false) {
    x = snapToGrid(x)
    y = snapToGrid(y)
  }
  return { x, y }
}
