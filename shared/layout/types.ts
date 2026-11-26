export type LayoutDirection = 'DOWN' | 'RIGHT'

export type LayoutNodeLike = {
  id: string
  kind: string
  label?: string
  position: { x: number; y: number }
  size?: { w: number; h: number }
  parentId?: string
  locked?: boolean
  manuallyPositioned?: boolean
  data?: unknown
}

export type LayoutWaypoint = {
  x: number
  y: number
  /** True when the point came from ELK / the independent router (not a manual bend). */
  routed?: boolean
}

export type LayoutEdgeLike = {
  id: string
  source: string
  target: string
  sourceHandle?: string
  targetHandle?: string
  label?: string
  waypoints?: LayoutWaypoint[]
}

export type LayoutOptions = {
  direction?: LayoutDirection
  /** When set, only these nodes (plus edges between them) are rearranged. */
  nodeIds?: string[]
  /** Spacing between nodes in the same layer. Default 60. */
  nodeNodeSpacing?: number
  /** Spacing between layers. Default 100. */
  layerSpacing?: number
  /**
   * Previous bus-style routing (shared channels, no post-separation). Used for
   * before/after screenshots and regression fixtures.
   */
  legacyEdgeRouting?: boolean
  /** Skip conflict resolve push-apart after layout. */
  skipConflictResolve?: boolean
}

export type LayoutResult<N extends LayoutNodeLike, E extends LayoutEdgeLike> = {
  nodes: N[]
  edges: E[]
}
