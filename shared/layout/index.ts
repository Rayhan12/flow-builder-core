export {
  ANNOTATION_KINDS,
  BRANCH_CHAR_PX,
  BRANCH_CHIP_PAD,
  BRANCH_SLOT_MAX,
  BRANCH_SLOT_MIN,
  BRANCHES_PER_ROW,
  CARD_PAD,
  DECISION_BODY_HEIGHT,
  DECISION_BRANCH_ROW_HEIGHT,
  DECISION_MIN_WIDTH,
  DEFAULT_NODE_HEIGHT,
  DEFAULT_NODE_WIDTH,
  EDGE_EDGE_SPACING,
  EDGE_NODE_SPACING,
  ESTIMATE_WITH_HINT,
  GROUP_HEADER,
  GROUP_PADDING,
  HINT_ROW_HEIGHT,
  ICON_COL_WIDTH,
  KIND_ROW_HEIGHT,
  LAYER_SPACING,
  MAX_LABEL_NODE_WIDTH,
  NODE_NODE_SPACING,
  SIDE_COLUMN_GAP,
  TITLE_CHAR_PX,
  TITLE_LINE_HEIGHT,
  branchSlotWidth,
  decisionBranchColumns,
  decisionBranchRows,
  decisionSizeForBranches,
  defaultNodeSize,
  estimateNodeSize,
  isAnnotationKind,
  titleContentWidth,
  titleLineCount,
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
  buildBackEdgeDetour,
  buildUniqueElbow,
  collinearOverlapLength,
  edgesShareBus,
  estimateSourcePoint,
  estimateTargetPoint,
  extractElkBendPoints,
  isBackEdge,
  pathPointsForEdge,
  routeEdgesIndependently,
  sanitizePolyline,
  segmentHitsRect,
  separateSharedSegments,
} from './edgeRouting.ts'
export type { Point, RoutedEdge, SizedNode } from './edgeRouting.ts'

export {
  CORNER_RADIUS,
  EDGE_CLEARANCE,
  EDGE_COLOR,
  EDGE_COLOR_HOVER,
  EDGE_STROKE,
  PARALLEL_GAP,
  THROUGH_INFLATE,
  handleEnterDir,
  handleLeaveDir,
  mixHex,
  pickLabelPoint,
  roundedOrthogonalPath,
  routeEdgesWithRouter,
  routeOrthogonal,
} from './router.ts'
export type { Dir, Rect } from './router.ts'

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
