export {
  ANNOTATION_KINDS,
  BRANCH_CHAR_PX,
  BRANCH_CHIP_PAD,
  BRANCH_SLOT_MAX,
  BRANCH_SLOT_MIN,
  BRANCHES_PER_ROW,
  DECISION_BODY_HEIGHT,
  DECISION_BRANCH_ROW_HEIGHT,
  DECISION_MIN_WIDTH,
  DEFAULT_NODE_HEIGHT,
  DEFAULT_NODE_WIDTH,
  EDGE_EDGE_SPACING,
  EDGE_NODE_SPACING,
  GROUP_HEADER,
  GROUP_PADDING,
  LAYER_SPACING,
  MAX_LABEL_NODE_WIDTH,
  NODE_NODE_SPACING,
  SIDE_COLUMN_GAP,
  branchSlotWidth,
  decisionBranchColumns,
  decisionBranchRows,
  decisionSizeForBranches,
  defaultNodeSize,
  isAnnotationKind,
} from './nodeSizes.ts'

export { layoutDiagram } from './elkLayout.ts'

export {
  hasOverlappingNodes,
  nodeBoundingBoxes,
  placeNodesIncremental,
} from './incremental.ts'

export {
  CONFLICT_MARGIN,
  FALLBACK_NODE_SIZE,
  detectConflicts,
  measureConflictBoxes,
  nodeConflictBox,
  resolveConflicts,
  summarizeConflicts,
} from './conflicts.ts'
export type {
  ConflictBox,
  ConflictReport,
  ConflictSummary,
  EdgeCrossing,
  EdgeThroughNode,
  NodeOverlap,
} from './conflicts.ts'

export {
  MIN_EDGE_GAP,
  buildUniqueElbow,
  collinearOverlapLength,
  edgesShareBus,
  estimateSourcePoint,
  estimateTargetPoint,
  extractElkBendPoints,
  pathPointsForEdge,
  routeEdgesIndependently,
  segmentHitsRect,
  separateSharedSegments,
} from './edgeRouting.ts'
export type { Point, RoutedEdge, SizedNode } from './edgeRouting.ts'

export {
  formatGraphProblems,
  validateGraph,
} from './validateGraph.ts'
export type {
  GraphEdge,
  GraphNode,
  GraphProblem,
  ValidateGraphOptions,
} from './validateGraph.ts'

export type {
  LayoutDirection,
  LayoutEdgeLike,
  LayoutNodeLike,
  LayoutOptions,
  LayoutResult,
  LayoutWaypoint,
} from './types.ts'
