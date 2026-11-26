/**
 * Pure ELK layered layout shared by the editor worker and the MCP/admin port.
 * Uses elkjs/lib/elk.bundled.js so it runs in both browser and Node.
 */
import ELK, { type ElkExtendedEdge, type ElkNode, type ElkPort } from 'elkjs/lib/elk.bundled.js'
import {
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

function extractWaypoints(edge: ElkExtendedEdge): Array<{ x: number; y: number }> | undefined {
  const sections = edge.sections
  if (!sections?.length) return undefined
  const points: Array<{ x: number; y: number }> = []
  for (const section of sections) {
    if (section.bendPoints?.length) {
      for (const p of section.bendPoints) {
        points.push({ x: p.x ?? 0, y: p.y ?? 0 })
      }
    }
  }
  return points.length ? points : undefined
}

async function layoutFlatElk(
  nodes: LayoutNodeLike[],
  edges: LayoutEdgeLike[],
  direction: LayoutDirection,
  spacing: { node: number; layer: number },
): Promise<{
  positions: Map<string, { x: number; y: number }>
  waypoints: Map<string, Array<{ x: number; y: number }>>
}> {
  const elk = new ELK()
  const nodesById = new Map(nodes.map((n) => [n.id, n]))

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
      'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
      'elk.layered.nodePlacement.strategy': 'BRANDES_KOEPF',
      'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
      'org.eclipse.elk.layered.crossingMinimization.forceNodeModelOrder': 'true',
    },
    children,
    edges: elkEdges,
  }

  const layouted = await elk.layout(graph)
  const positions = new Map<string, { x: number; y: number }>()
  for (const child of layouted.children ?? []) {
    positions.set(child.id, { x: child.x ?? 0, y: child.y ?? 0 })
  }

  const waypoints = new Map<string, Array<{ x: number; y: number }>>()
  for (const edge of (layouted.edges ?? []) as ElkExtendedEdge[]) {
    const pts = extractWaypoints(edge)
    if (pts) waypoints.set(edge.id, pts)
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
      targets
        .slice()
        .sort((a, b) => a.index - b.index)
        .forEach((t, i) => {
          const pos = positions.get(t.id)!
          positions.set(t.id, { x: sortedX[i], y: pos.y })
        })
    } else {
      const sortedY = [...coords].map((c) => c.y).sort((a, b) => a - b)
      targets
        .slice()
        .sort((a, b) => a.index - b.index)
        .forEach((t, i) => {
          const pos = positions.get(t.id)!
          positions.set(t.id, { x: pos.x, y: sortedY[i] })
        })
    }
  }

  return { positions, waypoints }
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
    const { positions, waypoints } = await layoutFlatElk(children, childEdges, direction, spacing)

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
    const { positions, waypoints } = await layoutFlatElk(allLayout, flowEdges, direction, spacing)

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

  return { nodes: nextNodes, edges: nextEdges }
}
