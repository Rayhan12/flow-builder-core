import type { Edge, Node } from '@xyflow/react'
import { isContainerKind, type DiagramEdge, type DiagramNode, type NodeKind } from '../schema'
import { DEFAULT_NODE_HEIGHT, DEFAULT_NODE_WIDTH } from './alignment'
import { effectiveZIndex } from './zOrder'

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

function defaultSizeFor(node: DiagramNode): { w: number; h: number } {
  if (isContainerKind(node.kind)) {
    const collapsed =
      (node.kind === 'group' || node.kind === 'section') && node.data.collapsed === true
    return { w: collapsed ? 224 : node.kind === 'section' ? 480 : 360, h: collapsed ? 48 : node.kind === 'section' ? 320 : 240 }
  }
  if (node.kind === 'start' || node.kind === 'end') {
    return { w: 176, h: 64 }
  }
  return { w: DEFAULT_NODE_WIDTH, h: DEFAULT_NODE_HEIGHT }
}

export function toFlowNode(
  node: DiagramNode,
  selected: boolean,
  options: { parentCollapsed?: boolean } = {},
): FlowNode {
  const isContainer = isContainerKind(node.kind)
  const collapsed =
    (node.kind === 'group' || node.kind === 'section') && node.data.collapsed === true
  const fallback = defaultSizeFor(node)
  const width = node.size?.w ?? fallback.w
  const height = node.size?.h ?? fallback.h
  const hidden = node.hidden === true || options.parentCollapsed === true
  const locked = node.locked === true
  // React Flow hides nodes until they have dimensions. Controlled updates replace
  // node object identity and wipe internal `measured` unless width/height (or
  // measured) are present on the user node, so always forward an explicit size.
  return {
    id: node.id,
    type: node.kind,
    position: node.position,
    selected,
    parentId: node.parentId,
    extent: node.parentId ? 'parent' : undefined,
    expandParent: Boolean(node.parentId),
    hidden,
    draggable: !locked && !options.parentCollapsed,
    selectable: !locked,
    zIndex: effectiveZIndex(node),
    width,
    height,
    initialWidth: width,
    initialHeight: height,
    ...(node.size
      ? { measured: { width: node.size.w, height: node.size.h } }
      : {}),
    style: isContainer
      ? {
          width: collapsed ? 224 : width,
          height: collapsed ? 48 : height,
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
