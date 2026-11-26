import type { Edge, Node } from '@xyflow/react'
import { defaultNodeSize as sharedDefaultNodeSize } from '../../shared/layout/index.ts'
import { isContainerKind, type DiagramEdge, type DiagramNode, type NodeKind } from '../schema'
import { resolveColor } from './colors'
import { toReactFlowMarker } from './edges/edgeMarkers'
import { effectiveZIndex } from './zOrder'

export type FlowNodeData = {
  diagramNode: DiagramNode
}

export type FlowNode = Node<FlowNodeData, NodeKind>
export type FlowEdge = Edge<{
  diagramEdge: DiagramEdge
  viewHighlight?: 'flow' | 'dim'
}>

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

export function defaultNodeSize(node: DiagramNode): { w: number; h: number } {
  return sharedDefaultNodeSize(node)
}

export function toFlowNode(
  node: DiagramNode,
  selected: boolean,
  options: { parentCollapsed?: boolean } = {},
): FlowNode {
  const isContainer = isContainerKind(node.kind)
  const collapsed =
    (node.kind === 'group' || node.kind === 'section') && node.data.collapsed === true
  const fallback = defaultNodeSize(node)
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
          width: collapsed ? 280 : width,
          height: collapsed ? 44 : height,
        }
      : { width, height },
    data: { diagramNode: node },
  }
}

export function toFlowEdge(edge: DiagramEdge, selected: boolean): FlowEdge {
  const stroke = resolveColor(edge.style?.color ?? edge.color, 'gray').solid
  const color = stroke === '#98a2b3' || stroke === '#8b8d98' ? '#94A3B8' : stroke
  return {
    id: edge.id,
    type: 'flow',
    source: edge.source,
    target: edge.target,
    // Side midpoints; floating sides are recomputed by the router on each route.
    // Fallbacks keep legacy edges attached until the next re-route.
    sourceHandle: edge.sourceHandle ?? 'bottom',
    targetHandle: edge.targetHandle ?? 'top',
    label: edge.label,
    selected,
    reconnectable: true,
    markerStart: toReactFlowMarker(edge.startMarker, color, 'none'),
    markerEnd: toReactFlowMarker(edge.endMarker, color, 'arrowFilled'),
    data: { diagramEdge: edge },
  }
}
