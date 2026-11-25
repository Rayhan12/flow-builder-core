import type { Edge, Node } from '@xyflow/react'
import type { DiagramEdge, DiagramNode, NodeKind } from '../schema'

export type FlowNodeData = {
  diagramNode: DiagramNode
}

export type FlowNode = Node<FlowNodeData, NodeKind>
export type FlowEdge = Edge<{ diagramEdge: DiagramEdge }>

export function absolutePosition(
  node: DiagramNode,
  nodes: DiagramNode[],
): { x: number; y: number } {
  if (!node.parentId) return { ...node.position }
  const parent = nodes.find((n) => n.id === node.parentId)
  if (!parent) return { ...node.position }
  const parentAbs = absolutePosition(parent, nodes)
  return { x: node.position.x + parentAbs.x, y: node.position.y + parentAbs.y }
}

export function toFlowNode(
  node: DiagramNode,
  selected: boolean,
  options: { parentCollapsed?: boolean } = {},
): FlowNode {
  const isGroup = node.kind === 'group'
  const collapsed = isGroup && node.data.collapsed === true
  return {
    id: node.id,
    type: node.kind,
    position: node.position,
    selected,
    parentId: node.parentId,
    extent: node.parentId ? 'parent' : undefined,
    expandParent: Boolean(node.parentId),
    hidden: options.parentCollapsed === true,
    draggable: !options.parentCollapsed,
    zIndex: isGroup ? -1 : 1,
    style: isGroup
      ? {
          width: collapsed ? 224 : (node.size?.w ?? 360),
          height: collapsed ? 48 : (node.size?.h ?? 240),
        }
      : undefined,
    data: { diagramNode: node },
  }
}

export function toFlowEdge(edge: DiagramEdge, selected: boolean): FlowEdge {
  return {
    id: edge.id,
    type: 'flow',
    source: edge.source,
    target: edge.target,
    sourceHandle: edge.sourceHandle,
    targetHandle: edge.targetHandle,
    label: edge.label,
    selected,
    data: { diagramEdge: edge },
  }
}
