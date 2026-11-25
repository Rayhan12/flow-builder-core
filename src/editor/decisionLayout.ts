/** Layout helpers for decision branch pills and node sizing. */

export const BRANCH_SLOT_WIDTH = 96
export const BRANCHES_PER_ROW = 6
export const DECISION_MIN_WIDTH = 256
export const DECISION_BODY_HEIGHT = 88
export const DECISION_BRANCH_ROW_HEIGHT = 32

export function decisionBranchColumns(count: number): number {
  return Math.min(Math.max(count, 1), BRANCHES_PER_ROW)
}

export function decisionBranchRows(count: number): number {
  return Math.max(1, Math.ceil(Math.max(count, 1) / BRANCHES_PER_ROW))
}

export function decisionSizeForBranches(count: number): { w: number; h: number } {
  const cols = decisionBranchColumns(count)
  const rows = decisionBranchRows(count)
  return {
    w: Math.max(DECISION_MIN_WIDTH, cols * BRANCH_SLOT_WIDTH),
    h: DECISION_BODY_HEIGHT + rows * DECISION_BRANCH_ROW_HEIGHT,
  }
}
