import {
  Background,
  BackgroundVariant,
  ConnectionMode,
  Controls,
  MarkerType,
  MiniMap,
  Panel,
  ReactFlow,
  useReactFlow,
  type Connection,
  type EdgeChangeset,
  type FinalConnectionState,
  type NodeChangeset,
  type OnReconnect,
  type OnSelectionChangeParams,
  type Viewport,
} from '@xyflow/react'
import { MousePointerClick } from 'lucide-react'
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from 'react'
import { EmptyState } from '../components/EmptyState'
import { isContainerKind, type DiagramNode } from '../schema'
import { useEditorStore } from '../store/editorStore'
import {
  computeAlignment,
  DEFAULT_NODE_HEIGHT,
  DEFAULT_NODE_WIDTH,
  GRID_SIZE,
  nodeBox,
  type AlignmentGuide,
  type GridMode,
  type SpacingHint,
} from './alignment'
import { AlignmentGuides } from './AlignmentGuides'
import { remapEdgesForCollapsedGroups } from './collapsedEdges'
import { edgeTypes } from './edges/edgeTypes'
import { toFlowEdge, toFlowNode, type FlowEdge, type FlowNode } from './flowTypes'
import {
  distancesBetweenBoxes,
  distancesWhileDragging,
  type DistanceMeasurement,
} from './measure'
import { nearestSideHandle, nearestSidesBetween } from './nearestSide'
import { nodeTypes } from './nodes'
import {
  dropPositionFromFlowPoint,
  isPaletteDrag,
  readPaletteDragKind,
} from './paletteDrop'
import { setLastFlowPoint } from './pointerPosition'
import { SelectionToolbar } from './SelectionToolbar'
import { sortNodesForCanvas } from './zOrder'

import '@xyflow/react/dist/style.css'

export type CanvasTool = 'select' | 'connect'

type Props = {
  onDropKind?: (kind: string, position: { x: number; y: number }) => void
  emptyAction?: ReactNode
  gridMode?: GridMode
  showMinimap?: boolean
  /** When false, React Flow 16px grid snap is off (Alt still disables object snap). */
  snapToGridEnabled?: boolean
  tool?: CanvasTool
  connectFromId?: string | null
  onConnectFromChange?: (id: string | null) => void
  connectTargetId?: string | null
  onConnectTargetChange?: (id: string | null) => void
}

function findGroupAtPoint(
  nodes: DiagramNode[],
  point: { x: number; y: number },
  excludeId?: string,
): DiagramNode | undefined {
  const groups = nodes.filter(
    (n) =>
      isContainerKind(n.kind) &&
      n.id !== excludeId &&
      (n.kind === 'group' || n.kind === 'section' ? n.data.collapsed !== true : true),
  )
  for (let i = groups.length - 1; i >= 0; i -= 1) {
    const group = groups[i]
    const w = group.size?.w ?? (group.kind === 'section' ? 480 : 360)
    const h = group.size?.h ?? (group.kind === 'section' ? 320 : 240)
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

function findNodeAtPoint(
  nodes: DiagramNode[],
  point: { x: number; y: number },
  excludeId?: string,
): DiagramNode | undefined {
  const candidates = nodes.filter(
    (n) =>
      n.id !== excludeId &&
      !n.hidden &&
      !isContainerKind(n.kind) &&
      n.kind !== 'divider',
  )
  for (let i = candidates.length - 1; i >= 0; i -= 1) {
    const n = candidates[i]
    const box = nodeBox(n, nodes)
    if (
      point.x >= box.left &&
      point.x <= box.left + box.width &&
      point.y >= box.top &&
      point.y <= box.top + box.height
    ) {
      return n
    }
  }
  return undefined
}

export function Canvas({
  onDropKind,
  emptyAction,
  gridMode = 'dots',
  showMinimap = true,
  snapToGridEnabled = true,
  tool = 'select',
  connectFromId = null,
  onConnectFromChange,
  connectTargetId = null,
  onConnectTargetChange,
}: Props) {
  const diagram = useEditorStore((s) => s.diagram)
  const selectedNodeIds = useEditorStore((s) => s.selectedNodeIds)
  const selectedEdgeIds = useEditorStore((s) => s.selectedEdgeIds)
  const moveNodes = useEditorStore((s) => s.moveNodes)
  const resizeNode = useEditorStore((s) => s.resizeNode)
  const removeNodes = useEditorStore((s) => s.removeNodes)
  const removeEdges = useEditorStore((s) => s.removeEdges)
  const addEdgeFromConnection = useEditorStore((s) => s.addEdgeFromConnection)
  const reconnectEdge = useEditorStore((s) => s.reconnectEdge)
  const alignSelection = useEditorStore((s) => s.alignSelection)
  const distributeSelection = useEditorStore((s) => s.distributeSelection)
  const tidySelection = useEditorStore((s) => s.tidySelection)
  const setSelection = useEditorStore((s) => s.setSelection)
  const setViewport = useEditorStore((s) => s.setViewport)
  const setNodeParent = useEditorStore((s) => s.setNodeParent)
  const { screenToFlowPosition } = useReactFlow()

  const wrapperRef = useRef<HTMLDivElement>(null)
  const [altHeld, setAltHeld] = useState(false)
  const [spaceHeld, setSpaceHeld] = useState(false)
  const [guides, setGuides] = useState<AlignmentGuide[]>([])
  const [spacings, setSpacings] = useState<SpacingHint[]>([])
  const [measurements, setMeasurements] = useState<DistanceMeasurement[]>([])
  const draggingRef = useRef(false)
  const [paletteDragOver, setPaletteDragOver] = useState(false)
  const [dropGhost, setDropGhost] = useState<{ x: number; y: number } | null>(null)
  const [contextMenu, setContextMenu] = useState<{
    x: number
    y: number
    nodeIds: string[]
    edgeIds: string[]
  } | null>(null)
  const altDragDupRef = useRef(false)
  const dragDepthRef = useRef(0)
  const reconnectingRef = useRef(false)
  const diagramNodes = diagram?.nodes
  const diagramEdges = diagram?.edges
  const reorderZ = useEditorStore((s) => s.reorderZ)
  const toggleHidden = useEditorStore((s) => s.toggleHidden)
  const toggleLocked = useEditorStore((s) => s.toggleLocked)
  const showAllHidden = useEditorStore((s) => s.showAllHidden)
  const copySelection = useEditorStore((s) => s.copySelection)
  const pasteClipboard = useEditorStore((s) => s.pasteClipboard)
  const pasteClipboardInPlace = useEditorStore((s) => s.pasteClipboardInPlace)
  const duplicateSelection = useEditorStore((s) => s.duplicateSelection)
  const groupSelection = useEditorStore((s) => s.groupSelection)
  const ungroupSelection = useEditorStore((s) => s.ungroupSelection)
  const addConnectedNode = useEditorStore((s) => s.addConnectedNode)
  const replaceNode = useEditorStore((s) => s.replaceNode)

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Alt') setAltHeld(true)
      if (e.code === 'Space' && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLTextAreaElement)) {
        setSpaceHeld(true)
      }
    }
    function onKeyUp(e: KeyboardEvent) {
      if (e.key === 'Alt') setAltHeld(false)
      if (e.code === 'Space') setSpaceHeld(false)
    }
    function onBlur() {
      setAltHeld(false)
      setSpaceHeld(false)
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', onBlur)
    }
  }, [])

  const collapsedParents = useMemo(() => {
    const set = new Set<string>()
    if (!diagramNodes) return set
    for (const n of diagramNodes) {
      if (
        (n.kind === 'group' || n.kind === 'section') &&
        n.data.collapsed
      ) {
        set.add(n.id)
      }
    }
    return set
  }, [diagramNodes])

  const nodes: FlowNode[] = useMemo(() => {
    if (!diagramNodes) return []
    const selected = new Set(selectedNodeIds)
    return sortNodesForCanvas(diagramNodes).map((n) => {
      const flow = toFlowNode(n, selected.has(n.id), {
        parentCollapsed: Boolean(n.parentId && collapsedParents.has(n.parentId)),
      })
      const classes = [
        flow.className,
        connectFromId === n.id ? 'is-connect-source' : '',
        connectTargetId === n.id ? 'is-connect-target' : '',
      ]
        .filter(Boolean)
        .join(' ')
      return classes ? { ...flow, className: classes } : flow
    })
  }, [diagramNodes, selectedNodeIds, collapsedParents, connectFromId, connectTargetId])

  const edges: FlowEdge[] = useMemo(() => {
    if (!diagramNodes || !diagramEdges) return []
    const selected = new Set(selectedEdgeIds)
    const userHidden = new Set(
      diagramNodes.filter((n) => n.hidden === true).map((n) => n.id),
    )
    const remapped = remapEdgesForCollapsedGroups(
      diagramEdges,
      diagramNodes,
      collapsedParents,
    )
    return remapped
      .filter((e) => !userHidden.has(e.source) && !userHidden.has(e.target))
      .map((e) => toFlowEdge(e, selected.has(e.id)))
  }, [diagramNodes, diagramEdges, selectedEdgeIds, collapsedParents])

  const clearGuides = useCallback(() => {
    setGuides([])
    setSpacings([])
    setMeasurements([])
    draggingRef.current = false
  }, [])

  const onNodesChange = useCallback(
    (changes: NodeChangeset<FlowNode>) => {
      const removes = changes.getByType('remove').map((c) => c.id)
      if (removes.length) removeNodes(removes)

      const positionChanges = changes.getByType('position')
      const dragging = positionChanges.filter((c) => c.position && c.dragging)
      const settled = positionChanges.filter((c) => c.position && !c.dragging)

      if (dragging.length) {
        draggingRef.current = true
        const d = useEditorStore.getState().diagram
        if (!d || altHeld) {
          moveNodes(
            dragging.map((c) => ({ id: c.id, position: c.position! })),
            false,
          )
          setGuides([])
          setSpacings([])
          setMeasurements([])
        } else {
          const dragId = dragging[0].id
          const dragPos = dragging[0].position!
          const diagramNode = d.nodes.find((n) => n.id === dragId)
          if (!diagramNode) {
            moveNodes(
              dragging.map((c) => ({ id: c.id, position: c.position! })),
              false,
            )
          } else {
            // Apply position temporarily for box calc of nested coords
            const tempNodes = d.nodes.map((n) =>
              n.id === dragId ? { ...n, position: dragPos } : n,
            )
            const moving = nodeBox({ ...diagramNode, position: dragPos }, tempNodes)
            const others = tempNodes
              .filter((n) => n.id !== dragId && !isContainerKind(n.kind) && !n.hidden)
              .map((n) => nodeBox(n, tempNodes))
            const aligned = computeAlignment(moving, others)

            // Convert absolute snap back to relative position if nested
            let nextPos = { x: aligned.box.left, y: aligned.box.top }
            if (diagramNode.parentId) {
              const parent = tempNodes.find((n) => n.id === diagramNode.parentId)
              if (parent) {
                nextPos = {
                  x: aligned.box.left - parent.position.x,
                  y: aligned.box.top - parent.position.y,
                }
              }
            }

            const updates = dragging.map((c) =>
              c.id === dragId ? { id: c.id, position: nextPos } : { id: c.id, position: c.position! },
            )
            moveNodes(updates, false)
            setGuides(aligned.guides)
            setSpacings(aligned.spacings)
            setMeasurements(distancesWhileDragging(aligned.box, others))
          }
        }
      }

      if (settled.length) {
        moveNodes(
          settled.map((c) => ({ id: c.id, position: c.position! })),
          true,
        )
        clearGuides()
      }

      for (const change of changes.getByType('dimensions')) {
        if (!change.dimensions) continue
        const { width, height } = change.dimensions
        if (width <= 0 || height <= 0) continue
        resizeNode(change.id, { w: width, h: height }, change.resizing !== true)
      }
    },
    [moveNodes, removeNodes, resizeNode, altHeld, clearGuides],
  )

  const onEdgesChange = useCallback(
    (changes: EdgeChangeset<FlowEdge>) => {
      const removes = changes.getByType('remove').map((c) => c.id)
      if (removes.length) removeEdges(removes)
    },
    [removeEdges],
  )

  const resolveHandles = useCallback((connection: Connection) => {
    const d = useEditorStore.getState().diagram
    let sourceHandle = connection.sourceHandle ?? undefined
    let targetHandle = connection.targetHandle ?? undefined
    if (!d || !connection.source || !connection.target) {
      return { sourceHandle, targetHandle }
    }
    const sourceNode = d.nodes.find((n) => n.id === connection.source)
    const targetNode = d.nodes.find((n) => n.id === connection.target)
    if (sourceNode && !sourceHandle) {
      const box = nodeBox(sourceNode, d.nodes)
      const targetPos = targetNode
        ? worldPosition(targetNode, d.nodes)
        : { x: box.left + box.width / 2, y: box.top + box.height }
      sourceHandle = nearestSideHandle(targetPos, box)
    }
    if (targetNode && !targetHandle) {
      const box = nodeBox(targetNode, d.nodes)
      const sourcePos = sourceNode
        ? worldPosition(sourceNode, d.nodes)
        : { x: box.left + box.width / 2, y: box.top }
      targetHandle = nearestSideHandle(sourcePos, box)
    }
    return { sourceHandle, targetHandle }
  }, [])

  const onConnect = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target) return
      const { sourceHandle, targetHandle } = resolveHandles(connection)
      addEdgeFromConnection({
        source: connection.source,
        target: connection.target,
        sourceHandle,
        targetHandle,
      })
      onConnectTargetChange?.(null)
    },
    [addEdgeFromConnection, resolveHandles, onConnectTargetChange],
  )

  const onReconnect = useCallback<OnReconnect<FlowEdge>>(
    (oldEdge, connection) => {
      if (!connection.source || !connection.target) return
      const { sourceHandle, targetHandle } = resolveHandles(connection)
      reconnectEdge(oldEdge.id, {
        source: connection.source,
        target: connection.target,
        sourceHandle,
        targetHandle,
      })
      onConnectTargetChange?.(null)
    },
    [reconnectEdge, resolveHandles, onConnectTargetChange],
  )

  const hitTestConnect = useCallback(
    (
      event: MouseEvent | TouchEvent,
      fromNodeId: string,
      fromHandleId: string | null | undefined,
    ): { targetId: string; sourceHandle: string; targetHandle: string } | null => {
      const d = useEditorStore.getState().diagram
      if (!d) return null
      const clientX = 'clientX' in event ? event.clientX : event.changedTouches?.[0]?.clientX
      const clientY = 'clientY' in event ? event.clientY : event.changedTouches?.[0]?.clientY
      if (clientX == null || clientY == null) return null
      const flowPoint = screenToFlowPosition({ x: clientX, y: clientY })
      const target = findNodeAtPoint(d.nodes, flowPoint, fromNodeId)
      if (!target) return null
      const sourceNode = d.nodes.find((n) => n.id === fromNodeId)
      if (!sourceNode) return null
      const sourceBox = nodeBox(sourceNode, d.nodes)
      const targetBox = nodeBox(target, d.nodes)
      const sourceHandle =
        fromHandleId && fromHandleId !== 'null'
          ? String(fromHandleId)
          : nearestSideHandle(
              {
                x: targetBox.left + targetBox.width / 2,
                y: targetBox.top + targetBox.height / 2,
              },
              sourceBox,
            )
      const targetHandle = nearestSideHandle(
        {
          x: sourceBox.left + sourceBox.width / 2,
          y: sourceBox.top + sourceBox.height / 2,
        },
        targetBox,
      )
      return { targetId: target.id, sourceHandle, targetHandle }
    },
    [screenToFlowPosition],
  )

  const onConnectEnd = useCallback(
    (event: MouseEvent | TouchEvent, state: FinalConnectionState) => {
      onConnectTargetChange?.(null)
      if (reconnectingRef.current) return
      if (state.isValid || !('fromNode' in state) || !state.fromNode) return
      const hit = hitTestConnect(event, state.fromNode.id, state.fromHandle?.id)
      if (!hit) return
      addEdgeFromConnection({
        source: state.fromNode.id,
        target: hit.targetId,
        sourceHandle: hit.sourceHandle,
        targetHandle: hit.targetHandle,
      })
    },
    [addEdgeFromConnection, hitTestConnect, onConnectTargetChange],
  )

  const onReconnectStart = useCallback(() => {
    reconnectingRef.current = true
  }, [])

  const onReconnectEnd = useCallback(
    (
      event: MouseEvent | TouchEvent,
      edge: FlowEdge,
      handleType: 'source' | 'target',
      state: FinalConnectionState,
    ) => {
      reconnectingRef.current = false
      onConnectTargetChange?.(null)
      if (state.isValid) return
      const fromNodeId = handleType === 'source' ? edge.source : edge.target
      const hit = hitTestConnect(event, fromNodeId, state.fromHandle?.id ?? null)
      if (!hit) {
        // Drop on empty canvas: keep original edge (React Flow already cancelled).
        return
      }
      if (handleType === 'source') {
        reconnectEdge(edge.id, {
          source: hit.targetId,
          target: edge.target,
          sourceHandle: hit.targetHandle,
          targetHandle: edge.targetHandle ?? undefined,
        })
      } else {
        reconnectEdge(edge.id, {
          source: edge.source,
          target: hit.targetId,
          sourceHandle: edge.sourceHandle ?? undefined,
          targetHandle: hit.targetHandle,
        })
      }
    },
    [hitTestConnect, onConnectTargetChange, reconnectEdge],
  )

  const onNodeMouseEnter = useCallback(
    (event: ReactMouseEvent, node: FlowNode) => {
      const measuring = altHeld || event.altKey
      if (!measuring || draggingRef.current || !selectedNodeIds.length) return
      if (selectedNodeIds.includes(node.id)) return
      const d = useEditorStore.getState().diagram
      if (!d) return
      const selected = d.nodes.find((n) => n.id === selectedNodeIds[0])
      const hovered = d.nodes.find((n) => n.id === node.id)
      if (!selected || !hovered) return
      setMeasurements(
        distancesBetweenBoxes(nodeBox(selected, d.nodes), nodeBox(hovered, d.nodes)),
      )
    },
    [altHeld, selectedNodeIds],
  )

  const onNodeMouseLeave = useCallback(
    (event: ReactMouseEvent) => {
      if (!draggingRef.current && (altHeld || event.altKey)) setMeasurements([])
    },
    [altHeld],
  )

  const onSelectionChange = useCallback(
    ({ nodes: n, edges: e }: OnSelectionChangeParams<FlowNode, FlowEdge>) => {
      // Prefer React Flow's live selection so the properties panel tracks clicks,
      // marquee and shift-toggles — not only the last added node.
      setSelection(
        n.map((node) => node.id),
        e.map((edge) => edge.id),
      )
    },
    [setSelection],
  )

  const onNodeClick = useCallback(
    (event: ReactMouseEvent, node: FlowNode) => {
      if (tool === 'connect') {
        event.stopPropagation()
        const d = useEditorStore.getState().diagram
        if (!d) return
        if (!connectFromId) {
          onConnectFromChange?.(node.id)
          setSelection([node.id], [])
          return
        }
        if (connectFromId === node.id) {
          // Keep source for chaining; click another node to draw the next edge.
          setSelection([node.id], [])
          return
        }
        const sourceNode = d.nodes.find((n) => n.id === connectFromId)
        const targetNode = d.nodes.find((n) => n.id === node.id)
        if (sourceNode && targetNode) {
          const { sourceHandle, targetHandle } = nearestSidesBetween(
            nodeBox(sourceNode, d.nodes),
            nodeBox(targetNode, d.nodes),
          )
          addEdgeFromConnection({
            source: connectFromId,
            target: node.id,
            sourceHandle,
            targetHandle,
          })
        }
        // Stay in connect mode for chained connections; next click is the new A.
        onConnectFromChange?.(node.id)
        setSelection([node.id], [])
        return
      }
      // Backup path: some controlled updates can skip onSelectionChange.
      // Shift-click is handled by React Flow multi-select; leave that alone.
      if (event.shiftKey) return
      // Cmd/Ctrl-click deep-selects a nested node without selecting its group.
      if (event.metaKey || event.ctrlKey) {
        setSelection([node.id], [])
        return
      }
      setSelection([node.id], [])
    },
    [
      setSelection,
      tool,
      connectFromId,
      onConnectFromChange,
      addEdgeFromConnection,
    ],
  )

  const onNodeMouseMove = useCallback(
    (_: ReactMouseEvent, node: FlowNode) => {
      if (tool === 'connect' && connectFromId && connectFromId !== node.id) {
        onConnectTargetChange?.(node.id)
      }
    },
    [tool, connectFromId, onConnectTargetChange],
  )

  const onEdgeClick = useCallback(
    (_: unknown, edge: FlowEdge) => {
      setSelection([], [edge.id])
    },
    [setSelection],
  )

  const onNodeContextMenu = useCallback(
    (event: ReactMouseEvent, node: FlowNode) => {
      event.preventDefault()
      const state = useEditorStore.getState()
      const ids = state.selectedNodeIds.includes(node.id)
        ? state.selectedNodeIds
        : [node.id]
      if (!state.selectedNodeIds.includes(node.id)) {
        setSelection(ids, [])
      }
      setContextMenu({
        x: event.clientX,
        y: event.clientY,
        nodeIds: ids,
        edgeIds: [],
      })
    },
    [setSelection],
  )

  const onPaneContextMenu = useCallback((event: ReactMouseEvent | MouseEvent) => {
    event.preventDefault()
    setContextMenu({
      x: event.clientX,
      y: event.clientY,
      nodeIds: [],
      edgeIds: [],
    })
  }, [])

  const onPaneClick = useCallback(() => {
    setContextMenu(null)
  }, [])

  const onNodeDragStart = useCallback(
    (event: ReactMouseEvent | MouseEvent | TouchEvent, node: FlowNode) => {
      altDragDupRef.current = false
      const altKey = 'altKey' in event ? event.altKey : false
      if (!altKey) return
      const state = useEditorStore.getState()
      const ids = state.selectedNodeIds.includes(node.id)
        ? state.selectedNodeIds
        : [node.id]
      if (!state.selectedNodeIds.includes(node.id)) {
        setSelection(ids, [])
      }
      // Snapshot into clipboard at drag start so paste-in-place leaves copies behind.
      copySelection()
      altDragDupRef.current = true
    },
    [copySelection, setSelection],
  )

  const onNodeDragStop = useCallback(
    (_: unknown, node: FlowNode) => {
      clearGuides()
      if (altDragDupRef.current) {
        pasteClipboardInPlace()
        altDragDupRef.current = false
      }
      const d = useEditorStore.getState().diagram
      if (!d) return
      const diagramNode = d.nodes.find((n) => n.id === node.id)
      if (!diagramNode || isContainerKind(diagramNode.kind)) return

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
    [setNodeParent, clearGuides, pasteClipboardInPlace],
  )

  const onViewportChange = useCallback(
    (viewport: Viewport) => {
      setViewport({ x: viewport.x, y: viewport.y, zoom: viewport.zoom })
    },
    [setViewport],
  )

  const clearPaletteDrag = useCallback(() => {
    dragDepthRef.current = 0
    setPaletteDragOver(false)
    setDropGhost(null)
  }, [])

  const onDragEnter = useCallback((event: DragEvent) => {
    if (!isPaletteDrag(event.dataTransfer)) return
    event.preventDefault()
    dragDepthRef.current += 1
    setPaletteDragOver(true)
  }, [])

  const onDragOver = useCallback((event: DragEvent) => {
    if (!isPaletteDrag(event.dataTransfer)) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'copy'
    const bounds = wrapperRef.current?.getBoundingClientRect()
    if (bounds) {
      // Cheap screen-space ghost centred on the cursor.
      setDropGhost({
        x: event.clientX - bounds.left - DEFAULT_NODE_WIDTH / 2,
        y: event.clientY - bounds.top - DEFAULT_NODE_HEIGHT / 2,
      })
    }
    setPaletteDragOver(true)
  }, [])

  const onDragLeave = useCallback((event: DragEvent) => {
    if (!isPaletteDrag(event.dataTransfer)) return
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1)
    if (dragDepthRef.current === 0) {
      setPaletteDragOver(false)
      setDropGhost(null)
    }
  }, [])

  const onDrop = useCallback(
    (event: DragEvent) => {
      event.preventDefault()
      clearPaletteDrag()
      const kind = readPaletteDragKind(event.dataTransfer)
      if (!kind || !onDropKind) return
      const flowPoint = screenToFlowPosition({ x: event.clientX, y: event.clientY })
      onDropKind(kind, dropPositionFromFlowPoint(flowPoint))
    },
    [onDropKind, screenToFlowPosition, clearPaletteDrag],
  )

  if (!diagram) return null

  return (
    <div
      className={`editor-canvas ${paletteDragOver ? 'is-drop-target' : ''}`}
      ref={wrapperRef}
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {paletteDragOver ? (
        <div className="canvas-drop-overlay" aria-hidden>
          {dropGhost ? (
            <div
              className="canvas-drop-ghost"
              style={{
                transform: `translate(${dropGhost.x}px, ${dropGhost.y}px)`,
                width: DEFAULT_NODE_WIDTH,
                height: DEFAULT_NODE_HEIGHT,
              }}
            />
          ) : null}
        </div>
      ) : null}
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onConnectEnd={onConnectEnd}
        onReconnect={onReconnect}
        onReconnectStart={onReconnectStart}
        onReconnectEnd={onReconnectEnd}
        onSelectionChange={onSelectionChange}
        onNodeClick={onNodeClick}
        onEdgeClick={onEdgeClick}
        onNodeContextMenu={onNodeContextMenu}
        onPaneContextMenu={onPaneContextMenu}
        onNodeMouseEnter={onNodeMouseEnter}
        onNodeMouseMove={onNodeMouseMove}
        onNodeMouseLeave={(e) => {
          onNodeMouseLeave(e)
          if (tool === 'connect') onConnectTargetChange?.(null)
        }}
        onPaneClick={() => {
          onPaneClick()
          if (tool === 'connect') onConnectFromChange?.(null)
        }}
        onNodeDragStart={onNodeDragStart}
        onNodeDragStop={onNodeDragStop}
        onViewportChange={onViewportChange}
        onPointerMove={(event) => {
          setLastFlowPoint(screenToFlowPosition({ x: event.clientX, y: event.clientY }))
        }}
        defaultViewport={diagram.viewport}
        fitView={
          diagram.nodes.length > 0 &&
          diagram.nodes.every((n) => n.position.x === 0 && n.position.y === 0) === false
            ? undefined
            : diagram.nodes.length === 0
        }
        minZoom={0.05}
        maxZoom={4}
        snapToGrid={snapToGridEnabled && !altHeld}
        snapGrid={[GRID_SIZE, GRID_SIZE]}
        deleteKeyCode={['Backspace', 'Delete']}
        multiSelectionKeyCode={['Shift']}
        selectionOnDrag={!spaceHeld}
        panOnDrag={spaceHeld ? true : [1, 2]}
        panOnScroll
        zoomOnScroll
        zoomOnPinch
        zoomActivationKeyCode={['Meta', 'Control']}
        nodesConnectable={tool !== 'connect'}
        edgesReconnectable
        connectionMode={ConnectionMode.Loose}
        connectionRadius={36}
        connectionLineStyle={{ stroke: 'var(--color-accent)', strokeWidth: 2 }}
        proOptions={{ hideAttribution: true }}
        defaultEdgeOptions={{
          type: 'flow',
          markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14, color: '#8b8d98' },
        }}
        className={[
          spaceHeld ? 'is-panning' : '',
          tool === 'connect' ? 'is-connector-tool' : '',
        ]
          .filter(Boolean)
          .join(' ') || undefined}
      >
        {gridMode === 'dots' ? (
          <>
            <Background
              id="dots-minor"
              variant={BackgroundVariant.Dots}
              gap={GRID_SIZE}
              size={1}
              color="var(--canvas-dot)"
            />
            <Background
              id="dots-major"
              variant={BackgroundVariant.Dots}
              gap={GRID_SIZE * 5}
              size={1.5}
              color="var(--canvas-dot-major)"
            />
          </>
        ) : null}
        {gridMode === 'lines' ? (
          <>
            <Background
              id="lines-minor"
              variant={BackgroundVariant.Lines}
              gap={GRID_SIZE}
              color="var(--canvas-line-minor)"
            />
            <Background
              id="lines-major"
              variant={BackgroundVariant.Lines}
              gap={GRID_SIZE * 5}
              color="var(--canvas-line-major)"
            />
          </>
        ) : null}
        <Controls showInteractive={false} position="bottom-left" />
        {showMinimap ? (
          <MiniMap
            pannable
            zoomable
            position="bottom-right"
            nodeStrokeWidth={2}
            maskColor="color-mix(in srgb, var(--color-chrome-dark) 12%, transparent)"
          />
        ) : null}
        <AlignmentGuides guides={guides} spacings={spacings} measurements={measurements} />
        {selectedNodeIds.length >= 2 ? (
          <Panel position="top-center" className="selection-toolbar-panel">
            <SelectionToolbar
              count={selectedNodeIds.length}
              onAlign={alignSelection}
              onDistribute={distributeSelection}
              onTidy={tidySelection}
            />
          </Panel>
        ) : null}
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
        {diagram.nodes.some((n) => n.hidden) ? (
          <Panel position="top-right" className="canvas-hidden-panel">
            <button
              type="button"
              className="btn btn-secondary"
              data-testid="show-all-hidden-canvas"
              onClick={() => showAllHidden()}
            >
              Show all hidden
            </button>
          </Panel>
        ) : null}
      </ReactFlow>
      {contextMenu ? (
        <div
          className="canvas-context-menu"
          role="menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          data-testid="canvas-context-menu"
        >
          {contextMenu.nodeIds.length > 0 ? (
            <>
              <button
                type="button"
                role="menuitem"
                className="canvas-context-item"
                onClick={() => {
                  copySelection()
                  setContextMenu(null)
                }}
              >
                Copy
              </button>
              <button
                type="button"
                role="menuitem"
                className="canvas-context-item"
                onClick={() => {
                  duplicateSelection()
                  setContextMenu(null)
                }}
              >
                Duplicate
              </button>
              <button
                type="button"
                role="menuitem"
                className="canvas-context-item"
                onClick={() => {
                  const node = diagram?.nodes.find((n) => n.id === contextMenu.nodeIds[0])
                  if (!node) return
                  const next = window.prompt(
                    'Label',
                    node.kind === 'group' || node.kind === 'section'
                      ? node.data.label
                      : node.label,
                  )
                  if (next == null) return
                  if (node.kind === 'group' || node.kind === 'section') {
                    replaceNode({
                      ...node,
                      label: next,
                      data: { ...node.data, label: next },
                    })
                  } else {
                    replaceNode({ ...node, label: next })
                  }
                  setContextMenu(null)
                }}
              >
                Edit label
              </button>
              <button
                type="button"
                role="menuitem"
                className="canvas-context-item"
                onClick={() => {
                  groupSelection()
                  setContextMenu(null)
                }}
              >
                Group
              </button>
              <button
                type="button"
                role="menuitem"
                className="canvas-context-item"
                onClick={() => {
                  ungroupSelection()
                  setContextMenu(null)
                }}
              >
                Ungroup
              </button>
              <button
                type="button"
                role="menuitem"
                className="canvas-context-item"
                onClick={() => {
                  addConnectedNode(contextMenu.nodeIds[0], 'right')
                  setContextMenu(null)
                }}
              >
                Add connected node
              </button>
              <hr className="canvas-context-sep" />
              <button
                type="button"
                role="menuitem"
                className="canvas-context-item"
                onClick={() => {
                  reorderZ(contextMenu.nodeIds, 'forward')
                  setContextMenu(null)
                }}
              >
                Bring forward
              </button>
              <button
                type="button"
                role="menuitem"
                className="canvas-context-item"
                onClick={() => {
                  reorderZ(contextMenu.nodeIds, 'backward')
                  setContextMenu(null)
                }}
              >
                Send backward
              </button>
              <button
                type="button"
                role="menuitem"
                className="canvas-context-item"
                onClick={() => {
                  if (contextMenu.nodeIds.length >= 2) alignSelection('left')
                  setContextMenu(null)
                }}
              >
                Align left
              </button>
              <button
                type="button"
                role="menuitem"
                className="canvas-context-item"
                onClick={() => {
                  toggleHidden(contextMenu.nodeIds)
                  setContextMenu(null)
                }}
              >
                Hide / show
              </button>
              <button
                type="button"
                role="menuitem"
                className="canvas-context-item"
                onClick={() => {
                  toggleLocked(contextMenu.nodeIds)
                  setContextMenu(null)
                }}
              >
                Lock / unlock
              </button>
              <button
                type="button"
                role="menuitem"
                className="canvas-context-item is-danger"
                onClick={() => {
                  removeNodes(contextMenu.nodeIds)
                  setContextMenu(null)
                }}
              >
                Delete
              </button>
            </>
          ) : (
            <button
              type="button"
              role="menuitem"
              className="canvas-context-item"
              onClick={() => {
                const point = screenToFlowPosition({
                  x: contextMenu.x,
                  y: contextMenu.y,
                })
                pasteClipboard(point)
                setContextMenu(null)
              }}
            >
              Paste
            </button>
          )}
        </div>
      ) : null}
    </div>
  )
}
