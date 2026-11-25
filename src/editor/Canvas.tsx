import {
  Background,
  BackgroundVariant,
  Controls,
  MarkerType,
  MiniMap,
  Panel,
  ReactFlow,
  useReactFlow,
  type Connection,
  type EdgeChangeset,
  type NodeChangeset,
  type OnSelectionChangeParams,
  type Viewport,
} from '@xyflow/react'
import { MousePointerClick } from 'lucide-react'
import { useCallback, useMemo, useRef, type DragEvent, type ReactNode } from 'react'
import { EmptyState } from '../components/EmptyState'
import type { DiagramNode } from '../schema'
import { useEditorStore } from '../store/editorStore'
import { edgeTypes } from './edges/edgeTypes'
import { toFlowEdge, toFlowNode, type FlowEdge, type FlowNode } from './flowTypes'
import { nodeTypes } from './nodes'

import '@xyflow/react/dist/style.css'

type Props = {
  onDropKind?: (kind: string, position: { x: number; y: number }) => void
  emptyAction?: ReactNode
}

function findGroupAtPoint(
  nodes: DiagramNode[],
  point: { x: number; y: number },
  excludeId?: string,
): DiagramNode | undefined {
  const groups = nodes.filter(
    (n) => n.kind === 'group' && n.id !== excludeId && n.data.collapsed !== true,
  )
  // Prefer the top-most (last) group that contains the point
  for (let i = groups.length - 1; i >= 0; i -= 1) {
    const group = groups[i]
    const w = group.size?.w ?? 360
    const h = group.size?.h ?? 240
    if (
      point.x >= group.position.x &&
      point.x <= group.position.x + w &&
      point.y >= group.position.y &&
      point.y <= group.position.y + h
    ) {
      return group
    }
  }
  return undefined
}

function worldPosition(node: DiagramNode, nodes: DiagramNode[]): { x: number; y: number } {
  if (!node.parentId) return { ...node.position }
  const parent = nodes.find((n) => n.id === node.parentId)
  if (!parent) return { ...node.position }
  return {
    x: node.position.x + parent.position.x,
    y: node.position.y + parent.position.y,
  }
}

export function Canvas({ onDropKind, emptyAction }: Props) {
  const diagram = useEditorStore((s) => s.diagram)
  const selectedNodeIds = useEditorStore((s) => s.selectedNodeIds)
  const selectedEdgeIds = useEditorStore((s) => s.selectedEdgeIds)
  const moveNodes = useEditorStore((s) => s.moveNodes)
  const resizeNode = useEditorStore((s) => s.resizeNode)
  const removeNodes = useEditorStore((s) => s.removeNodes)
  const removeEdges = useEditorStore((s) => s.removeEdges)
  const addEdgeFromConnection = useEditorStore((s) => s.addEdgeFromConnection)
  const setSelection = useEditorStore((s) => s.setSelection)
  const setViewport = useEditorStore((s) => s.setViewport)
  const setNodeParent = useEditorStore((s) => s.setNodeParent)
  const { screenToFlowPosition } = useReactFlow()

  const wrapperRef = useRef<HTMLDivElement>(null)
  const diagramNodes = diagram?.nodes
  const diagramEdges = diagram?.edges

  const collapsedParents = useMemo(() => {
    const set = new Set<string>()
    if (!diagramNodes) return set
    for (const n of diagramNodes) {
      if (n.kind === 'group' && n.data.collapsed) set.add(n.id)
    }
    return set
  }, [diagramNodes])

  const nodes: FlowNode[] = useMemo(() => {
    if (!diagramNodes) return []
    const selected = new Set(selectedNodeIds)
    const ordered = [...diagramNodes].sort((a, b) => {
      const aGroup = a.kind === 'group' ? 0 : 1
      const bGroup = b.kind === 'group' ? 0 : 1
      return aGroup - bGroup
    })
    return ordered.map((n) =>
      toFlowNode(n, selected.has(n.id), {
        parentCollapsed: Boolean(n.parentId && collapsedParents.has(n.parentId)),
      }),
    )
  }, [diagramNodes, selectedNodeIds, collapsedParents])

  const edges: FlowEdge[] = useMemo(() => {
    if (!diagramNodes || !diagramEdges) return []
    const selected = new Set(selectedEdgeIds)
    const hidden = new Set(
      diagramNodes
        .filter((n) => n.parentId && collapsedParents.has(n.parentId))
        .map((n) => n.id),
    )
    return diagramEdges
      .filter((e) => !hidden.has(e.source) && !hidden.has(e.target))
      .map((e) => toFlowEdge(e, selected.has(e.id)))
  }, [diagramNodes, diagramEdges, selectedEdgeIds, collapsedParents])

  const onNodesChange = useCallback(
    (changes: NodeChangeset<FlowNode>) => {
      const removes = changes.getByType('remove').map((c) => c.id)
      if (removes.length) removeNodes(removes)

      const positionChanges = changes.getByType('position')
      const dragging = positionChanges.filter((c) => c.position && c.dragging)
      const settled = positionChanges.filter((c) => c.position && !c.dragging)
      if (dragging.length) {
        moveNodes(
          dragging.map((c) => ({ id: c.id, position: c.position! })),
          false,
        )
      }
      if (settled.length) {
        moveNodes(
          settled.map((c) => ({ id: c.id, position: c.position! })),
          true,
        )
      }

      for (const change of changes.getByType('dimensions')) {
        if (!change.dimensions) continue
        const { width, height } = change.dimensions
        if (width <= 0 || height <= 0) continue
        // Record history only when resize finishes
        resizeNode(change.id, { w: width, h: height }, change.resizing !== true)
      }
    },
    [moveNodes, removeNodes, resizeNode],
  )

  const onEdgesChange = useCallback(
    (changes: EdgeChangeset<FlowEdge>) => {
      const removes = changes.getByType('remove').map((c) => c.id)
      if (removes.length) removeEdges(removes)
    },
    [removeEdges],
  )

  const onConnect = useCallback(
    (connection: Connection) => {
      addEdgeFromConnection({
        source: connection.source,
        target: connection.target,
        sourceHandle: connection.sourceHandle,
        targetHandle: connection.targetHandle,
      })
    },
    [addEdgeFromConnection],
  )

  const onSelectionChange = useCallback(
    ({ nodes: n, edges: e }: OnSelectionChangeParams<FlowNode, FlowEdge>) => {
      setSelection(
        n.map((node) => node.id),
        e.map((edge) => edge.id),
      )
    },
    [setSelection],
  )

  const onNodeDragStop = useCallback(
    (_: unknown, node: FlowNode) => {
      const d = useEditorStore.getState().diagram
      if (!d) return
      const diagramNode = d.nodes.find((n) => n.id === node.id)
      if (!diagramNode || diagramNode.kind === 'group') return

      const updated: DiagramNode = { ...diagramNode, position: node.position }
      const world = worldPosition(updated, [
        ...d.nodes.filter((n) => n.id !== node.id),
        updated,
      ])

      const target = findGroupAtPoint(d.nodes, world, node.id)
      const nextParentId = target?.id
      const currentParentId = diagramNode.parentId

      if (nextParentId === currentParentId) return
      setNodeParent(node.id, nextParentId, world)
    },
    [setNodeParent],
  )

  const onViewportChange = useCallback(
    (viewport: Viewport) => {
      setViewport({ x: viewport.x, y: viewport.y, zoom: viewport.zoom })
    },
    [setViewport],
  )

  const onDragOver = useCallback((event: DragEvent) => {
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
  }, [])

  const onDrop = useCallback(
    (event: DragEvent) => {
      event.preventDefault()
      const kind = event.dataTransfer.getData('application/flow-builder-kind')
      if (!kind || !onDropKind) return
      const position = screenToFlowPosition({ x: event.clientX, y: event.clientY })
      onDropKind(kind, { x: position.x - 110, y: position.y - 40 })
    },
    [onDropKind, screenToFlowPosition],
  )

  if (!diagram) return null

  return (
    <div className="editor-canvas" ref={wrapperRef} onDragOver={onDragOver} onDrop={onDrop}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onSelectionChange={onSelectionChange}
        onNodeDragStop={onNodeDragStop}
        onViewportChange={onViewportChange}
        defaultViewport={diagram.viewport}
        fitView={
          diagram.nodes.length > 0 &&
          diagram.nodes.every((n) => n.position.x === 0 && n.position.y === 0) === false
            ? undefined
            : diagram.nodes.length === 0
        }
        snapToGrid
        snapGrid={[16, 16]}
        deleteKeyCode={['Backspace', 'Delete']}
        multiSelectionKeyCode={['Meta', 'Control']}
        onlyRenderVisibleElements
        proOptions={{ hideAttribution: true }}
        defaultEdgeOptions={{
          type: 'flow',
          markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16, color: '#8b8d98' },
        }}
      >
        <Background
          id="dots"
          variant={BackgroundVariant.Dots}
          gap={16}
          size={1}
          color="var(--color-border)"
        />
        <Controls showInteractive={false} position="bottom-left" />
        <MiniMap
          pannable
          zoomable
          position="bottom-right"
          nodeStrokeWidth={2}
          maskColor="color-mix(in srgb, var(--color-chrome-dark) 12%, transparent)"
        />
        {diagram.nodes.length === 0 ? (
          <Panel position="top-center" className="canvas-empty-panel">
            <EmptyState
              icon={MousePointerClick}
              title="Empty canvas"
              hint="Drag a node from the left, or press Ctrl/Cmd+K to search and add one."
              action={emptyAction}
              className="canvas-empty-state"
            />
          </Panel>
        ) : null}
      </ReactFlow>
    </div>
  )
}
