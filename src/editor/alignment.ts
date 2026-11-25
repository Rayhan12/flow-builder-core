import type { DiagramNode } from '../schema'
import { absolutePosition } from './flowTypes'

export const GRID_SIZE = 16
export const ALIGN_THRESHOLD = 6
export const DEFAULT_NODE_WIDTH = 256
export const DEFAULT_NODE_HEIGHT = 96

export type GridMode = 'dots' | 'lines' | 'none'

export type AlignmentGuide = {
  orientation: 'vertical' | 'horizontal'
  /** Flow-space coordinate of the guide line (x for vertical, y for horizontal) */
  position: number
  /** Segment start/end so the line spans the two aligned boxes */
  start: number
  end: number
}

export type SpacingHint = {
  orientation: 'horizontal' | 'vertical'
  /** Midpoint of the equal gap, in flow space */
  x: number
  y: number
  distance: number
}

export type NodeBox = {
  id: string
  left: number
  right: number
  top: number
  bottom: number
  centerX: number
  centerY: number
  width: number
  height: number
}

export function snapToGrid(value: number, size = GRID_SIZE): number {
  return Math.round(value / size) * size
}

export function nodeBox(
  node: DiagramNode,
  allNodes: DiagramNode[],
  sizeOverrides?: { w?: number; h?: number },
): NodeBox {
  const pos = absolutePosition(node, allNodes)
  const width =
    sizeOverrides?.w ??
    node.size?.w ??
    (node.kind === 'group' ? 360 : node.kind === 'start' || node.kind === 'end' ? 176 : DEFAULT_NODE_WIDTH)
  const height =
    sizeOverrides?.h ??
    node.size?.h ??
    (node.kind === 'group' ? 240 : node.kind === 'start' || node.kind === 'end' ? 64 : DEFAULT_NODE_HEIGHT)
  return {
    id: node.id,
    left: pos.x,
    right: pos.x + width,
    top: pos.y,
    bottom: pos.y + height,
    centerX: pos.x + width / 2,
    centerY: pos.y + height / 2,
    width,
    height,
  }
}

type SnapAxes = { x: number | null; y: number | null }

/**
 * While dragging, snap the moving box to nearby node edges/centres and
 * collect guide lines plus equal-spacing hints.
 */
export function computeAlignment(
  moving: NodeBox,
  others: NodeBox[],
  threshold = ALIGN_THRESHOLD,
): { box: NodeBox; guides: AlignmentGuide[]; spacings: SpacingHint[] } {
  let nextLeft = moving.left
  let nextTop = moving.top
  const snap: SnapAxes = { x: null, y: null }
  const guides: AlignmentGuide[] = []

  const candidatesX: Array<{ value: number; movingEdge: number; otherEdge: number; other: NodeBox }> = []
  const candidatesY: Array<{ value: number; movingEdge: number; otherEdge: number; other: NodeBox }> = []

  for (const other of others) {
    const xPairs: Array<[number, number]> = [
      [moving.left, other.left],
      [moving.left, other.right],
      [moving.left, other.centerX],
      [moving.right, other.left],
      [moving.right, other.right],
      [moving.right, other.centerX],
      [moving.centerX, other.left],
      [moving.centerX, other.right],
      [moving.centerX, other.centerX],
    ]
    for (const [m, o] of xPairs) {
      const delta = o - m
      if (Math.abs(delta) <= threshold) {
        candidatesX.push({ value: delta, movingEdge: m, otherEdge: o, other })
      }
    }

    const yPairs: Array<[number, number]> = [
      [moving.top, other.top],
      [moving.top, other.bottom],
      [moving.top, other.centerY],
      [moving.bottom, other.top],
      [moving.bottom, other.bottom],
      [moving.bottom, other.centerY],
      [moving.centerY, other.top],
      [moving.centerY, other.bottom],
      [moving.centerY, other.centerY],
    ]
    for (const [m, o] of yPairs) {
      const delta = o - m
      if (Math.abs(delta) <= threshold) {
        candidatesY.push({ value: delta, movingEdge: m, otherEdge: o, other })
      }
    }
  }

  if (candidatesX.length) {
    candidatesX.sort((a, b) => Math.abs(a.value) - Math.abs(b.value))
    const best = candidatesX[0]
    snap.x = best.otherEdge
    nextLeft = moving.left + best.value
    const snapped = {
      ...moving,
      left: nextLeft,
      right: nextLeft + moving.width,
      centerX: nextLeft + moving.width / 2,
    }
    // Collect all vertical guides that still match after snap
    const matched = new Set<number>()
    for (const c of candidatesX) {
      if (Math.abs(c.value - best.value) > 0.01) continue
      if (matched.has(c.otherEdge)) continue
      matched.add(c.otherEdge)
      guides.push({
        orientation: 'vertical',
        position: c.otherEdge,
        start: Math.min(snapped.top, c.other.top),
        end: Math.max(snapped.bottom, c.other.bottom),
      })
    }
  }

  if (candidatesY.length) {
    candidatesY.sort((a, b) => Math.abs(a.value) - Math.abs(b.value))
    const best = candidatesY[0]
    snap.y = best.otherEdge
    nextTop = moving.top + best.value
    const snapped = {
      ...moving,
      top: nextTop,
      bottom: nextTop + moving.height,
      centerY: nextTop + moving.height / 2,
    }
    const matched = new Set<number>()
    for (const c of candidatesY) {
      if (Math.abs(c.value - best.value) > 0.01) continue
      if (matched.has(c.otherEdge)) continue
      matched.add(c.otherEdge)
      guides.push({
        orientation: 'horizontal',
        position: c.otherEdge,
        start: Math.min(snapped.left, c.other.left),
        end: Math.max(snapped.right, c.other.right),
      })
    }
  }

  const box: NodeBox = {
    ...moving,
    left: nextLeft,
    right: nextLeft + moving.width,
    top: nextTop,
    bottom: nextTop + moving.height,
    centerX: nextLeft + moving.width / 2,
    centerY: nextTop + moving.height / 2,
  }

  const spacings = computeEqualSpacings(box, others, threshold)
  return { box, guides, spacings }
}

function computeEqualSpacings(
  moving: NodeBox,
  others: NodeBox[],
  threshold: number,
): SpacingHint[] {
  const hints: SpacingHint[] = []
  if (others.length < 2) return hints

  // Horizontal gaps (nodes in a row): sort by centerX
  const row = [...others, moving].sort((a, b) => a.centerX - b.centerX)
  for (let i = 1; i < row.length - 1; i += 1) {
    if (row[i].id !== moving.id) continue
    const left = row[i - 1]
    const right = row[i + 1]
    const gapL = moving.left - left.right
    const gapR = right.left - moving.right
    if (gapL > 0 && gapR > 0 && Math.abs(gapL - gapR) <= threshold) {
      hints.push({
        orientation: 'horizontal',
        x: (left.right + moving.left) / 2,
        y: moving.centerY,
        distance: Math.round((gapL + gapR) / 2),
      })
      hints.push({
        orientation: 'horizontal',
        x: (moving.right + right.left) / 2,
        y: moving.centerY,
        distance: Math.round((gapL + gapR) / 2),
      })
    }
  }

  const col = [...others, moving].sort((a, b) => a.centerY - b.centerY)
  for (let i = 1; i < col.length - 1; i += 1) {
    if (col[i].id !== moving.id) continue
    const above = col[i - 1]
    const below = col[i + 1]
    const gapA = moving.top - above.bottom
    const gapB = below.top - moving.bottom
    if (gapA > 0 && gapB > 0 && Math.abs(gapA - gapB) <= threshold) {
      hints.push({
        orientation: 'vertical',
        x: moving.centerX,
        y: (above.bottom + moving.top) / 2,
        distance: Math.round((gapA + gapB) / 2),
      })
      hints.push({
        orientation: 'vertical',
        x: moving.centerX,
        y: (moving.bottom + below.top) / 2,
        distance: Math.round((gapA + gapB) / 2),
      })
    }
  }

  return hints
}

export function cycleGridMode(mode: GridMode): GridMode {
  if (mode === 'dots') return 'lines'
  if (mode === 'lines') return 'none'
  return 'dots'
}

export function gridModeLabel(mode: GridMode): string {
  if (mode === 'dots') return 'Dot grid'
  if (mode === 'lines') return 'Line grid'
  return 'No grid'
}
