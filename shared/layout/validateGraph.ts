/**
 * Graph structural validation used by AI ops, agent tools, and MCP before save.
 */

export type GraphNode = {
  id: string
  kind: string
  label?: string
  data?: unknown
}

export type GraphEdge = {
  id: string
  source: string
  target: string
  sourceHandle?: string
  targetHandle?: string
  label?: string
}

export type GraphProblem = {
  code: string
  message: string
  nodeIds?: string[]
  edgeIds?: string[]
}

export type ValidateGraphOptions = {
  /** Node ids introduced in this edit; used for adjacent duplicate checks. */
  editedNodeIds?: string[]
}

const SIDE_HANDLES = new Set(['top', 'right', 'bottom', 'left'])

function branchesOf(node: GraphNode): Array<{ id: string; label?: string }> {
  const data = node.data
  if (!data || typeof data !== 'object') return []
  const raw = (data as { branches?: unknown }).branches
  if (!Array.isArray(raw)) return []
  return raw
    .filter(
      (b): b is { id: string; label?: string } =>
        !!b && typeof b === 'object' && typeof (b as { id?: unknown }).id === 'string',
    )
    .map((b) => ({
      id: b.id,
      label: typeof b.label === 'string' ? b.label : undefined,
    }))
}

function downstream(
  startId: string,
  edges: GraphEdge[],
  limit = 200,
): Set<string> {
  const out = new Map<string, string[]>()
  for (const e of edges) {
    const list = out.get(e.source) ?? []
    list.push(e.target)
    out.set(e.source, list)
  }
  const seen = new Set<string>()
  const queue = [startId]
  while (queue.length && seen.size < limit) {
    const id = queue.shift()!
    if (seen.has(id)) continue
    seen.add(id)
    for (const next of out.get(id) ?? []) {
      if (!seen.has(next)) queue.push(next)
    }
  }
  seen.delete(startId)
  return seen
}

/**
 * Validate flow structure. Returns an empty array when the graph is OK.
 */
export function validateGraph(
  nodes: GraphNode[],
  edges: GraphEdge[],
  options: ValidateGraphOptions = {},
): GraphProblem[] {
  const problems: GraphProblem[] = []
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const edited = new Set(options.editedNodeIds ?? [])

  // --- parallelSplit / parallelJoin pairing ---
  const splits = nodes.filter((n) => n.kind === 'parallelSplit')
  const joins = nodes.filter((n) => n.kind === 'parallelJoin')

  for (const split of splits) {
    const down = downstream(split.id, edges)
    const reachableJoins = joins.filter((j) => down.has(j.id))
    if (reachableJoins.length === 0) {
      problems.push({
        code: 'parallel_missing_join',
        message: `parallelSplit "${split.label ?? split.id}" (${split.id}) has no matching parallelJoin downstream`,
        nodeIds: [split.id],
      })
    } else if (reachableJoins.length > 1) {
      // Prefer flagging when multiple joins are clearly for the same split
      // (all reachable without another split in between is still a soft warning).
      problems.push({
        code: 'parallel_duplicate_join',
        message: `parallelSplit "${split.label ?? split.id}" (${split.id}) reaches ${reachableJoins.length} parallelJoin nodes; use one join per split`,
        nodeIds: [split.id, ...reachableJoins.map((j) => j.id)],
      })
    }
  }

  // Orphan joins with no upstream split
  for (const join of joins) {
    const upstreamSplits = splits.filter((s) => downstream(s.id, edges).has(join.id))
    if (upstreamSplits.length === 0) {
      problems.push({
        code: 'parallel_orphan_join',
        message: `parallelJoin "${join.label ?? join.id}" (${join.id}) has no upstream parallelSplit`,
        nodeIds: [join.id],
      })
    }
  }

  // --- Decision / switch branch edges ---
  for (const node of nodes) {
    if (node.kind !== 'decision' && node.kind !== 'switch') continue
    const branches = branchesOf(node)
    const branchIds = new Set(branches.map((b) => b.id))
    const outgoing = edges.filter((e) => e.source === node.id)
    const used = new Map<string, string[]>()

    for (const edge of outgoing) {
      const handle = edge.sourceHandle
      if (!handle || SIDE_HANDLES.has(handle)) {
        // Side-handle edges are allowed for non-branch connectors.
        continue
      }
      if (!branchIds.has(handle)) {
        problems.push({
          code: 'unknown_branch_handle',
          message: `Edge ${edge.id} sourceHandle "${handle}" is not a branch on ${node.kind} "${node.label ?? node.id}" (${node.id})`,
          nodeIds: [node.id],
          edgeIds: [edge.id],
        })
        continue
      }
      const list = used.get(handle) ?? []
      list.push(edge.id)
      used.set(handle, list)
    }

    for (const [handle, edgeIds] of used) {
      if (edgeIds.length > 1) {
        const branch = branches.find((b) => b.id === handle)
        problems.push({
          code: 'duplicate_branch_edge',
          message: `${node.kind} "${node.label ?? node.id}" branch "${branch?.label ?? handle}" has ${edgeIds.length} outgoing edges; at most one is allowed`,
          nodeIds: [node.id],
          edgeIds,
        })
      }
    }
  }

  // Edges that claim a branch handle on a non-branching source
  for (const edge of edges) {
    const src = byId.get(edge.source)
    if (!src) continue
    const handle = edge.sourceHandle
    if (!handle || SIDE_HANDLES.has(handle)) continue
    if (src.kind !== 'decision' && src.kind !== 'switch') {
      // Other kinds may use custom handles later; only enforce when branches exist.
      const branches = branchesOf(src)
      if (branches.length && !branches.some((b) => b.id === handle)) {
        problems.push({
          code: 'unknown_branch_handle',
          message: `Edge ${edge.id} sourceHandle "${handle}" does not match branches on ${src.id}`,
          nodeIds: [src.id],
          edgeIds: [edge.id],
        })
      }
    }
  }

  // --- Adjacent duplicate kind+label among newly edited nodes ---
  if (edited.size > 0) {
    const outgoing = new Map<string, string[]>()
    for (const e of edges) {
      const list = outgoing.get(e.source) ?? []
      list.push(e.target)
      outgoing.set(e.source, list)
    }
    for (const id of edited) {
      const node = byId.get(id)
      if (!node) continue
      const key = `${node.kind}::${(node.label ?? '').trim().toLowerCase()}`
      for (const tid of outgoing.get(id) ?? []) {
        const other = byId.get(tid)
        if (!other) continue
        if (!edited.has(tid) && !edited.has(id)) continue
        const otherKey = `${other.kind}::${(other.label ?? '').trim().toLowerCase()}`
        if (key === otherKey && key !== '::') {
          problems.push({
            code: 'duplicate_adjacent_node',
            message: `Duplicate adjacent nodes with kind "${node.kind}" and label "${node.label}" (${node.id} next to ${other.id})`,
            nodeIds: [node.id, other.id],
          })
        }
      }
      // Also check incoming neighbors that were edited.
      for (const e of edges) {
        if (e.target !== id) continue
        if (!edited.has(e.source)) continue
        const other = byId.get(e.source)
        if (!other) continue
        const otherKey = `${other.kind}::${(other.label ?? '').trim().toLowerCase()}`
        if (key === otherKey && key !== '::') {
          // Avoid double-reporting the same pair.
          if (problems.some(
            (p) =>
              p.code === 'duplicate_adjacent_node' &&
              p.nodeIds?.includes(node.id) &&
              p.nodeIds?.includes(other.id),
          )) {
            continue
          }
          problems.push({
            code: 'duplicate_adjacent_node',
            message: `Duplicate adjacent nodes with kind "${node.kind}" and label "${node.label}" (${other.id} next to ${node.id})`,
            nodeIds: [other.id, node.id],
          })
        }
      }
    }
  }

  return problems
}

export function formatGraphProblems(problems: GraphProblem[]): string {
  if (!problems.length) return ''
  return problems.map((p, i) => `${i + 1}. [${p.code}] ${p.message}`).join('\n')
}
