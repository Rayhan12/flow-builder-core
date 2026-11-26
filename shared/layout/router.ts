/**
 * Orthogonal visibility-graph + A* edge router.
 * Keeps edges off cards (clearance), leaves/enters perpendicular to handles,
 * and prefers short paths with few bends that stay apart from other edges.
 */

import {
  applyElbowOffsets,
  estimateSourcePoint,
  estimateTargetPoint,
  isBackEdge,
  resolveEdgeHandles,
  sanitizePolyline,
  segmentHitsRect,
  separateSharedSegments,
  type Point,
  type RoutedEdge,
  type SizedNode,
} from './edgeRouting.ts'

/**
 * Keep-out padding around cards for orthogonal routing.
 * Obstacles are inflated by this amount; effective visual gap stays >= 12px.
 */
export const EDGE_CLEARANCE = 16
export const PARALLEL_GAP = 10
/** Inflate node boxes by this amount when testing "edge through card". */
export const THROUGH_INFLATE = 8
export const BEND_PENALTY = 36
export const PROXIMITY_PENALTY = 12
/** Rounded elbow corners: 8 to 12px. */
export const CORNER_RADIUS = 10
export const EDGE_STROKE = 1.5
export const EDGE_COLOR = '#94A3B8'
export const EDGE_COLOR_HOVER = '#64748B'
/** Snap manual elbow offsets back to auto within this distance (px). */
export const ELBOW_OFFSET_SNAP = 10

export type Dir = 'N' | 'S' | 'E' | 'W'
export type Rect = { x: number; y: number; w: number; h: number }
type Segment = { x1: number; y1: number; x2: number; y2: number }

function nearly(a: number, b: number, eps = 0.75): boolean {
  return Math.abs(a - b) <= eps
}

function inflate(r: Rect, pad: number): Rect {
  return { x: r.x - pad, y: r.y - pad, w: r.w + pad * 2, h: r.h + pad * 2 }
}

function pointInside(p: Point, r: Rect, eps = 0.5): boolean {
  return p.x > r.x + eps && p.x < r.x + r.w - eps && p.y > r.y + eps && p.y < r.y + r.h - eps
}

function opposite(d: Dir): Dir {
  if (d === 'N') return 'S'
  if (d === 'S') return 'N'
  if (d === 'E') return 'W'
  return 'E'
}

function offset(p: Point, d: Dir, dist: number): Point {
  if (d === 'N') return { x: p.x, y: p.y - dist }
  if (d === 'S') return { x: p.x, y: p.y + dist }
  if (d === 'E') return { x: p.x + dist, y: p.y }
  return { x: p.x - dist, y: p.y }
}

function dirOf(a: Point, b: Point): Dir | null {
  if (nearly(a.x, b.x) && b.y < a.y) return 'N'
  if (nearly(a.x, b.x) && b.y > a.y) return 'S'
  if (nearly(a.y, b.y) && b.x > a.x) return 'E'
  if (nearly(a.y, b.y) && b.x < a.x) return 'W'
  return null
}

function markRouted(points: Point[]): Point[] {
  return points.map((p) => ({ x: p.x, y: p.y, routed: true as const }))
}

function pointsToSegments(points: Point[]): Segment[] {
  const segs: Segment[] = []
  for (let i = 1; i < points.length; i += 1) {
    segs.push({
      x1: points[i - 1].x,
      y1: points[i - 1].y,
      x2: points[i].x,
      y2: points[i].y,
    })
  }
  return segs
}

function segmentClear(s: Segment, obstacles: Rect[]): boolean {
  for (const box of obstacles) {
    if (segmentHitsRect(s, box, 0)) return false
  }
  return true
}

function pathHits(points: Point[], obstacles: Rect[]): boolean {
  for (let i = 1; i < points.length; i += 1) {
    if (
      !segmentClear(
        { x1: points[i - 1].x, y1: points[i - 1].y, x2: points[i].x, y2: points[i].y },
        obstacles,
      )
    ) {
      return true
    }
  }
  return false
}

/** Distance from a point to the nearest existing collinear-parallel channel. */
function proximityCost(seg: Segment, existing: Segment[], minGap: number): number {
  if (!existing.length) return 0
  let cost = 0
  const horiz = nearly(seg.y1, seg.y2)
  for (const other of existing) {
    const oHoriz = nearly(other.y1, other.y2)
    if (horiz !== oHoriz) continue
    if (horiz) {
      const dy = Math.abs(seg.y1 - other.y1)
      if (dy >= minGap) continue
      const aMin = Math.min(seg.x1, seg.x2)
      const aMax = Math.max(seg.x1, seg.x2)
      const bMin = Math.min(other.x1, other.x2)
      const bMax = Math.max(other.x1, other.x2)
      const overlap = Math.max(0, Math.min(aMax, bMax) - Math.max(aMin, bMin))
      if (overlap > 4) cost += (minGap - dy) * PROXIMITY_PENALTY
    } else {
      const dx = Math.abs(seg.x1 - other.x1)
      if (dx >= minGap) continue
      const aMin = Math.min(seg.y1, seg.y2)
      const aMax = Math.max(seg.y1, seg.y2)
      const bMin = Math.min(other.y1, other.y2)
      const bMax = Math.max(other.y1, other.y2)
      const overlap = Math.max(0, Math.min(aMax, bMax) - Math.max(aMin, bMin))
      if (overlap > 4) cost += (minGap - dx) * PROXIMITY_PENALTY
    }
  }
  return cost
}

export function handleLeaveDir(
  sourceHandle: string | undefined,
  kind: string,
  direction: 'DOWN' | 'RIGHT',
): Dir {
  if (sourceHandle === 'top') return 'N'
  if (sourceHandle === 'bottom') return 'S'
  if (sourceHandle === 'left') return 'W'
  if (sourceHandle === 'right') return 'E'
  if (
    (kind === 'decision' || kind === 'switch') &&
    sourceHandle &&
    sourceHandle !== 'bottom' &&
    sourceHandle !== 'right'
  ) {
    return direction === 'DOWN' ? 'S' : 'E'
  }
  return direction === 'DOWN' ? 'S' : 'E'
}

export function handleEnterDir(
  targetHandle: string | undefined,
  direction: 'DOWN' | 'RIGHT',
): Dir {
  if (targetHandle === 'top') return 'N'
  if (targetHandle === 'bottom') return 'S'
  if (targetHandle === 'left') return 'W'
  if (targetHandle === 'right') return 'E'
  return direction === 'DOWN' ? 'N' : 'W'
}

function uniqueSorted(values: number[], eps = 0.5): number[] {
  const sorted = [...values].sort((a, b) => a - b)
  const out: number[] = []
  for (const v of sorted) {
    if (!out.length || Math.abs(out[out.length - 1] - v) > eps) out.push(v)
  }
  return out
}

type NodeKey = string
function keyOf(p: Point): NodeKey {
  return `${Math.round(p.x * 2) / 2},${Math.round(p.y * 2) / 2}`
}

/**
 * Route a single orthogonal edge with obstacle avoidance.
 * Returns full polyline including start and end (caller may strip ends for waypoints).
 */
export function routeOrthogonal(
  start: Point,
  end: Point,
  leaveDir: Dir,
  enterDir: Dir,
  obstacles: Rect[],
  existing: Segment[] = [],
  options: { backEdge?: boolean; slot?: number; clearance?: number } = {},
): Point[] {
  const clearance = options.clearance ?? EDGE_CLEARANCE
  const slot = options.slot ?? 0
  const inflated = obstacles.map((o) => inflate(o, clearance))

  const stub = Math.max(clearance, 12)
  const exit = offset(start, leaveDir, stub)
  const entry = offset(end, opposite(enterDir), stub)

  // Fast path: simple elbows that stay clear.
  const slotOff =
    slot === 0 ? 0 : (slot % 2 === 1 ? 1 : -1) * Math.ceil(slot / 2) * PARALLEL_GAP
  const elbowCandidates: Point[][] = []
  if (leaveDir === 'S' || leaveDir === 'N') {
    const midY = (exit.y + entry.y) / 2 + slotOff
    elbowCandidates.push([
      { x: exit.x, y: midY },
      { x: entry.x, y: midY },
    ])
    elbowCandidates.push([
      { x: exit.x + slotOff, y: exit.y },
      { x: exit.x + slotOff, y: entry.y },
      { x: entry.x, y: entry.y },
    ])
  } else {
    const midX = (exit.x + entry.x) / 2 + slotOff
    elbowCandidates.push([
      { x: midX, y: exit.y },
      { x: midX, y: entry.y },
    ])
    elbowCandidates.push([
      { x: exit.x, y: exit.y + slotOff },
      { x: entry.x, y: exit.y + slotOff },
      { x: entry.x, y: entry.y },
    ])
  }
  // Z-shapes
  elbowCandidates.push([
    { x: exit.x, y: exit.y },
    { x: entry.x, y: exit.y },
    { x: entry.x, y: entry.y },
  ])
  elbowCandidates.push([
    { x: exit.x, y: exit.y },
    { x: exit.x, y: entry.y },
    { x: entry.x, y: entry.y },
  ])

  let bestSimple: Point[] | null = null
  let bestSimpleCost = Infinity
  for (const bends of elbowCandidates) {
    const full = sanitizePolyline([start, exit, ...bends, entry, end])
    if (pathHits(full, inflated)) continue
    const segs = pointsToSegments(full)
    let cost = 0
    let bendsCount = 0
    let prevDir: Dir | null = null
    for (let i = 1; i < full.length; i += 1) {
      const d = dirOf(full[i - 1], full[i])
      const len = Math.hypot(full[i].x - full[i - 1].x, full[i].y - full[i - 1].y)
      cost += len
      if (prevDir && d && d !== prevDir) bendsCount += 1
      prevDir = d
      cost += proximityCost(segs[i - 1], existing, PARALLEL_GAP)
    }
    cost += bendsCount * BEND_PENALTY
    if (cost < bestSimpleCost) {
      bestSimpleCost = cost
      bestSimple = full
    }
  }
  if (bestSimple && bestSimpleCost < 1e6) {
    return markRouted(bestSimple)
  }

  // Visibility-graph A* on obstacle corners + exit/entry.
  const path = astarOrthogonal(exit, entry, inflated, existing, leaveDir, enterDir)
  if (path && path.length) {
    return markRouted(sanitizePolyline([start, ...path, end]))
  }

  // Outside highway for back edges / hard cases.
  return markRouted(
    highwayDetour(start, end, leaveDir, enterDir, obstacles, slot, clearance),
  )
}

/** Side/highway detour that runs outside the obstacle bounding box. */
function highwayDetour(
  start: Point,
  end: Point,
  leaveDir: Dir,
  _enterDir: Dir,
  obstacles: Rect[],
  slot: number,
  clearance: number,
): Point[] {
  const pad = clearance * 2 + slot * PARALLEL_GAP
  const approach = (slot % 2 === 0 ? -1 : 1) * (24 + slot * 10)
  const maxRight = Math.max(start.x, end.x, ...obstacles.map((o) => o.x + o.w), start.x)
  const minLeft = Math.min(start.x, end.x, ...obstacles.map((o) => o.x), start.x)
  const maxBottom = Math.max(start.y, end.y, ...obstacles.map((o) => o.y + o.h), start.y)
  const minTop = Math.min(start.y, end.y, ...obstacles.map((o) => o.y), start.y)
  const verticalFlow = leaveDir === 'N' || leaveDir === 'S'
  if (verticalFlow) {
    const useRight = slot % 2 === 0
    const railX = useRight ? maxRight + pad + 24 : minLeft - pad - 24
    const highwayY = maxBottom + pad + 24
    const endX = end.x + approach
    return sanitizePolyline([
      start,
      { x: start.x, y: start.y + clearance },
      { x: railX, y: start.y + clearance },
      { x: railX, y: highwayY },
      { x: endX, y: highwayY },
      { x: endX, y: end.y },
      end,
    ])
  }
  const useBottom = slot % 2 === 0
  const railY = useBottom ? maxBottom + pad + 24 : minTop - pad - 24
  const highwayX = maxRight + pad + 24
  const endY = end.y + approach
  return sanitizePolyline([
    start,
    { x: start.x + clearance, y: start.y },
    { x: start.x + clearance, y: railY },
    { x: highwayX, y: railY },
    { x: highwayX, y: endY },
    { x: end.x, y: endY },
    end,
  ])
}

function astarOrthogonal(
  start: Point,
  goal: Point,
  obstacles: Rect[],
  existing: Segment[],
  _leaveDir: Dir,
  _enterDir: Dir,
): Point[] | null {
  // Limit search region to the corridor around start→goal plus a margin.
  const margin = 220
  const minX = Math.min(start.x, goal.x) - margin
  const maxX = Math.max(start.x, goal.x) + margin
  const minY = Math.min(start.y, goal.y) - margin
  const maxY = Math.max(start.y, goal.y) + margin

  const local = obstacles.filter(
    (o) => o.x + o.w >= minX && o.x <= maxX && o.y + o.h >= minY && o.y <= maxY,
  )

  const xs = uniqueSorted([
    start.x,
    goal.x,
    minX,
    maxX,
    ...local.flatMap((o) => [o.x, o.x + o.w]),
  ])
  const ys = uniqueSorted([
    start.y,
    goal.y,
    minY,
    maxY,
    ...local.flatMap((o) => [o.y, o.y + o.h]),
  ])

  // Cap grid size for pathological cases.
  const maxDim = 48
  const useXs = xs.length > maxDim ? thinCoords(xs, start.x, goal.x, maxDim) : xs
  const useYs = ys.length > maxDim ? thinCoords(ys, start.y, goal.y, maxDim) : ys

  const nodes: Point[] = []
  const index = new Map<NodeKey, Point>()
  function addPoint(p: Point) {
    if (p.x < minX - 1 || p.x > maxX + 1 || p.y < minY - 1 || p.y > maxY + 1) return
    if (local.some((o) => pointInside(p, o))) return
    const k = keyOf(p)
    if (index.has(k)) return
    const pt = { x: p.x, y: p.y }
    index.set(k, pt)
    nodes.push(pt)
  }

  addPoint(start)
  addPoint(goal)
  for (const x of useXs) {
    for (const y of useYs) {
      addPoint({ x, y })
    }
  }

  // Adjacency: for each x-column and y-row, connect consecutive clear points.
  const adj = new Map<NodeKey, Array<{ to: NodeKey; len: number }>>()
  function link(a: Point, b: Point) {
    const seg = { x1: a.x, y1: a.y, x2: b.x, y2: b.y }
    if (!segmentClear(seg, local)) return
    const ka = keyOf(a)
    const kb = keyOf(b)
    const len = Math.hypot(b.x - a.x, b.y - a.y)
    if (len < 0.5) return
    const la = adj.get(ka) ?? []
    la.push({ to: kb, len })
    adj.set(ka, la)
    const lb = adj.get(kb) ?? []
    lb.push({ to: ka, len })
    adj.set(kb, lb)
  }

  const byX = new Map<number, Point[]>()
  const byY = new Map<number, Point[]>()
  for (const p of nodes) {
    const xr = Math.round(p.x * 2) / 2
    const yr = Math.round(p.y * 2) / 2
    const col = byX.get(xr) ?? []
    col.push(p)
    byX.set(xr, col)
    const row = byY.get(yr) ?? []
    row.push(p)
    byY.set(yr, row)
  }
  for (const col of byX.values()) {
    col.sort((a, b) => a.y - b.y)
    for (let i = 1; i < col.length; i += 1) link(col[i - 1], col[i])
  }
  for (const row of byY.values()) {
    row.sort((a, b) => a.x - b.x)
    for (let i = 1; i < row.length; i += 1) link(row[i - 1], row[i])
  }

  const startKey = keyOf(start)
  const goalKey = keyOf(goal)
  if (!index.has(startKey) || !index.has(goalKey)) return null

  type State = { key: NodeKey; g: number; f: number; dir: Dir | null }
  const open: State[] = [
    {
      key: startKey,
      g: 0,
      f: Math.hypot(goal.x - start.x, goal.y - start.y),
      dir: null,
    },
  ]
  const came = new Map<NodeKey, NodeKey>()
  const bestG = new Map<NodeKey, number>()
  bestG.set(startKey, 0)

  let steps = 0
  const maxSteps = 8000
  while (open.length && steps < maxSteps) {
    steps += 1
    open.sort((a, b) => a.f - b.f)
    const cur = open.shift()!
    if (cur.key === goalKey) {
      const path: Point[] = []
      let k: NodeKey | undefined = goalKey
      while (k) {
        const p = index.get(k)
        if (p) path.push(p)
        k = came.get(k)
      }
      path.reverse()
      return path
    }
    const from = index.get(cur.key)!
    for (const edge of adj.get(cur.key) ?? []) {
      const to = index.get(edge.to)!
      const d = dirOf(from, to)
      const bend = cur.dir && d && cur.dir !== d ? BEND_PENALTY : 0
      const prox = proximityCost(
        { x1: from.x, y1: from.y, x2: to.x, y2: to.y },
        existing,
        PARALLEL_GAP,
      )
      const g = cur.g + edge.len + bend + prox
      const prevBest = bestG.get(edge.to)
      if (prevBest !== undefined && g >= prevBest - 0.01) continue
      bestG.set(edge.to, g)
      came.set(edge.to, cur.key)
      const h = Math.abs(goal.x - to.x) + Math.abs(goal.y - to.y)
      open.push({ key: edge.to, g, f: g + h, dir: d })
    }
  }
  return null
}

function thinCoords(coords: number[], a: number, b: number, max: number): number[] {
  const lo = Math.min(a, b)
  const hi = Math.max(a, b)
  const must = coords.filter((c) => nearly(c, a) || nearly(c, b) || (c >= lo && c <= hi))
  if (must.length >= max) {
    const step = Math.ceil(must.length / max)
    return must.filter((_, i) => i % step === 0 || nearly(must[i], a) || nearly(must[i], b))
  }
  const extra = coords.filter((c) => !must.some((m) => nearly(m, c)))
  const need = max - must.length
  const step = Math.max(1, Math.ceil(extra.length / need))
  return uniqueSorted([...must, ...extra.filter((_, i) => i % step === 0)])
}

function obstaclesForEdge(
  edge: RoutedEdge,
  nodes: SizedNode[],
  sizeOf: (n: SizedNode) => { w: number; h: number },
): Rect[] {
  return nodes
    .filter((n) => {
      if (n.id === edge.source || n.id === edge.target) return false
      if (n.kind === 'sticky' || n.kind === 'group' || n.kind === 'section') return false
      if ((n as { parentId?: string }).parentId) return false
      return true
    })
    .map((n) => {
      const s = sizeOf(n)
      return { x: n.position.x, y: n.position.y, w: s.w, h: s.h }
    })
}

/**
 * Route every edge with the visibility-graph A* router, then nudge parallel
 * segments at least PARALLEL_GAP apart. Returns bend waypoints (excludes ends).
 */
export function routeEdgesWithRouter(
  nodes: SizedNode[],
  edges: RoutedEdge[],
  sizeOf: (n: SizedNode) => { w: number; h: number },
  direction: 'DOWN' | 'RIGHT' = 'DOWN',
): Map<string, Point[]> {
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const ranked = [...edges].sort((a, b) => {
    const ah = a.sourceHandle ?? ''
    const bh = b.sourceHandle ?? ''
    if (ah !== bh) return ah.localeCompare(bh)
    return a.id.localeCompare(b.id)
  })

  const existing: Segment[] = []
  const fullPaths = new Map<string, Point[]>()
  let backSlot = 0

  ranked.forEach((e, slot) => {
    const src = byId.get(e.source)
    const tgt = byId.get(e.target)
    if (!src || !tgt) return
    const srcSize = sizeOf(src)
    const tgtSize = sizeOf(tgt)
    const handles = resolveEdgeHandles(e, src, tgt, srcSize, tgtSize)
    const start = estimateSourcePoint(src, srcSize, handles.sourceHandle, direction)
    const end = estimateTargetPoint(tgt, tgtSize, handles.targetHandle, direction)
    const leave = handleLeaveDir(handles.sourceHandle, src.kind, direction)
    const enter = handleEnterDir(handles.targetHandle, direction)
    const obstacles = obstaclesForEdge(e, nodes, sizeOf)
    const reverse = isBackEdge(start, end, direction)
    const useSlot = reverse ? backSlot++ : slot
    let full = routeOrthogonal(start, end, leave, enter, obstacles, existing, {
      backEdge: reverse,
      slot: useSlot,
    })
    full = applyElbowOffsets(full, e.data?.elbowOffsets, ELBOW_OFFSET_SNAP)
    fullPaths.set(e.id, full)
    existing.push(...pointsToSegments(full))
  })

  const forSeparate = edges.map((e) => ({
    id: e.id,
    source: e.source,
    sourceHandle: e.sourceHandle,
    points: fullPaths.get(e.id) ?? [],
  }))
  let separated = separateSharedSegments(forSeparate, PARALLEL_GAP + 2)

  const allObstacles = nodes
    .filter((n) => n.kind !== 'sticky' && n.kind !== 'group' && n.kind !== 'section')
    .map((n) => {
      const s = sizeOf(n)
      return { id: n.id, x: n.position.x, y: n.position.y, w: s.w, h: s.h }
    })

  function pathHitsNode(
    full: Point[],
    edge: RoutedEdge,
  ): boolean {
    const foreign = allObstacles.filter((o) => o.id !== edge.source && o.id !== edge.target)
    return foreign.some((o) => {
      for (let i = 1; i < full.length; i += 1) {
        if (
          segmentHitsRect(
            { x1: full[i - 1].x, y1: full[i - 1].y, x2: full[i].x, y2: full[i].y },
            o,
            THROUGH_INFLATE,
          )
        ) {
          return true
        }
      }
      return false
    })
  }

  function forceClearRoute(e: RoutedEdge, slot: number): Point[] | null {
    const src = byId.get(e.source)
    const tgt = byId.get(e.target)
    if (!src || !tgt) return null
    const srcSize = sizeOf(src)
    const tgtSize = sizeOf(tgt)
    const handles = resolveEdgeHandles(e, src, tgt, srcSize, tgtSize)
    const start = estimateSourcePoint(src, srcSize, handles.sourceHandle, direction)
    const end = estimateTargetPoint(tgt, tgtSize, handles.targetHandle, direction)
    const leave = handleLeaveDir(handles.sourceHandle, src.kind, direction)
    const enter = handleEnterDir(handles.targetHandle, direction)
    const foreign = allObstacles.filter((o) => o.id !== e.source && o.id !== e.target)
    let full = routeOrthogonal(start, end, leave, enter, foreign, [], {
      backEdge: true,
      slot,
      clearance: EDGE_CLEARANCE,
    })
    full = applyElbowOffsets(full, e.data?.elbowOffsets, ELBOW_OFFSET_SNAP)
    return full
  }

  // Nudge → validate → highway re-route any clippers; repeat so nudges cannot rest on cards.
  for (let round = 0; round < 3; round += 1) {
    let dirty = false
    for (const e of edges) {
      const full = separated.get(e.id)
      if (!full || full.length < 2) continue
      if (!pathHitsNode(full, e)) continue
      const cleared = forceClearRoute(e, 4 + round * 3 + (e.id.length % 4))
      if (cleared) {
        separated.set(e.id, cleared)
        dirty = true
      }
    }
    if (!dirty && round > 0) break
    separated = separateSharedSegments(
      edges.map((e) => ({
        id: e.id,
        source: e.source,
        sourceHandle: e.sourceHandle,
        points: separated.get(e.id) ?? fullPaths.get(e.id) ?? [],
      })),
      PARALLEL_GAP,
    )
  }

  // Last validation pass without further nudging into cards.
  for (const e of edges) {
    const full = separated.get(e.id)
    if (!full || !pathHitsNode(full, e)) continue
    const cleared = forceClearRoute(e, 12 + (e.id.length % 5))
    if (cleared && !pathHitsNode(cleared, e)) separated.set(e.id, cleared)
  }

  const waypoints = new Map<string, Point[]>()
  for (const e of edges) {
    const full = separated.get(e.id) ?? fullPaths.get(e.id)
    if (!full || full.length < 2) continue
    // Store bends only (React Flow supplies live handle endpoints).
    waypoints.set(e.id, sanitizePolyline(full).slice(1, -1))
  }
  return waypoints
}

/** Mix hex colors: amount is weight of `toward` (0..1). */
export function mixHex(base: string, toward: string, amount: number): string {
  const parse = (h: string) => {
    const s = h.replace('#', '')
    const full =
      s.length === 3
        ? s
            .split('')
            .map((c) => c + c)
            .join('')
        : s
    return [
      parseInt(full.slice(0, 2), 16),
      parseInt(full.slice(2, 4), 16),
      parseInt(full.slice(4, 6), 16),
    ] as const
  }
  try {
    const [r1, g1, b1] = parse(base)
    const [r2, g2, b2] = parse(toward)
    const t = Math.max(0, Math.min(1, amount))
    const r = Math.round(r1 + (r2 - r1) * t)
    const g = Math.round(g1 + (g2 - g1) * t)
    const b = Math.round(b1 + (b2 - b1) * t)
    return `#${[r, g, b].map((n) => n.toString(16).padStart(2, '0')).join('')}`
  } catch {
    return base
  }
}

/**
 * Build an SVG path with rounded orthogonal corners (quadratic arcs).
 * Radius clamps to 8..12 and to half the shorter adjacent segment.
 */
export function roundedOrthogonalPath(
  points: Point[],
  radius = CORNER_RADIUS,
): string {
  const cleaned = sanitizePolyline(points)
  if (cleaned.length < 2) {
    if (!cleaned.length) return ''
    return `M ${cleaned[0].x} ${cleaned[0].y}`
  }
  if (cleaned.length === 2) {
    return `M ${cleaned[0].x} ${cleaned[0].y} L ${cleaned[1].x} ${cleaned[1].y}`
  }

  const rMax = Math.max(8, Math.min(12, radius))
  let d = `M ${cleaned[0].x} ${cleaned[0].y}`
  for (let i = 1; i < cleaned.length - 1; i += 1) {
    const prev = cleaned[i - 1]
    const cur = cleaned[i]
    const next = cleaned[i + 1]
    const len1 = Math.hypot(cur.x - prev.x, cur.y - prev.y)
    const len2 = Math.hypot(next.x - cur.x, next.y - cur.y)
    const r = Math.min(rMax, len1 / 2, len2 / 2)
    if (r < 1.5) {
      d += ` L ${cur.x} ${cur.y}`
      continue
    }
    const dx1 = (cur.x - prev.x) / (len1 || 1)
    const dy1 = (cur.y - prev.y) / (len1 || 1)
    const dx2 = (next.x - cur.x) / (len2 || 1)
    const dy2 = (next.y - cur.y) / (len2 || 1)
    const before = { x: cur.x - dx1 * r, y: cur.y - dy1 * r }
    const after = { x: cur.x + dx2 * r, y: cur.y + dy2 * r }
    d += ` L ${before.x} ${before.y}`
    d += ` Q ${cur.x} ${cur.y} ${after.x} ${after.y}`
  }
  const last = cleaned[cleaned.length - 1]
  d += ` L ${last.x} ${last.y}`
  return d
}

/** Pick a label anchor on the first straight segment long enough, else best candidate. */
export function pickLabelPoint(
  points: Point[],
  obstacles: Rect[],
  occupied: Rect[] = [],
  minSeg = 48,
): { x: number; y: number; t: number } {
  const segs: Array<{ a: Point; b: Point; len: number; t0: number; t1: number }> = []
  let total = 0
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1]
    const b = points[i]
    const len = Math.hypot(b.x - a.x, b.y - a.y)
    segs.push({ a, b, len, t0: total, t1: total + len })
    total += len
  }
  if (!segs.length || total < 1) {
    return { x: points[0]?.x ?? 0, y: points[0]?.y ?? 0, t: 0.5 }
  }

  const candidates: Array<{ x: number; y: number; t: number; score: number }> = []
  // Prefer early long segments near the source.
  for (const seg of segs) {
    if (seg.len < minSeg && seg !== segs[0]) continue
    for (const frac of [0.35, 0.5, 0.65, 0.25, 0.75]) {
      if (seg.len < minSeg && frac !== 0.5) continue
      const x = seg.a.x + (seg.b.x - seg.a.x) * frac
      const y = seg.a.y + (seg.b.y - seg.a.y) * frac
      const pill = { x: x - 40, y: y - 10, w: 80, h: 20 }
      const hitsCard = obstacles.some(
        (o) =>
          pill.x < o.x + o.w &&
          pill.x + pill.w > o.x &&
          pill.y < o.y + o.h &&
          pill.y + pill.h > o.y,
      )
      const hitsLabel = occupied.some(
        (o) =>
          pill.x < o.x + o.w &&
          pill.x + pill.w > o.x &&
          pill.y < o.y + o.h &&
          pill.y + pill.h > o.y,
      )
      if (hitsCard || hitsLabel) continue
      const t = total > 0 ? (seg.t0 + seg.len * frac) / total : 0.5
      // Prefer earlier segments that are long.
      const score = seg.len - t * 40
      candidates.push({ x, y, t, score })
    }
  }
  candidates.sort((a, b) => b.score - a.score)
  if (candidates.length) return candidates[0]
  const mid = segs[0]
  return {
    x: (mid.a.x + mid.b.x) / 2,
    y: (mid.a.y + mid.b.y) / 2,
    t: 0.5,
  }
}
