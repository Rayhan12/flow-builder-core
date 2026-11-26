/**
 * Orthogonal edge routing helpers: extract ELK sections, keep parallel edges
 * on separate channels, and fall back to simple elbows that never share a bus.
 */

export type Point = { x: number; y: number; routed?: boolean }

export type RoutedEdge = {
  id: string
  source: string
  target: string
  sourceHandle?: string
  waypoints?: Point[]
}

export type SizedNode = {
  id: string
  kind: string
  position: { x: number; y: number }
  size?: { w: number; h: number }
  data?: unknown
}

export const MIN_EDGE_GAP = 12

type Segment = { x1: number; y1: number; x2: number; y2: number }

function nearlyEqual(a: number, b: number, eps = 0.5): boolean {
  return Math.abs(a - b) <= eps
}

function segmentLength(s: Segment): number {
  return Math.hypot(s.x2 - s.x1, s.y2 - s.y1)
}

function pointsToSegments(points: Point[]): Segment[] {
  const segs: Segment[] = []
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1]
    const b = points[i]
    segs.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y })
  }
  return segs
}

/** Collinear overlap length for axis-aligned segments; 0 if not overlapping. */
export function collinearOverlapLength(a: Segment, b: Segment): number {
  const aHoriz = nearlyEqual(a.y1, a.y2)
  const bHoriz = nearlyEqual(b.y1, b.y2)
  if (aHoriz && bHoriz && nearlyEqual(a.y1, b.y1)) {
    const aMin = Math.min(a.x1, a.x2)
    const aMax = Math.max(a.x1, a.x2)
    const bMin = Math.min(b.x1, b.x2)
    const bMax = Math.max(b.x1, b.x2)
    return Math.max(0, Math.min(aMax, bMax) - Math.max(aMin, bMin))
  }
  const aVert = nearlyEqual(a.x1, a.x2)
  const bVert = nearlyEqual(b.x1, b.x2)
  if (aVert && bVert && nearlyEqual(a.x1, b.x1)) {
    const aMin = Math.min(a.y1, a.y2)
    const aMax = Math.max(a.y1, a.y2)
    const bMin = Math.min(b.y1, b.y2)
    const bMax = Math.max(b.y1, b.y2)
    return Math.max(0, Math.min(aMax, bMax) - Math.max(aMin, bMin))
  }
  return 0
}

/**
 * Detect whether two edges share a collinear overlapping segment longer than
 * `maxShare` (default 4px). Direction is ignored: opposite-direction edges on
 * the same channel count as a shared bus (bow-tie / head-on arrows).
 */
export function edgesShareBus(
  a: Point[],
  b: Point[],
  maxShare = 4,
): boolean {
  const sa = pointsToSegments(a)
  const sb = pointsToSegments(b)
  for (const segA of sa) {
    for (const segB of sb) {
      if (collinearOverlapLength(segA, segB) > maxShare) return true
    }
  }
  return false
}

/** Drop zero-length and backtracking stubs so markers only sit at true ends. */
export function sanitizePolyline(points: Point[]): Point[] {
  if (points.length <= 1) return points.map((p) => ({ ...p }))
  const out: Point[] = [{ ...points[0] }]
  for (let i = 1; i < points.length; i += 1) {
    const prev = out[out.length - 1]
    const cur = points[i]
    if (nearlyEqual(prev.x, cur.x) && nearlyEqual(prev.y, cur.y)) continue
    // Collapse collinear middle points on the same axis.
    if (out.length >= 2) {
      const a = out[out.length - 2]
      const b = prev
      const horiz = nearlyEqual(a.y, b.y) && nearlyEqual(b.y, cur.y)
      const vert = nearlyEqual(a.x, b.x) && nearlyEqual(b.x, cur.x)
      if (horiz || vert) {
        out[out.length - 1] = { ...cur, routed: cur.routed ?? b.routed }
        continue
      }
    }
    out.push({ ...cur })
  }
  return out
}

function markRouted(points: Point[]): Point[] {
  return points.map((p) => ({ x: p.x, y: p.y, routed: true as const }))
}

/**
 * Pull bend points from an ELK edge section. Start/end are omitted so React Flow
 * handle positions remain the true endpoints.
 */
export function extractElkBendPoints(section: {
  startPoint?: { x?: number; y?: number }
  endPoint?: { x?: number; y?: number }
  bendPoints?: Array<{ x?: number; y?: number }>
}): Point[] | undefined {
  const bends = (section.bendPoints ?? []).map((p) => ({
    x: p.x ?? 0,
    y: p.y ?? 0,
    routed: true as const,
  }))
  return bends.length ? bends : undefined
}

/**
 * Offset shared horizontal/vertical bus segments so edges from different
 * sources stay at least `gap` apart.
 */
export function separateSharedSegments(
  edges: Array<{ id: string; source: string; sourceHandle?: string; points: Point[] }>,
  gap = MIN_EDGE_GAP,
): Map<string, Point[]> {
  const result = new Map<string, Point[]>()
  for (const e of edges) {
    result.set(
      e.id,
      e.points.map((p) => ({ ...p })),
    )
  }

  for (let i = 0; i < edges.length; i += 1) {
    for (let j = i + 1; j < edges.length; j += 1) {
      const a = edges[i]
      const b = edges[j]
      // Same source handle may legitimately share a stub; different sources must not.
      if (a.source === b.source && (a.sourceHandle ?? '') === (b.sourceHandle ?? '')) {
        continue
      }
      const ptsA = result.get(a.id)!
      const ptsB = result.get(b.id)!
      const segsA = pointsToSegments(ptsA)
      const segsB = pointsToSegments(ptsB)
      for (let ai = 0; ai < segsA.length; ai += 1) {
        for (let bi = 0; bi < segsB.length; bi += 1) {
          const segA = segsA[ai]
          const segB = segsB[bi]
          const overlap = collinearOverlapLength(segA, segB)
          if (overlap <= 4) continue
          const horiz = nearlyEqual(segA.y1, segA.y2)
          const offset = ((i + j) % 2 === 0 ? 1 : -1) * (gap / 2 + ((i + j) % 3) * (gap / 2))
          if (horiz) {
            // Nudge B's horizontal segment (and its endpoints in the polyline).
            const y = segB.y1
            for (const p of ptsB) {
              if (nearlyEqual(p.y, y)) p.y += offset
            }
          } else {
            const x = segB.x1
            for (const p of ptsB) {
              if (nearlyEqual(p.x, x)) p.x += offset
            }
          }
        }
      }
    }
  }

  for (const [id, pts] of result) {
    result.set(id, markRouted(pts))
  }
  return result
}

function branchesOf(node: SizedNode): Array<{ id: string }> {
  const data = node.data
  if (!data || typeof data !== 'object') return []
  const raw = (data as { branches?: unknown }).branches
  if (!Array.isArray(raw)) return []
  return raw
    .filter(
      (b): b is { id: string } =>
        !!b && typeof b === 'object' && typeof (b as { id?: unknown }).id === 'string',
    )
    .map((b) => ({ id: b.id }))
}

/** Approximate source handle position for routing after a node move / re-route. */
export function estimateSourcePoint(
  node: SizedNode,
  size: { w: number; h: number },
  sourceHandle: string | undefined,
  direction: 'DOWN' | 'RIGHT',
): Point {
  const { x, y } = node.position
  if (direction === 'RIGHT') {
    if (sourceHandle === 'top') return { x: x + size.w / 2, y }
    if (sourceHandle === 'bottom') return { x: x + size.w / 2, y: y + size.h }
    if (sourceHandle === 'left') return { x, y: y + size.h / 2 }
    // Branch chips on the right side, or default out.
    if (
      (node.kind === 'decision' || node.kind === 'switch') &&
      sourceHandle &&
      sourceHandle !== 'right'
    ) {
      const branches = branchesOf(node)
      const idx = Math.max(0, branches.findIndex((b) => b.id === sourceHandle))
      const n = Math.max(branches.length, 1)
      const t = (idx + 0.5) / n
      return { x: x + size.w, y: y + size.h * t }
    }
    return { x: x + size.w, y: y + size.h / 2 }
  }
  // DOWN
  if (sourceHandle === 'left') return { x, y: y + size.h / 2 }
  if (sourceHandle === 'right') return { x: x + size.w, y: y + size.h / 2 }
  if (sourceHandle === 'top') return { x: x + size.w / 2, y }
  if (
    (node.kind === 'decision' || node.kind === 'switch') &&
    sourceHandle &&
    sourceHandle !== 'bottom'
  ) {
    const branches = branchesOf(node)
    const idx = Math.max(0, branches.findIndex((b) => b.id === sourceHandle))
    const n = Math.max(branches.length, 1)
    const t = (idx + 0.5) / n
    return { x: x + size.w * t, y: y + size.h }
  }
  return { x: x + size.w / 2, y: y + size.h }
}

export function estimateTargetPoint(
  node: SizedNode,
  size: { w: number; h: number },
  targetHandle: string | undefined,
  direction: 'DOWN' | 'RIGHT',
): Point {
  const { x, y } = node.position
  if (direction === 'RIGHT') {
    if (targetHandle === 'top') return { x: x + size.w / 2, y }
    if (targetHandle === 'bottom') return { x: x + size.w / 2, y: y + size.h }
    if (targetHandle === 'right') return { x: x + size.w, y: y + size.h / 2 }
    return { x, y: y + size.h / 2 }
  }
  if (targetHandle === 'left') return { x, y: y + size.h / 2 }
  if (targetHandle === 'right') return { x: x + size.w, y: y + size.h / 2 }
  if (targetHandle === 'bottom') return { x: x + size.w / 2, y: y + size.h }
  return { x: x + size.w / 2, y }
}

/**
 * Build a unique orthogonal path for one edge. Slot index spreads parallel
 * edges so they never share a horizontal (or vertical) bus. Approach points
 * near the target are also offset so joins do not collapse into one vertical.
 */
/** True when the edge points against the primary flow direction (a cycle / back edge). */
export function isBackEdge(
  start: Point,
  end: Point,
  direction: 'DOWN' | 'RIGHT',
): boolean {
  if (direction === 'DOWN') return end.y < start.y - 8
  return end.x < start.x - 8
}

/** Side-route a back edge around the bounding box of obstacles (never through cards). */
export function buildBackEdgeDetour(
  start: Point,
  end: Point,
  direction: 'DOWN' | 'RIGHT',
  obstacles: Array<{ x: number; y: number; w: number; h: number }>,
  slot = 0,
  gap = MIN_EDGE_GAP,
): Point[] {
  const pad = gap * 2 + slot * gap
  // Stagger the final approach so it never shares the target's centre axis with
  // outbound edges (opposite-direction shared segments cause bow-tie markers).
  const approach = (slot % 2 === 0 ? -1 : 1) * (24 + slot * 10)
  if (direction === 'DOWN') {
    const maxRight = Math.max(
      start.x,
      end.x,
      ...obstacles.map((o) => o.x + o.w),
      start.x,
    )
    const minLeft = Math.min(
      start.x,
      end.x,
      ...obstacles.map((o) => o.x),
      start.x,
    )
    const maxBottom = Math.max(
      start.y,
      end.y,
      ...obstacles.map((o) => o.y + o.h),
      start.y,
    )
    // Alternate left/right so multiple back edges do not share a channel.
    const useRight = slot % 2 === 0
    const railX = useRight ? maxRight + pad + 24 : minLeft - pad - 24
    // Run the long horizontal below every obstacle so it cannot clip a sibling card.
    const highwayY = maxBottom + pad + 24
    const endX = end.x + approach
    return markRouted(
      sanitizePolyline([
        { x: start.x, y: start.y + gap },
        { x: start.x, y: highwayY },
        { x: railX, y: highwayY },
        { x: railX, y: end.y - gap },
        { x: endX, y: end.y - gap },
        { x: endX, y: end.y },
      ]),
    )
  }
  const maxBottom = Math.max(
    start.y,
    end.y,
    ...obstacles.map((o) => o.y + o.h),
    start.y,
  )
  const minTop = Math.min(start.y, end.y, ...obstacles.map((o) => o.y), start.y)
  const maxRight = Math.max(
    start.x,
    end.x,
    ...obstacles.map((o) => o.x + o.w),
    start.x,
  )
  const useBottom = slot % 2 === 0
  const railY = useBottom ? maxBottom + pad + 24 : minTop - pad - 24
  const highwayX = maxRight + pad + 24
  const endY = end.y + approach
  return markRouted(
    sanitizePolyline([
      { x: start.x + gap, y: start.y },
      { x: highwayX, y: start.y },
      { x: highwayX, y: railY },
      { x: end.x - gap, y: railY },
      { x: end.x - gap, y: endY },
      { x: end.x, y: endY },
    ]),
  )
}

/** Side route that hugs the right/bottom of local obstacles without a full highway. */
export function buildMildSideRoute(
  start: Point,
  end: Point,
  direction: 'DOWN' | 'RIGHT',
  obstacles: Array<{ x: number; y: number; w: number; h: number }>,
  slot = 0,
  gap = MIN_EDGE_GAP,
): Point[] {
  const pad = gap + slot * gap
  const approach = (slot % 2 === 0 ? -1 : 1) * (16 + (slot % 5) * 8)
  if (direction === 'DOWN') {
    const maxRight = Math.max(
      start.x,
      end.x,
      ...obstacles.map((o) => o.x + o.w),
      start.x,
    )
    const minLeft = Math.min(start.x, end.x, ...obstacles.map((o) => o.x), start.x)
    const useRight = slot % 2 === 0
    const railX = useRight ? maxRight + pad + 16 : minLeft - pad - 16
    const endX = end.x + approach
    return markRouted(
      sanitizePolyline([
        { x: start.x, y: start.y + gap },
        { x: railX, y: start.y + gap },
        { x: railX, y: end.y - gap },
        { x: endX, y: end.y - gap },
        { x: endX, y: end.y },
      ]),
    )
  }
  const maxBottom = Math.max(
    start.y,
    end.y,
    ...obstacles.map((o) => o.y + o.h),
    start.y,
  )
  const minTop = Math.min(start.y, end.y, ...obstacles.map((o) => o.y), start.y)
  const useBottom = slot % 2 === 0
  const railY = useBottom ? maxBottom + pad + 16 : minTop - pad - 16
  const endY = end.y + approach
  return markRouted(
    sanitizePolyline([
      { x: start.x + gap, y: start.y },
      { x: start.x + gap, y: railY },
      { x: end.x - gap, y: railY },
      { x: end.x - gap, y: endY },
      { x: end.x, y: endY },
    ]),
  )
}

export function buildUniqueElbow(
  start: Point,
  end: Point,
  direction: 'DOWN' | 'RIGHT',
  slot: number,
  gap = MIN_EDGE_GAP,
): Point[] {
  // Alternate sides: 0, +g, -g, +2g, -2g...
  const signed = slot === 0 ? 0 : (slot % 2 === 1 ? 1 : -1) * Math.ceil(slot / 2) * gap
  // Always stagger the target approach (including slot 0) so a join never
  // shares a vertical with a sibling whose source sits on the target centre.
  const approachSign = slot % 2 === 0 ? -1 : 1
  const approach = approachSign * Math.min(28, (Math.floor(slot / 2) + 1) * 10)

  if (direction === 'DOWN') {
    const midY = (start.y + end.y) / 2 + signed
    const endX = end.x + approach
    // Leave a short exclusive vertical stub: never drop midY onto another edge's lane.
    return markRouted(
      sanitizePolyline([
        { x: start.x, y: midY },
        { x: endX, y: midY },
        { x: endX, y: end.y },
      ]),
    )
  }
  const midX = (start.x + end.x) / 2 + signed
  const endY = end.y + approach
  return markRouted(
    sanitizePolyline([
      { x: midX, y: start.y },
      { x: midX, y: endY },
      { x: end.x, y: endY },
    ]),
  )
}

function obstaclesForEdge(
  edge: RoutedEdge,
  nodes: SizedNode[],
  sizeOf: (n: SizedNode) => { w: number; h: number },
): Array<{ x: number; y: number; w: number; h: number }> {
  return nodes
    .filter((n) => n.id !== edge.source && n.id !== edge.target)
    .map((n) => {
      const s = sizeOf(n)
      return { x: n.position.x, y: n.position.y, w: s.w, h: s.h }
    })
}

function bendsHitObstacle(
  start: Point,
  end: Point,
  bends: Point[],
  obstacles: Array<{ x: number; y: number; w: number; h: number }>,
): boolean {
  const points = [start, ...bends, end]
  for (let i = 1; i < points.length; i += 1) {
    const seg = {
      x1: points[i - 1].x,
      y1: points[i - 1].y,
      x2: points[i].x,
      y2: points[i].y,
    }
    for (const box of obstacles) {
      if (segmentHitsRect(seg, box, 2)) return true
    }
  }
  return false
}

/**
 * Route every edge with its own channel. Used after node positions are final
 * (including branch-order fixes) so waypoints match the placed graph.
 */
export function routeEdgesIndependently(
  nodes: SizedNode[],
  edges: RoutedEdge[],
  sizeOf: (n: SizedNode) => { w: number; h: number },
  direction: 'DOWN' | 'RIGHT' = 'DOWN',
): Map<string, Point[]> {
  const byId = new Map(nodes.map((n) => [n.id, n]))
  // Group edges that share a source→layer so slots stay local.
  const groupKey = (e: RoutedEdge) => {
    const src = byId.get(e.source)
    const tgt = byId.get(e.target)
    if (!src || !tgt) return e.id
    const layer =
      direction === 'DOWN'
        ? `${Math.round(src.position.y)}->${Math.round(tgt.position.y)}`
        : `${Math.round(src.position.x)}->${Math.round(tgt.position.x)}`
    return layer
  }
  const groups = new Map<string, RoutedEdge[]>()
  for (const e of edges) {
    const key = groupKey(e)
    const list = groups.get(key) ?? []
    list.push(e)
    groups.set(key, list)
  }

  const waypoints = new Map<string, Point[]>()
  for (const list of groups.values()) {
    // Stable slot by source handle / source id so branch chips keep order.
    const ranked = [...list].sort((a, b) => {
      const ah = a.sourceHandle ?? ''
      const bh = b.sourceHandle ?? ''
      if (ah !== bh) return ah.localeCompare(bh)
      return a.id.localeCompare(b.id)
    })
    // Count geometric reverse edges for stable left/right rail assignment.
    let backSlot = 0
    ranked.forEach((e, slot) => {
      const src = byId.get(e.source)
      const tgt = byId.get(e.target)
      if (!src || !tgt) return
      const start = estimateSourcePoint(src, sizeOf(src), e.sourceHandle, direction)
      const end = estimateTargetPoint(tgt, sizeOf(tgt), undefined, direction)
      const obstacles = obstaclesForEdge(e, nodes, sizeOf)
      const reverse = isBackEdge(start, end, direction)
      let bends = reverse
        ? buildMildSideRoute(start, end, direction, obstacles, slot)
        : buildUniqueElbow(start, end, direction, slot)
      // Bump the channel until the polyline clears foreign node boxes.
      for (
        let bump = 1;
        bump <= 12 && bendsHitObstacle(start, end, bends, obstacles);
        bump += 1
      ) {
        bends = reverse
          ? buildMildSideRoute(start, end, direction, obstacles, slot + bump * 2)
          : buildUniqueElbow(start, end, direction, slot + bump * 2)
      }
      // Full highway detour only when mild routing still clips (true cycle edges).
      if (bendsHitObstacle(start, end, bends, obstacles)) {
        bends = buildBackEdgeDetour(start, end, direction, obstacles, backSlot)
        backSlot += 1
        for (let bump = 1; bump <= 4 && bendsHitObstacle(start, end, bends, obstacles); bump += 1) {
          bends = buildBackEdgeDetour(start, end, direction, obstacles, backSlot + bump)
        }
      }
      waypoints.set(e.id, sanitizePolyline(bends))
    })
  }

  // Final separation pass for any leftover shared channels (incl. opposite dir).
  const forSeparate = edges.map((e) => {
    const src = byId.get(e.source)
    const tgt = byId.get(e.target)
    const start = src
      ? estimateSourcePoint(src, sizeOf(src), e.sourceHandle, direction)
      : { x: 0, y: 0 }
    const end = tgt
      ? estimateTargetPoint(tgt, sizeOf(tgt), undefined, direction)
      : { x: 0, y: 0 }
    const bends = waypoints.get(e.id) ?? []
    return {
      id: e.id,
      source: e.source,
      sourceHandle: e.sourceHandle,
      points: sanitizePolyline([start, ...bends, end]),
    }
  })
  const separated = separateSharedSegments(forSeparate, gapFromDirection(direction))
  for (const e of edges) {
    const full = separated.get(e.id)
    if (!full || full.length < 2) continue
    waypoints.set(e.id, sanitizePolyline(full).slice(1, -1))
  }
  return waypoints
}

function gapFromDirection(_direction: 'DOWN' | 'RIGHT'): number {
  return MIN_EDGE_GAP
}

/** Axis-aligned segment vs padded rect: true when the open segment crosses the interior. */
export function segmentHitsRect(
  s: Segment,
  rect: { x: number; y: number; w: number; h: number },
  pad = 0,
): boolean {
  const left = rect.x - pad
  const right = rect.x + rect.w + pad
  const top = rect.y - pad
  const bottom = rect.y + rect.h + pad
  // Ignore zero-length.
  if (segmentLength(s) < 1) return false

  const minX = Math.min(s.x1, s.x2)
  const maxX = Math.max(s.x1, s.x2)
  const minY = Math.min(s.y1, s.y2)
  const maxY = Math.max(s.y1, s.y2)

  if (nearlyEqual(s.y1, s.y2)) {
    // Horizontal: crosses interior if y inside and x-span overlaps width strictly.
    if (s.y1 <= top || s.y1 >= bottom) return false
    return minX < right && maxX > left
  }
  if (nearlyEqual(s.x1, s.x2)) {
    if (s.x1 <= left || s.x1 >= right) return false
    return minY < bottom && maxY > top
  }
  return false
}

export function pathPointsForEdge(
  edge: RoutedEdge,
  nodes: SizedNode[],
  sizeOf: (n: SizedNode) => { w: number; h: number },
  direction: 'DOWN' | 'RIGHT' = 'DOWN',
): Point[] {
  const src = nodes.find((n) => n.id === edge.source)
  const tgt = nodes.find((n) => n.id === edge.target)
  if (!src || !tgt) return edge.waypoints ?? []
  const start = estimateSourcePoint(src, sizeOf(src), edge.sourceHandle, direction)
  const end = estimateTargetPoint(tgt, sizeOf(tgt), undefined, direction)
  const bends = edge.waypoints ?? []
  return sanitizePolyline([start, ...bends, end])
}
