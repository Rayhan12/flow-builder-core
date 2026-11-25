import {
  Background,
  BackgroundVariant,
  Controls,
  MarkerType,
  MiniMap,
  ReactFlow,
  type Connection,
  type EdgeChangeset,
  type NodeChangeset,
  type OnSelectionChangeParams,
  type Viewport,
} from '@xyflow/react'
import { useCallback, useMemo, useRef, type DragEvent } from 'react'
import { useEditorStore } from '../store/editorStore'
import { edgeTypes } from './edges/edgeTypes'
import { toFlowEdge, toFlowNode, type FlowEdge, type FlowNode } from './flowTypes'
import { nodeTypes } from './nodes'

import '@xyflow/react/dist/style.css'

type Props = {
  onDropKind?: (kind: string, position: { x: number; y: number }) => void
}

export function Canvas({ onDropKind }: Props) {
  const diagram = useEditorStore((s) => s.diagram)
  const selectedNodeIds = useEditorStore((s) => s.selectedNodeIds)
  const selectedEdgeIds = useEditorStore((s) => s.selectedEdgeIds)
  const moveNodes = useEditorStore((s) => s.moveNodes)
  const removeNodes = useEditorStore((s) => s.removeNodes)
  const removeEdges = useEditorStore((s) => s.removeEdges)
  const addEdgeFromConnection = useEditorStore((s) => s.addEdgeFromConnection)
  const setSelection = useEditorStore((s) => s.setSelection)
  const setViewport = useEditorStore((s) => s.setViewport)

  const dragStartPositions = useRef<Map<string, { x: number; y: number }>>(new Map())
  const wrapperRef = useRef<HTMLDivElement>(null)

  const nodes: FlowNode[] = useMemo(() => {
    if (!diagram) return []
    const selected = new Set(selectedNodeIds)
    return diagram.nodes.map((n) => toFlowNode(n, selected.has(n.id)))
  }, [diagram, selectedNodeIds])

  const edges: FlowEdge[] = useMemo(() => {
    if (!diagram) return []
    const selected = new Set(selectedEdgeIds)
    return diagram.edges.map((e) => toFlowEdge(e, selected.has(e.id)))
  }, [diagram, selectedEdgeIds])

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
    },
    [moveNodes, removeNodes],
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

  const onNodeDragStart = useCallback((_: unknown, node: FlowNode) => {
    dragStartPositions.current.set(node.id, { ...node.position })
  }, [])

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
      if (!kind || !onDropKind || !wrapperRef.current) return
      const bounds = wrapperRef.current.getBoundingClientRect()
      const position = {
        x: event.clientX - bounds.left - 110,
        y: event.clientY - bounds.top - 40,
      }
      // Convert roughly using current viewport
      const vp = diagram?.viewport ?? { x: 0, y: 0, zoom: 1 }
      onDropKind(kind, {
        x: (position.x - vp.x) / vp.zoom,
        y: (position.y - vp.y) / vp.zoom,
      })
    },
    [diagram?.viewport, onDropKind],
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
        onNodeDragStart={onNodeDragStart}
        onViewportChange={onViewportChange}
        defaultViewport={diagram.viewport}
        fitView={diagram.nodes.length > 0 && diagram.nodes.every((n) => n.position.x === 0 && n.position.y === 0) === false ? undefined : diagram.nodes.length === 0}
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
      </ReactFlow>
    </div>
  )
}
