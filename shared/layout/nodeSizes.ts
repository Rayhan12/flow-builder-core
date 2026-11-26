/**
 * Default node sizes for layout (browser + MCP/Node). Kept free of React so
 * elk layout can run in the Vercel MCP function and in the editor worker.
 */

export const DEFAULT_NODE_WIDTH = 256
export const DEFAULT_NODE_HEIGHT = 96

export const BRANCH_SLOT_MIN = 96
export const BRANCH_SLOT_MAX = 160
export const BRANCHES_PER_ROW = 6
export const DECISION_MIN_WIDTH = 256
export const DECISION_BODY_HEIGHT = 120
export const DECISION_BRANCH_ROW_HEIGHT = 40
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
): { w: number; h: number } {
  const cols = decisionBranchColumns(count)
  const rows = decisionBranchRows(count)
  let slot = BRANCH_SLOT_MIN
  if (labels.length > 0) {
    slot = Math.max(...labels.map((l) => branchSlotWidth(l)), BRANCH_SLOT_MIN)
  }
  return {
    w: Math.max(DECISION_MIN_WIDTH, cols * slot + 24),
    h: DECISION_BODY_HEIGHT + rows * DECISION_BRANCH_ROW_HEIGHT,
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
  return branches.filter(
    (b): b is { id: string; label: string } =>
      !!b && typeof b === 'object' && typeof (b as { id?: unknown }).id === 'string',
  ).map((b) => ({
    id: b.id,
    label: typeof (b as { label?: unknown }).label === 'string' ? (b as { label: string }).label : '',
  }))
}

function isContainer(kind: string): boolean {
  return kind === 'group' || kind === 'section'
}

/**
 * Prefer measured `node.size`; otherwise kind defaults (decision/switch grow
 * with branch count and label length).
 */
export function defaultNodeSize(node: SizeNode): { w: number; h: number } {
  if (node.size?.w && node.size?.h) {
    return { w: node.size.w, h: node.size.h }
  }
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
    )
  }
  if (node.kind === 'sticky') return { w: 192, h: 160 }
  if (node.kind === 'shape') return { w: 160, h: 96 }
  if (node.kind === 'divider') return { w: 240, h: 24 }
  if (node.kind === 'start' || node.kind === 'end') {
    const labelLen = (node.label ?? '').length
    const w = Math.min(
      MAX_LABEL_NODE_WIDTH,
      Math.max(176, 48 + labelLen * 7.2),
    )
    // Tall enough for a 2-line wrap when the label is long.
    const h = labelLen > 22 ? 80 : 64
    return { w, h }
  }
  if (node.kind === 'note' || node.kind === 'callout') return { w: 200, h: 96 }
  // Grow with long labels so cards show full titles (wrap to 2 lines in CSS).
  const labelLen = (node.label ?? '').length
  const w = Math.min(
    MAX_LABEL_NODE_WIDTH,
    Math.max(DEFAULT_NODE_WIDTH, 48 + labelLen * 7.2),
  )
  const h = labelLen > 28 ? DEFAULT_NODE_HEIGHT + 20 : DEFAULT_NODE_HEIGHT
  return { w, h }
}

export function isAnnotationKind(kind: string): boolean {
  return ANNOTATION_KINDS.has(kind)
}
