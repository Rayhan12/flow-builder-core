import { isContainerKind, type DiagramEdge, type DiagramNode } from '../schema'

/**
 * When a group/section is collapsed, remap edges that touch hidden children
 * onto the container boundary so connectors stay visible.
 */
export function remapEdgesForCollapsedGroups(
  edges: DiagramEdge[],
  nodes: DiagramNode[],
  collapsedParentIds: Set<string>,
): DiagramEdge[] {
  if (collapsedParentIds.size === 0) return edges

  const byId = new Map(nodes.map((n) => [n.id, n]))

  function resolveEndpoint(
    nodeId: string,
    handle: string | undefined,
    role: 'source' | 'target',
  ): { id: string; handle: string | undefined } | null {
    const node = byId.get(nodeId)
    if (!node) return { id: nodeId, handle }
    if (!node.parentId || !collapsedParentIds.has(node.parentId)) {
      return { id: nodeId, handle }
    }
    const parent = byId.get(node.parentId)
    if (!parent || !isContainerKind(parent.kind)) return null
    // Prefer a side handle on the group boundary.
    const side = role === 'source' ? 'bottom' : 'top'
    return { id: parent.id, handle: side }
  }

  const result: DiagramEdge[] = []
  for (const edge of edges) {
    const source = resolveEndpoint(edge.source, edge.sourceHandle, 'source')
    const target = resolveEndpoint(edge.target, edge.targetHandle, 'target')
    if (!source || !target) continue
    // Internal edges inside one collapsed group disappear.
    if (source.id === target.id) continue
    result.push({
      ...edge,
      source: source.id,
      target: target.id,
      sourceHandle: source.handle,
      targetHandle: target.handle,
    })
  }
  return result
}
