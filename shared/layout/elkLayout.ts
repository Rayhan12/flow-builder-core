/**
 * Pure ELK layered layout shared by the editor worker and the MCP/admin port.
 * Uses elkjs/lib/elk.bundled.js so it runs in both browser and Node.
 */
import ELK, { type ElkExtendedEdge, type ElkNode, type ElkPort } from 'elkjs/lib/elk.bundled.js'
import { detectConflicts, resolveConflicts } from './conflicts.ts'
import {
  extractElkBendPoints,
  routeEdgesIndependently,
} from './edgeRouting.ts'
import {
  EDGE_EDGE_SPACING,
  EDGE_NODE_SPACING,
  GROUP_HEADER,
  GROUP_PADDING,
  LAYER_SPACING,
  NODE_NODE_SPACING,
  SIDE_COLUMN_GAP,
  defaultNodeSize,
  isAnnotationKind,
} from './nodeSizes.ts'
import type {
  LayoutDirection,
  LayoutEdgeLike,
  LayoutNodeLike,
  LayoutOptions,
  LayoutResult,
  LayoutWaypoint,
} from './types.ts'

type Branch = { id: string; label: string }

function branchesOf(node: LayoutNodeLike): Branch[] {
  const data = node.data
  if (!data || typeof data !== 'object') return []
  const raw = (data as { branches?: unknown }).branches
  if (!Array.isArray(raw)) return []
  return raw
    .filter(
      (b): b is { id: string; label?: string } =>
        !!b && typeof b === 'object' && typeof (b as { id?: unknown }).id === 'string',
    )
    .map((b) => ({ id: b.id, label: typeof b.label === 'string' ? b.label : '' }))
}

function portSideForDirection(
  direction: LayoutDirection,
  role: 'in' | 'out',
): 'NORTH' | 'SOUTH' | 'EAST' | 'WEST' {
  if (direction === 'RIGHT') {
    return role === 'in' ? 'WEST' : 'EAST'
  }
  return role === 'in' ? 'NORTH' : 'SOUTH'
}

function buildPorts(
  node: LayoutNodeLike,
  direction: LayoutDirection,
): ElkPort[] | undefined {
  if (node.kind !== 'decision' && node.kind !== 'switch') return undefined
  const branches = branchesOf(node)
  if (branches.length === 0) return undefined
  const inSide = portSideForDirection(direction, 'in')
  const outSide = portSideForDirection(direction, 'out')
  // SOUTH/EAST ports: lower index = left / top in ELK FIXED_ORDER.
  const ports: ElkPort[] = [
    {
      id: `${node.id}__in`,
      width: 1,
      height: 1,
      layoutOptions: {
        'elk.port.side': inSide,
        'elk.port.index': '0',
      },
    },
  ]
  branches.forEach((b, i) => {
    ports.push({
      id: `${node.id}__${b.id}`,
      width: 1,
      height: 1,
      layoutOptions: {
        'elk.port.side': outSide,
        // Separate index space per side; start at 0 for the first branch chip.
        'elk.port.index': String(i),
      },
    })
  })
  return ports
}

function sourcePortRef(edge: LayoutEdgeLike, nodesById: Map<string, LayoutNodeLike>): string {
  const source = nodesById.get(edge.source)
  if (!source) return edge.source
  if (
    (source.kind === 'decision' || source.kind === 'switch') &&
    edge.sourceHandle &&
    edge.sourceHandle !== 'top' &&
    edge.sourceHandle !== 'right' &&
    edge.sourceHandle !== 'bottom' &&
    edge.sourceHandle !== 'left'
  ) {
    return `${edge.source}__${edge.sourceHandle}`
  }
  if (source.kind === 'decision' || source.kind === 'switch') {
    return `${edge.source}__in`
  }
  return edge.source
}

function targetPortRef(edge: LayoutEdgeLike, nodesById: Map<string, LayoutNodeLike>): string {
  const target = nodesById.get(edge.target)
  if (target && (target.kind === 'decision' || target.kind === 'switch')) {
    return `${edge.target}__in`
  }
  return edge.target
}

function extractWaypoints(edge: ElkExtendedEdge): LayoutWaypoint[] | undefined {
  const sections = edge.sections
  if (!sections?.length) return undefined
  const points: LayoutWaypoint[] = []
  for (const section of sections) {
    const bends = extractElkBendPoints(section)
    if (bends) points.push(...bends)
  }
  return points.length ? points : undefined
}

/**
 * When a node has parents in very different layers, ELK parks it after the
 * deepest parent. Lift it under the shallow parent (beside that parent's other
 * children) so the deep inbound edge routes as a side/back edge.
 */
function preferShallowParentLayers(
  positions: Map<string, { x: number; y: number }>,
  nodes: LayoutNodeLike[],
  edges: LayoutEdgeLike[],
  direction: LayoutDirection,
  layerSpacing: number,
): void {
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const incoming = new Map<string, string[]>()
  for (const e of edges) {
    const list = incoming.get(e.target) ?? []
    list.push(e.source)
    incoming.set(e.target, list)
  }

  for (const [id, parents] of incoming) {
    if (parents.length < 2) continue
    const pos = positions.get(id)
    const node = byId.get(id)
    if (!pos || !node) continue
    const parentPos = parents
      .map((p) => ({ id: p, pos: positions.get(p) }))
      .filter((p): p is { id: string; pos: { x: number; y: number } } => !!p.pos)
    if (parentPos.length < 2) continue

    if (direction === 'DOWN') {
      const shallowY = Math.min(...parentPos.map((p) => p.pos.y))
      const deepY = Math.max(...parentPos.map((p) => p.pos.y))
      if (deepY - shallowY < layerSpacing * 1.5) continue
      if (pos.y < shallowY + layerSpacing * 2) continue

      const shallowParents = parentPos.filter((p) => Math.abs(p.pos.y - shallowY) < 12).map((p) => p.id)
      const siblingXs: number[] = []
      let siblingY: number | null = null
      for (const e of edges) {
        if (!shallowParents.includes(e.source) || e.target === id) continue
        const tp = positions.get(e.target)
        if (!tp) continue
        if (tp.y <= shallowY + 20 || tp.y >= deepY - layerSpacing) continue
        siblingXs.push(tp.x)
        siblingY = siblingY == null ? tp.y : Math.min(siblingY, tp.y)
      }
      const size = defaultNodeSize(node)
      const targetY =
        siblingY ??
        shallowY + layerSpacing + (parentPos.find((p) => shallowParents.includes(p.id))?.pos
          ? defaultNodeSize(byId.get(shallowParents[0]!)!).h
          : 96)
      let targetX = pos.x
      if (siblingXs.length) {
        const rightmost = Math.max(
          ...siblingXs.map((x) => {
            const sibId = edges.find(
              (e) =>
                shallowParents.includes(e.source) &&
                e.target !== id &&
                positions.get(e.target)?.x === x,
            )?.target
            const sib = sibId ? byId.get(sibId) : undefined
            const sw = sib ? defaultNodeSize(sib).w : 256
            return x + sw
          }),
        )
        targetX = rightmost + NODE_NODE_SPACING
      }
      // Avoid overlapping an existing node at the lift target.
      for (const other of nodes) {
        if (other.id === id) continue
        const op = positions.get(other.id)
        if (!op) continue
        const os = defaultNodeSize(other)
        const overlap =
          targetX < op.x + os.w + 8 &&
          targetX + size.w + 8 > op.x &&
          targetY < op.y + os.h + 8 &&
          targetY + size.h + 8 > op.y
        if (overlap) targetX = op.x + os.w + NODE_NODE_SPACING
      }
      positions.set(id, { x: targetX, y: targetY })
    } else {
      const shallowX = Math.min(...parentPos.map((p) => p.pos.x))
      const deepX = Math.max(...parentPos.map((p) => p.pos.x))
      if (deepX - shallowX < layerSpacing * 1.5) continue
      if (pos.x < shallowX + layerSpacing * 2) continue
      const shallowParents = parentPos.filter((p) => Math.abs(p.pos.x - shallowX) < 12).map((p) => p.id)
      const siblingYs: number[] = []
      let siblingX: number | null = null
      for (const e of edges) {
        if (!shallowParents.includes(e.source) || e.target === id) continue
        const tp = positions.get(e.target)
        if (!tp) continue
        if (tp.x <= shallowX + 20 || tp.x >= deepX - layerSpacing) continue
        siblingYs.push(tp.y)
        siblingX = siblingX == null ? tp.x : Math.min(siblingX, tp.x)
      }
      const size = defaultNodeSize(node)
      const targetX =
        siblingX ??
        shallowX + layerSpacing + defaultNodeSize(byId.get(shallowParents[0]!)!).w
      let targetY = pos.y
      if (siblingYs.length) {
        const bottom = Math.max(...siblingYs.map((y) => y + 96))
        targetY = bottom + NODE_NODE_SPACING
      }
      for (const other of nodes) {
        if (other.id === id) continue
        const op = positions.get(other.id)
        if (!op) continue
        const os = defaultNodeSize(other)
        const overlap =
          targetX < op.x + os.w + 8 &&
          targetX + size.w + 8 > op.x &&
          targetY < op.y + os.h + 8 &&
          targetY + size.h + 8 > op.y
        if (overlap) targetY = op.y + os.h + NODE_NODE_SPACING
      }
      positions.set(id, { x: targetX, y: targetY })
    }
  }
}

async function layoutFlatElk(
  nodes: LayoutNodeLike[],
  edges: LayoutEdgeLike[],
  direction: LayoutDirection,
  spacing: { node: number; layer: number },
  options: { legacyEdgeRouting?: boolean } = {},
): Promise<{
  positions: Map<string, { x: number; y: number }>
  waypoints: Map<string, LayoutWaypoint[]>
}> {
  const elk = new ELK()
  const nodesById = new Map(nodes.map((n) => [n.id, n]))
  const legacy = !!options.legacyEdgeRouting

  const children: ElkNode[] = nodes.map((n) => {
    const size = defaultNodeSize(n)
    const ports = buildPorts(n, direction)
    const child: ElkNode = {
      id: n.id,
      width: size.w,
      height: size.h,
    }
    if (ports) {
      child.ports = ports
      child.layoutOptions = {
        'elk.portConstraints': 'FIXED_ORDER',
      }
    }
    return child
  })

  // Stable edge order by branch index so considerModelOrder fans chips L→R.
  const rankedEdges = [...edges].sort((a, b) => {
    const aSrc = nodesById.get(a.source)
    const bSrc = nodesById.get(b.source)
    const aIdx =
      aSrc && (aSrc.kind === 'decision' || aSrc.kind === 'switch')
        ? branchesOf(aSrc).findIndex((br) => br.id === a.sourceHandle)
        : -1
    const bIdx =
      bSrc && (bSrc.kind === 'decision' || bSrc.kind === 'switch')
        ? branchesOf(bSrc).findIndex((br) => br.id === b.sourceHandle)
        : -1
    if (aIdx !== bIdx) return aIdx - bIdx
    return a.id.localeCompare(b.id)
  })

  const elkEdges: ElkExtendedEdge[] = rankedEdges.map((e) => ({
    id: e.id,
    sources: [sourcePortRef(e, nodesById)],
    targets: [targetPortRef(e, nodesById)],
  }))

  const graph: ElkNode = {
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': direction,
      'elk.spacing.nodeNode': String(spacing.node),
      'elk.layered.spacing.nodeNodeBetweenLayers': String(spacing.layer),
      'elk.edgeRouting': 'ORTHOGONAL',
      'elk.spacing.edgeEdge': String(EDGE_EDGE_SPACING),
      'elk.spacing.edgeNode': String(EDGE_NODE_SPACING),
      'elk.layered.spacing.edgeEdgeBetweenLayers': String(EDGE_EDGE_SPACING),
      'elk.layered.spacing.edgeNodeBetweenLayers': String(EDGE_NODE_SPACING),
      'elk.layered.mergeEdges': 'false',
      'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
      'elk.layered.nodePlacement.strategy': 'BRANDES_KOEPF',
      'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
      'org.eclipse.elk.layered.crossingMinimization.forceNodeModelOrder': 'true',
      // Keep self-loop / back-edge boxes from wrapping around unrelated nodes.
      'elk.layered.edgeRouting.selfLoopDistribution': 'EQUALLY',
      'elk.layered.edgeRouting.splines.sloppy.layerSpacingFactor': '1.2',
    },
    children,
    edges: elkEdges,
  }

  const layouted = await elk.layout(graph)
  const positions = new Map<string, { x: number; y: number }>()
  for (const child of layouted.children ?? []) {
    positions.set(child.id, { x: child.x ?? 0, y: child.y ?? 0 })
  }

  // Multi-parent nodes (Course->Generated and Results->Generated) otherwise sink
  // to the deepest parent. Prefer the shallow parent layer so the late edge
  // becomes a side/back route instead of a long vertical through the stack.
  preferShallowParentLayers(positions, nodes, edges, direction, spacing.layer)

  const elkWaypoints = new Map<string, LayoutWaypoint[]>()
  for (const edge of (layouted.edges ?? []) as ElkExtendedEdge[]) {
    const pts = extractWaypoints(edge)
    if (pts) elkWaypoints.set(edge.id, pts)
  }

  // Ensure decision/switch branch targets follow chip order left→right (DOWN)
  // or top→bottom (RIGHT), even if ELK flipped a layer.
  for (const n of nodes) {
    if (n.kind !== 'decision' && n.kind !== 'switch') continue
    const branches = branchesOf(n)
    if (branches.length < 2) continue
    const targets: Array<{ id: string; index: number }> = []
    for (let i = 0; i < branches.length; i++) {
      const br = branches[i]
      const out = edges.find((e) => e.source === n.id && e.sourceHandle === br.id)
      if (out && positions.has(out.target)) targets.push({ id: out.target, index: i })
    }
    if (targets.length < 2) continue
    const coords = targets.map((t) => positions.get(t.id)!)
    if (direction === 'DOWN') {
      const sortedX = [...coords].map((c) => c.x).sort((a, b) => a - b)
      const ordered = targets.slice().sort((a, b) => a.index - b.index)
      ordered.forEach((t, i) => {
        const pos = positions.get(t.id)!
        positions.set(t.id, { x: sortedX[i], y: pos.y })
      })
    } else {
      const sortedY = [...coords].map((c) => c.y).sort((a, b) => a - b)
      const ordered = targets.slice().sort((a, b) => a.index - b.index)
      ordered.forEach((t, i) => {
        const pos = positions.get(t.id)!
        positions.set(t.id, { x: pos.x, y: sortedY[i] })
      })
    }
  }

  // Branch-order fixes and shallow-parent lifts invalidate ELK bends.
  // Re-route every edge on its own channel. Legacy mode keeps raw ELK buses.
  if (legacy) {
    return { positions, waypoints: elkWaypoints }
  }

  const placedNodes: LayoutNodeLike[] = nodes.map((n) => {
    const pos = positions.get(n.id)
    return pos ? { ...n, position: pos } : n
  })

  const independent = routeEdgesIndependently(
    placedNodes,
    edges,
    (n) => defaultNodeSize(n),
    direction,
  )
  return { positions, waypoints: independent }
}

function connectedIds(nodes: LayoutNodeLike[], edges: LayoutEdgeLike[]): Set<string> {
  const ids = new Set<string>()
  for (const e of edges) {
    ids.add(e.source)
    ids.add(e.target)
  }
  // Isolated non-annotations still participate so start/end alone get placed.
  for (const n of nodes) {
    if (!isAnnotationKind(n.kind)) ids.add(n.id)
  }
  return ids
}

function placeSideColumn(
  annotations: LayoutNodeLike[],
  mainBounds: { minX: number; minY: number; maxX: number; maxY: number },
  direction: LayoutDirection,
): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>()
  if (annotations.length === 0) return positions

  let cursorX =
    direction === 'RIGHT' ? mainBounds.minX : mainBounds.maxX + SIDE_COLUMN_GAP
  let cursorY =
    direction === 'RIGHT' ? mainBounds.maxY + SIDE_COLUMN_GAP : mainBounds.minY

  for (const node of annotations) {
    // Keep existing position when it already sits outside the main flow area.
    const size = defaultNodeSize(node)
    const outside =
      node.position.x > mainBounds.maxX + 40 ||
      node.position.x + size.w < mainBounds.minX - 40 ||
      node.position.y > mainBounds.maxY + 40 ||
      node.position.y + size.h < mainBounds.minY - 40
    if (outside && (node.position.x !== 0 || node.position.y !== 0)) {
      positions.set(node.id, { ...node.position })
      continue
    }
    positions.set(node.id, { x: cursorX, y: cursorY })
    if (direction === 'RIGHT') {
      cursorX += size.w + NODE_NODE_SPACING
    } else {
      cursorY += size.h + NODE_NODE_SPACING
    }
  }
  return positions
}

/**
 * Full diagram layout: layered ELK with branch ports, group children, sticky
 * side column, and orthogonal edge waypoints.
 */
export async function layoutDiagram<N extends LayoutNodeLike, E extends LayoutEdgeLike>(
  nodes: N[],
  edges: E[],
  options: LayoutOptions = {},
): Promise<LayoutResult<N, E>> {
  const direction = options.direction ?? 'DOWN'
  const spacing = {
    node: options.nodeNodeSpacing ?? NODE_NODE_SPACING,
    layer: options.layerSpacing ?? LAYER_SPACING,
  }
  const flatOpts = { legacyEdgeRouting: !!options.legacyEdgeRouting }
  const nextNodes = nodes.map((n) => ({ ...n, position: { ...n.position } })) as N[]
  const nextEdges = edges.map((e) => ({ ...e })) as E[]
  const byId = new Map(nextNodes.map((n) => [n.id, n]))

  const selection = options.nodeIds ? new Set(options.nodeIds) : null

  // --- Groups / sections: layout children first ---
  const containers = nextNodes.filter(
    (n) =>
      (n.kind === 'group' || n.kind === 'section') &&
      (!selection || selection.has(n.id) || nextNodes.some((c) => c.parentId === n.id && selection.has(c.id))),
  )

  for (const group of containers) {
    const children = nextNodes.filter(
      (n) => n.parentId === group.id && (!selection || selection.has(n.id)),
    )
    if (children.length === 0) continue
    const childIds = new Set(children.map((n) => n.id))
    const childEdges = nextEdges.filter((e) => childIds.has(e.source) && childIds.has(e.target))
    const { positions, waypoints } = await layoutFlatElk(
      children,
      childEdges,
      direction,
      spacing,
      flatOpts,
    )

    let maxX = 0
    let maxY = 0
    for (const child of children) {
      const pos = positions.get(child.id)
      if (!pos) continue
      const size = defaultNodeSize(child)
      child.position = { x: pos.x + GROUP_PADDING, y: pos.y + GROUP_HEADER }
      maxX = Math.max(maxX, child.position.x + size.w)
      maxY = Math.max(maxY, child.position.y + size.h)
    }
    for (const edge of nextEdges) {
      const pts = waypoints.get(edge.id)
      if (pts) {
        edge.waypoints = pts.map((p) => ({
          x: p.x + GROUP_PADDING,
          y: p.y + GROUP_HEADER,
        }))
      }
    }
    group.size = {
      w: Math.max(group.size?.w ?? 360, maxX + GROUP_PADDING),
      h: Math.max(group.size?.h ?? 240, maxY + GROUP_PADDING),
    }
  }

  // --- Top-level flow nodes ---
  const topLevel = nextNodes.filter((n) => {
    if (n.parentId) return false
    if (selection && !selection.has(n.id)) return false
    return true
  })

  const topIds = new Set(topLevel.map((n) => n.id))
  const topEdges = nextEdges.filter((e) => topIds.has(e.source) && topIds.has(e.target))

  const linked = connectedIds(topLevel, topEdges)
  const flowNodes = topLevel.filter((n) => linked.has(n.id) && !isAnnotationKind(n.kind))
  const annotations = topLevel.filter(
    (n) => isAnnotationKind(n.kind) && !topEdges.some((e) => e.source === n.id || e.target === n.id),
  )
  // Connected annotations still go through ELK with the flow.
  const annotationInFlow = topLevel.filter(
    (n) => isAnnotationKind(n.kind) && topEdges.some((e) => e.source === n.id || e.target === n.id),
  )
  const layoutNodes = [...flowNodes, ...annotationInFlow]
  // Include containers in top-level ELK so groups sit in the flow.
  const containersTop = topLevel.filter(
    (n) => (n.kind === 'group' || n.kind === 'section') && !layoutNodes.includes(n),
  )
  const allLayout = [...layoutNodes, ...containersTop]

  const flowEdges = topEdges.filter(
    (e) => allLayout.some((n) => n.id === e.source) && allLayout.some((n) => n.id === e.target),
  )

  let mainBounds = { minX: 0, minY: 0, maxX: 0, maxY: 0 }

  if (allLayout.length > 0) {
    const { positions, waypoints } = await layoutFlatElk(
      allLayout,
      flowEdges,
      direction,
      spacing,
      flatOpts,
    )

    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    for (const node of allLayout) {
      const pos = positions.get(node.id)
      if (!pos) continue
      node.position = { x: pos.x, y: pos.y }
      // Auto-arrange clears manual flag for moved nodes.
      if ('manuallyPositioned' in node) {
        delete (node as LayoutNodeLike).manuallyPositioned
      }
      const size = defaultNodeSize(node)
      minX = Math.min(minX, pos.x)
      minY = Math.min(minY, pos.y)
      maxX = Math.max(maxX, pos.x + size.w)
      maxY = Math.max(maxY, pos.y + size.h)
    }
    if (Number.isFinite(minX)) {
      mainBounds = { minX, minY, maxX, maxY }
    }

    for (const edge of nextEdges) {
      const pts = waypoints.get(edge.id)
      if (pts) edge.waypoints = pts
      else if (!flatOpts.legacyEdgeRouting) {
        // Clear stale routed waypoints when ELK had a straight edge.
        if (edge.waypoints?.some((w) => w.routed)) {
          delete edge.waypoints
        }
      }
    }
  }

  const sidePositions = placeSideColumn(annotations, mainBounds, direction)
  for (const [id, pos] of sidePositions) {
    const node = byId.get(id)
    if (node) node.position = pos
  }

  // Drop invalid parent refs
  for (const node of nextNodes) {
    if (node.parentId && !byId.has(node.parentId)) {
      delete node.parentId
    }
  }

  if (!options.skipConflictResolve && !flatOpts.legacyEdgeRouting) {
    const report = detectConflicts(nextNodes, nextEdges, { direction })
    if (report.nodeOverlaps.length > 0 || report.edgesThroughNodes.length > 0) {
      const fixed = resolveConflicts(nextNodes, nextEdges, { direction })
      return { nodes: fixed.nodes, edges: fixed.edges }
    }
    // Final pass: unique channels from settled positions so no edge inherits an
    // ELK bend that still clips a neighbour after branch-order fixes.
    const routed = routeEdgesIndependently(
      nextNodes,
      nextEdges,
      (n) => defaultNodeSize(n),
      direction,
    )
    for (const edge of nextEdges) {
      const pts = routed.get(edge.id)
      if (pts) edge.waypoints = pts
    }
  }

  return { nodes: nextNodes, edges: nextEdges }
}
