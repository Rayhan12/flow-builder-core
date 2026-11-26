/** Layout helpers for decision branch pills and node sizing. */

export const BRANCH_SLOT_MIN = 96
export const BRANCH_SLOT_MAX = 160
export const BRANCHES_PER_ROW = 6
export const DECISION_MIN_WIDTH = 256
/** Header + optional hint + padding above the branch row. */
export const DECISION_BODY_HEIGHT = 120
export const DECISION_BRANCH_ROW_HEIGHT = 40
/** Approx character width for chip label sizing before truncate. */
export const BRANCH_CHAR_PX = 7
export const BRANCH_CHIP_PAD = 24

export const BRANCH_SLOT_WIDTH = BRANCH_SLOT_MIN

export function decisionBranchColumns(count: number): number {
  return Math.min(Math.max(count, 1), BRANCHES_PER_ROW)
}

export function decisionBranchRows(count: number): number {
  return Math.max(1, Math.ceil(Math.max(count, 1) / BRANCHES_PER_ROW))
}

/** Slot width for a single branch label, capped before ellipsis. */
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
