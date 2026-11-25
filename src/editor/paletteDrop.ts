import { DEFAULT_NODE_HEIGHT, DEFAULT_NODE_WIDTH, snapToGrid } from './alignment'

/** Custom MIME used by the palette for HTML5 drag and drop. */
export const PALETTE_MIME = 'application/flow-builder-kind'

/** Fallback MIME for browsers that are picky about custom types. */
export const PALETTE_MIME_TEXT = 'text/plain'

export function setPaletteDragData(dataTransfer: DataTransfer, kind: string): void {
  dataTransfer.setData(PALETTE_MIME, kind)
  dataTransfer.setData(PALETTE_MIME_TEXT, kind)
  dataTransfer.effectAllowed = 'copyMove'
}

export function readPaletteDragKind(dataTransfer: DataTransfer): string {
  return dataTransfer.getData(PALETTE_MIME) || dataTransfer.getData(PALETTE_MIME_TEXT) || ''
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
