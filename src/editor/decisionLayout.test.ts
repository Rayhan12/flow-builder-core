import { describe, expect, it } from 'vitest'
import {
  BRANCH_SLOT_WIDTH,
  BRANCHES_PER_ROW,
  decisionBranchColumns,
  decisionBranchRows,
  decisionSizeForBranches,
} from './decisionLayout'

describe('decisionLayout', () => {
  it('grows width by branch slots up to 6 per row', () => {
    expect(decisionSizeForBranches(2).w).toBe(256) // min width floor
    expect(decisionSizeForBranches(6).w).toBe(BRANCH_SLOT_WIDTH * 6)
    expect(decisionBranchColumns(8)).toBe(BRANCHES_PER_ROW)
    expect(decisionBranchRows(8)).toBe(2)
    expect(decisionSizeForBranches(8).w).toBe(BRANCH_SLOT_WIDTH * 6)
    expect(decisionSizeForBranches(8).h).toBeGreaterThan(decisionSizeForBranches(2).h)
  })
})
