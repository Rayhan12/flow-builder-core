import type { Edge, Node } from '@xyflow/react'
import type { DiagramEdge, DiagramNode, NodeKind } from '../schema'

export type FlowNodeData = {
  diagramNode: DiagramNode
}

export type FlowNode = Node<FlowNodeData, NodeKind>
export type FlowEdge = Edge<{ diagramEdge: DiagramEdge }>

export function toFlowNode(node: DiagramNode, selected: boolean): FlowNode {
  const isGroup = node.kind === 'group'
  return {
    id: node.id,
    type: node.kind,
    position: node.position,
    selected,
    parentId: node.parentId,
    zIndex: isGroup ? 0 : 1,
    style: isGroup && node.size
      ? { width: node.size.w, height: node.size.h }
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
