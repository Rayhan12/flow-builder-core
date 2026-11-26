/**
 * Decision branch sizing — re-exports shared layout sizes so UI and ELK agree.
 */
export {
  BRANCH_CHAR_PX,
  BRANCH_CHIP_PAD,
  BRANCH_SLOT_MAX,
  BRANCH_SLOT_MIN,
  BRANCHES_PER_ROW,
  DECISION_BODY_HEIGHT,
  DECISION_BRANCH_ROW_HEIGHT,
  DECISION_MIN_WIDTH,
  branchSlotWidth,
  decisionBranchColumns,
  decisionBranchRows,
  decisionSizeForBranches,
} from '../../shared/layout/index.ts'

/** @deprecated use BRANCH_SLOT_MIN */
export { BRANCH_SLOT_MIN as BRANCH_SLOT_WIDTH } from '../../shared/layout/index.ts'
