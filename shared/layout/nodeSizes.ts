/**
 * Default node sizes for layout (browser + MCP/Node). Kept free of React so
 * elk layout can run in the Vercel MCP function and in the editor worker.
 *
 * Estimates mirror canvas card CSS in src/index.css (.flow-node*, branch chips,
 * hint row) so server layout matches what the browser paints before measure.
 */

export const DEFAULT_NODE_WIDTH = 256
export const DEFAULT_NODE_HEIGHT = 96

export const BRANCH_SLOT_MIN = 96
export const BRANCH_SLOT_MAX = 160
export const BRANCHES_PER_ROW = 6
export const DECISION_MIN_WIDTH = 256
/** Header + hint + padding above the branch chip row (matches CSS). */
export const DECISION_BODY_HEIGHT = 128
export const DECISION_BRANCH_ROW_HEIGHT = 44
export const BRANCH_CHAR_PX = 7
export const BRANCH_CHIP_PAD = 24

export const NODE_NODE_SPACING = 60
export const LAYER_SPACING = 100
export const EDGE_EDGE_SPACING = 16
export const EDGE_NODE_SPACING = 20
export const GROUP_PADDING = 32
export const GROUP_HEADER = 36
export const SIDE_COLUMN_GAP = 80
/** Max card width when growing for long titles. */
export const MAX_LABEL_NODE_WIDTH = 360

/** Card chrome from .flow-node (padding 12). */
export const CARD_PAD = 12
/** Icon column + gaps in .flow-node-header. */
export const ICON_COL_WIDTH = 40
/** .flow-node-label at 14px / 600 Inter ≈ 8.05px per char. */
export const TITLE_CHAR_PX = 8.05
/** Line box for the title (14px * ~1.35). */
export const TITLE_LINE_HEIGHT = 20
/** Kind eyebrow + gap above the title. */
export const KIND_ROW_HEIGHT = 16
/** .flow-node-hint: margin-top 8 + 11px * 1.35. */
export const HINT_ROW_HEIGHT = 23
/** Always budget the hint row; the editor shows hints by default. */
export const ESTIMATE_WITH_HINT = true

/** Annotation-like kinds that stay put (or go to a side column) when unconnected. */
export const ANNOTATION_KINDS = new Set([
  'sticky',
  'note',
  'callout',
  'divider',
  'image',
  'link',
])

export function decisionBranchColumns(count: number): number {
  return Math.min(Math.max(count, 1), BRANCHES_PER_ROW)
}

export function decisionBranchRows(count: number): number {
  return Math.max(1, Math.ceil(Math.max(count, 1) / BRANCHES_PER_ROW))
}

export function branchSlotWidth(label: string): number {
  const estimated = BRANCH_CHIP_PAD + Math.max(label.length, 1) * BRANCH_CHAR_PX
  return Math.min(BRANCH_SLOT_MAX, Math.max(BRANCH_SLOT_MIN, estimated))
}

export function decisionSizeForBranches(
  count: number,
  labels: string[] = [],
  title = '',
): { w: number; h: number } {
  const cols = decisionBranchColumns(count)
  const rows = decisionBranchRows(count)
  let slot = BRANCH_SLOT_MIN
  if (labels.length > 0) {
    slot = Math.max(...labels.map((l) => branchSlotWidth(l)), BRANCH_SLOT_MIN)
  }
  const branchW = Math.max(DECISION_MIN_WIDTH, cols * slot + 24)
  const titleLines = titleLineCount(title, branchW)
  const extraTitle = Math.max(0, titleLines - 1) * TITLE_LINE_HEIGHT
  return {
    w: branchW,
    h: DECISION_BODY_HEIGHT + extraTitle + rows * DECISION_BRANCH_ROW_HEIGHT,
  }
}

type SizeNode = {
  kind: string
  size?: { w: number; h: number }
  label?: string
  data?: unknown
}

function branchesOf(node: SizeNode): Array<{ id: string; label: string }> {
  const data = node.data
  if (!data || typeof data !== 'object') return []
  const branches = (data as { branches?: unknown }).branches
  if (!Array.isArray(branches)) return []
  return branches
    .filter(
      (b): b is { id: string; label: string } =>
        !!b && typeof b === 'object' && typeof (b as { id?: unknown }).id === 'string',
    )
    .map((b) => ({
      id: b.id,
      label: typeof (b as { label?: unknown }).label === 'string' ? (b as { label: string }).label : '',
    }))
}

function isContainer(kind: string): boolean {
  return kind === 'group' || kind === 'section'
}

/** Inner width available to the title text for a card of width `cardW`. */
export function titleContentWidth(cardW: number): number {
  return Math.max(64, cardW - CARD_PAD * 2 - ICON_COL_WIDTH)
}

/** How many wrapped title lines a label needs at the given card width. */
export function titleLineCount(label: string, cardW: number): number {
  const text = label.trim()
  if (!text) return 1
  const inner = titleContentWidth(cardW)
  const charsPerLine = Math.max(8, Math.floor(inner / TITLE_CHAR_PX))
  // Prefer wrapping on spaces when the label has words.
  const words = text.split(/\s+/)
  if (words.length <= 1) {
    return Math.max(1, Math.ceil(text.length / charsPerLine))
  }
  let lines = 1
  let used = 0
  for (const word of words) {
    const need = used === 0 ? word.length : word.length + 1
    if (used > 0 && used + need > charsPerLine) {
      lines += 1
      used = word.length
    } else {
      used += need
    }
  }
  return Math.max(1, lines)
}

function widthForLabel(label: string, minW: number): number {
  const len = label.trim().length
  if (len === 0) return minW
  // Prefer fitting on one line up to the max, then wrap (height grows).
  const oneLine = CARD_PAD * 2 + ICON_COL_WIDTH + Math.ceil(len * TITLE_CHAR_PX) + 8
  return Math.min(MAX_LABEL_NODE_WIDTH, Math.max(minW, oneLine))
}

function heightForCard(label: string, width: number, baseWithoutTitle: number): number {
  const lines = titleLineCount(label, width)
  const titleBlock = KIND_ROW_HEIGHT + lines * TITLE_LINE_HEIGHT
  const hint = ESTIMATE_WITH_HINT ? HINT_ROW_HEIGHT : 0
  const raw = CARD_PAD * 2 + Math.max(32, titleBlock) + hint + baseWithoutTitle
  // Floor at the historical default so ELK keeps comfortable layer gaps.
  return Math.max(DEFAULT_NODE_HEIGHT, raw)
}

/**
 * Pure CSS-matched size estimate (ignores any measured `node.size`).
 * Used by server layout and by tests that compare to Playwright measurements.
 */
export function estimateNodeSize(node: SizeNode): { w: number; h: number } {
  if (isContainer(node.kind)) {
    const collapsed =
      (node.kind === 'group' || node.kind === 'section') &&
      !!(node.data as { collapsed?: boolean } | undefined)?.collapsed
    return {
      w: collapsed ? 280 : node.kind === 'section' ? 480 : 360,
      h: collapsed ? 44 : node.kind === 'section' ? 320 : 240,
    }
  }
  if (node.kind === 'decision' || node.kind === 'switch') {
    const branches = branchesOf(node)
    return decisionSizeForBranches(
      Math.max(branches.length, 1),
      branches.map((b) => b.label),
      node.label ?? '',
    )
  }
  if (node.kind === 'sticky') return { w: 192, h: 160 }
  if (node.kind === 'shape') return { w: 160, h: 96 }
  if (node.kind === 'divider') return { w: 240, h: 24 }

  const label = node.label ?? ''
  if (node.kind === 'note' || node.kind === 'callout') {
    const w = widthForLabel(label, 200)
    return { w, h: heightForCard(label, w, 8) }
  }
  if (node.kind === 'start' || node.kind === 'end') {
    const w = widthForLabel(label, 176)
    return { w, h: heightForCard(label, w, 0) }
  }
  // Steps and most kinds: grow width up to max, then height for wrapped titles.
  const w = widthForLabel(label, DEFAULT_NODE_WIDTH)
  return { w, h: heightForCard(label, w, 0) }
}

/**
 * Prefer measured `node.size`; otherwise the shared CSS-matched estimate.
 */
export function defaultNodeSize(node: SizeNode): { w: number; h: number } {
  if (node.size?.w && node.size?.h) {
    return { w: node.size.w, h: node.size.h }
  }
  return estimateNodeSize(node)
}

export function isAnnotationKind(kind: string): boolean {
  return ANNOTATION_KINDS.has(kind)
}
