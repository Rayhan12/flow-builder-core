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

export type LayoutEdgeLike = {
  id: string
  source: string
  target: string
  sourceHandle?: string
  targetHandle?: string
  label?: string
  waypoints?: Array<{ x: number; y: number }>
}

export type LayoutOptions = {
  direction?: LayoutDirection
  /** When set, only these nodes (plus edges between them) are rearranged. */
  nodeIds?: string[]
  /** Spacing between nodes in the same layer. Default 60. */
  nodeNodeSpacing?: number
  /** Spacing between layers. Default 100. */
  layerSpacing?: number
}

export type LayoutResult<N extends LayoutNodeLike, E extends LayoutEdgeLike> = {
  nodes: N[]
  edges: E[]
}
