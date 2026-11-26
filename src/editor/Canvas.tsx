import {
  Background,
  BackgroundVariant,
  ConnectionMode,
  Controls,
  MarkerType,
  MiniMap,
  Panel,
  ReactFlow,
  ViewportPortal,
  useReactFlow,
  type Connection,
  type EdgeChangeset,
  type FinalConnectionState,
  type NodeChangeset,
  type OnConnectStart,
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
import {
  defaultNodeSize,
  handleEnterDir,
  handleLeaveDir,
  routeEdgesIndependently,
  routeOrthogonal,
  roundedOrthogonalPath,
  EDGE_COLOR,
  EDGE_STROKE,
} from '../../shared/layout/index.ts'
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
import {
  nearestSideHandle,
  nearestSidesBetween,
  sideMidpoint,
  type SideHandleId,
} from './nearestSide'
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

/** Handle-drag connection preview: same orthogonal router + stroke as real edges. */
function ConnectPreviewLine({
  fromX,
  fromY,
  toX,
  toY,
}: {
  fromX: number
  fromY: number
  toX: number
  toY: number
}) {
  const d = useMemo(() => {
    const pts = routeOrthogonal(
      { x: fromX, y: fromY },
      { x: toX, y: toY },
      'S',
      'N',
      [],
      [],
      { slot: 0, clearance: 8 },
    )
    return roundedOrthogonalPath(pts)
  }, [fromX, fromY, toX, toY])
  return (
    <g className="connect-preview-handle-line" data-testid="connection-preview-line">
      <path
        fill="none"
        stroke={EDGE_COLOR}
        strokeWidth={EDGE_STROKE}
        strokeDasharray="4 4"
        strokeLinecap="round"
        strokeLinejoin="round"
        d={d}
      />
    </g>
  )
}

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
  /** Explicit source handle when the pending arrow started on a handle. */
  connectFromHandle?: string | null
  onConnectFromHandleChange?: (id: string | null) => void
  connectTargetId?: string | null
  onConnectTargetChange?: (id: string | null) => void
  /** Read-only canvas: pan/zoom and view-focus only. */
  viewOnly?: boolean
  viewFocusNodeId?: string | null
  onViewFocusChange?: (id: string | null) => void
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
  connectFromHandle = null,
  onConnectFromHandleChange,
  connectTargetId = null,
  onConnectTargetChange,
  viewOnly = false,
  viewFocusNodeId = null,
  onViewFocusChange,
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
  const [connectPreviewPt, setConnectPreviewPt] = useState<{ x: number; y: number } | null>(
    null,
  )
  const altDragDupRef = useRef(false)
  const dragDepthRef = useRef(0)
  const reconnectingRef = useRef(false)
  const connectGestureRef = useRef<{
    nodeId: string
    handleId: string | null
    clientX: number
    clientY: number
  } | null>(null)
  const handleClickHandledRef = useRef(false)
  const connectFromIdRef = useRef(connectFromId)
  const connectFromHandleRef = useRef(connectFromHandle)
  const connectMode = tool === 'connect' && !viewOnly
  const nodesInteractive = !viewOnly && !connectMode

  useEffect(() => {
    connectFromIdRef.current = connectFromId
    connectFromHandleRef.current = connectFromHandle
  }, [connectFromId, connectFromHandle])
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

  const viewHighlight = useMemo(() => {
    if (!viewOnly || !viewFocusNodeId || !diagramEdges) {
      return { nodeIds: null as Set<string> | null, edgeIds: null as Set<string> | null }
    }
    const nodeIds = new Set<string>([viewFocusNodeId])
    const edgeIds = new Set<string>()
    for (const e of diagramEdges) {
      if (e.source === viewFocusNodeId || e.target === viewFocusNodeId) {
        edgeIds.add(e.id)
        nodeIds.add(e.source)
        nodeIds.add(e.target)
      }
    }
    return { nodeIds, edgeIds }
  }, [viewOnly, viewFocusNodeId, diagramEdges])

  const nodes: FlowNode[] = useMemo(() => {
    if (!diagramNodes) return []
    const selected = new Set(selectedNodeIds)
    return sortNodesForCanvas(diagramNodes).map((n) => {
      const flow = toFlowNode(n, selected.has(n.id), {
        parentCollapsed: Boolean(n.parentId && collapsedParents.has(n.parentId)),
      })
      const focused = viewHighlight.nodeIds?.has(n.id) ?? false
      const dimmed = Boolean(viewHighlight.nodeIds && !focused)
      const classes = [
        flow.className,
        connectFromId === n.id ? 'is-connect-source' : '',
        connectTargetId === n.id ? 'is-connect-target' : '',
        viewOnly && focused ? 'is-view-focus' : '',
        dimmed ? 'is-view-dimmed' : '',
      ]
        .filter(Boolean)
        .join(' ')
      return {
        ...flow,
        className: classes || undefined,
        draggable: nodesInteractive && flow.draggable !== false,
        connectable: !viewOnly,
        selectable: true,
      }
    })
  }, [
    diagramNodes,
    selectedNodeIds,
    collapsedParents,
    connectFromId,
    connectTargetId,
    viewOnly,
    viewHighlight,
    nodesInteractive,
  ])

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
      .map((e) => {
        const flow = toFlowEdge(e, selected.has(e.id))
        const focused = viewHighlight.edgeIds?.has(e.id) ?? false
        const dimmed = Boolean(viewHighlight.edgeIds && !focused)
        const classes = [
          flow.className,
          focused ? 'is-view-flow' : '',
          dimmed ? 'is-view-dimmed' : '',
        ]
          .filter(Boolean)
          .join(' ')
        return {
          ...flow,
          className: classes || undefined,
          reconnectable: !viewOnly && flow.reconnectable !== false,
          data: {
            diagramEdge: flow.data!.diagramEdge,
            viewHighlight: focused ? ('flow' as const) : dimmed ? ('dim' as const) : undefined,
          },
        }
      })
  }, [diagramNodes, diagramEdges, selectedEdgeIds, collapsedParents, viewOnly, viewHighlight])

  const clearGuides = useCallback(() => {
    setGuides([])
    setSpacings([])
    setMeasurements([])
    draggingRef.current = false
  }, [])

  const clearConnectPending = useCallback(() => {
    onConnectFromChange?.(null)
    onConnectFromHandleChange?.(null)
    onConnectTargetChange?.(null)
    setConnectPreviewPt(null)
  }, [onConnectFromChange, onConnectFromHandleChange, onConnectTargetChange])

  const finishConnectClick = useCallback(
    (targetId: string, targetHandle: string | null) => {
      const d = useEditorStore.getState().diagram
      const fromId = connectFromIdRef.current
      const fromHandle = connectFromHandleRef.current
      if (!d || !fromId || fromId === targetId) return
      const sourceNode = d.nodes.find((n) => n.id === fromId)
      const targetNode = d.nodes.find((n) => n.id === targetId)
      if (!sourceNode || !targetNode) return
      const sourceBox = nodeBox(sourceNode, d.nodes)
      const targetBox = nodeBox(targetNode, d.nodes)
      const nearest = nearestSidesBetween(sourceBox, targetBox)
      const sourceHandle =
        fromHandle && fromHandle !== 'null' ? fromHandle : nearest.sourceHandle
      const resolvedTarget =
        targetHandle && targetHandle !== 'null' ? targetHandle : nearest.targetHandle
      addEdgeFromConnection({
        source: fromId,
        target: targetId,
        sourceHandle,
        targetHandle: resolvedTarget,
      })
      // Chain: next click continues from the target.
      connectFromIdRef.current = targetId
      connectFromHandleRef.current = null
      onConnectFromChange?.(targetId)
      onConnectFromHandleChange?.(null)
      onConnectTargetChange?.(null)
      setSelection([targetId], [])
    },
    [
      addEdgeFromConnection,
      onConnectFromChange,
      onConnectFromHandleChange,
      onConnectTargetChange,
      setSelection,
    ],
  )

  // Click-click on handles in connect mode (RF drag-connect still handles longer gestures).
  useEffect(() => {
    if (!connectMode || viewOnly) return
    const root = wrapperRef.current
    if (!root) return
    let down: {
      nodeId: string
      handleId: string | null
      clientX: number
      clientY: number
    } | null = null

    let lastHandledAt = 0

    function onPointerDown(e: PointerEvent | MouseEvent) {
      if (e.button !== 0) return
      const handle = (e.target as Element | null)?.closest?.('.react-flow__handle') as
        | HTMLElement
        | null
      if (!handle) return
      const nodeEl = handle.closest('.react-flow__node') as HTMLElement | null
      const nodeId = nodeEl?.getAttribute('data-id')
      if (!nodeId) return
      down = {
        nodeId,
        handleId: handle.getAttribute('data-handleid'),
        clientX: e.clientX,
        clientY: e.clientY,
      }
    }

    function onPointerUp(e: PointerEvent | MouseEvent) {
      if (!down) return
      const start = down
      down = null
      const dist = Math.hypot(e.clientX - start.clientX, e.clientY - start.clientY)
      if (dist >= 8) return
      // Debounce pointer+mouse duplicate delivery for the same click.
      const now = Date.now()
      if (now - lastHandledAt < 50) return
      lastHandledAt = now
      // Mark so onConnectEnd does not double-handle this short press.
      connectGestureRef.current = null
      handleClickHandledRef.current = true
      window.setTimeout(() => {
        handleClickHandledRef.current = false
      }, 0)
      const fromId = connectFromIdRef.current
      if (!fromId) {
        connectFromIdRef.current = start.nodeId
        connectFromHandleRef.current = start.handleId
        onConnectFromChange?.(start.nodeId)
        onConnectFromHandleChange?.(start.handleId)
        setSelection([start.nodeId], [])
        setConnectPreviewPt(screenToFlowPosition({ x: e.clientX, y: e.clientY }))
        return
      }
      if (fromId !== start.nodeId) {
        finishConnectClick(start.nodeId, start.handleId)
      }
    }

    root.addEventListener('pointerdown', onPointerDown, true)
    root.addEventListener('pointerup', onPointerUp, true)
    root.addEventListener('mousedown', onPointerDown, true)
    root.addEventListener('mouseup', onPointerUp, true)
    return () => {
      root.removeEventListener('pointerdown', onPointerDown, true)
      root.removeEventListener('pointerup', onPointerUp, true)
      root.removeEventListener('mousedown', onPointerDown, true)
      root.removeEventListener('mouseup', onPointerUp, true)
    }
  }, [
    connectMode,
    viewOnly,
    onConnectFromChange,
    onConnectFromHandleChange,
    finishConnectClick,
    setSelection,
    screenToFlowPosition,
  ])

  const onNodesChange = useCallback(
    (changes: NodeChangeset<FlowNode>) => {
      if (viewOnly) return
      const removes = changes.getByType('remove').map((c) => c.id)
      if (removes.length) removeNodes(removes)

      const positionChanges = connectMode ? [] : changes.getByType('position')
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
        // Full obstacle-avoiding re-route after drag; live preview used smooth elbows.
        const d = useEditorStore.getState().diagram
        if (d) {
          const routed = routeEdgesIndependently(
            d.nodes,
            d.edges,
            (n) => defaultNodeSize(n),
            'DOWN',
          )
          const nextEdges = d.edges.map((e) => {
            const pts = routed.get(e.id)
            return pts ? { ...e, waypoints: pts } : e
          })
          useEditorStore.getState().applyNodeLayout(d.nodes, nextEdges)
        }
      }

      for (const change of changes.getByType('dimensions')) {
        if (!change.dimensions) continue
        const { width, height } = change.dimensions
        if (width <= 0 || height <= 0) continue
        const settling = change.resizing !== true
        resizeNode(change.id, { w: width, h: height }, settling)
        if (settling) {
          const d = useEditorStore.getState().diagram
          if (d) {
            const routed = routeEdgesIndependently(
              d.nodes,
              d.edges,
              (n) => defaultNodeSize(n),
              'DOWN',
            )
            const nextEdges = d.edges.map((e) => {
              const pts = routed.get(e.id)
              return pts ? { ...e, waypoints: pts } : e
            })
            useEditorStore.getState().applyNodeLayout(d.nodes, nextEdges)
          }
        }
      }
    },
    [moveNodes, removeNodes, resizeNode, altHeld, clearGuides, viewOnly, connectMode],
  )

  const onEdgesChange = useCallback(
    (changes: EdgeChangeset<FlowEdge>) => {
      if (viewOnly) return
      const removes = changes.getByType('remove').map((c) => c.id)
      if (removes.length) removeEdges(removes)
    },
    [removeEdges, viewOnly],
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
      if (viewOnly) return
      if (!connection.source || !connection.target) return
      const { sourceHandle, targetHandle } = resolveHandles(connection)
      addEdgeFromConnection({
        source: connection.source,
        target: connection.target,
        sourceHandle,
        targetHandle,
      })
      // Drag-connect completed; clear any click-connect pending state.
      clearConnectPending()
      connectGestureRef.current = null
    },
    [addEdgeFromConnection, resolveHandles, clearConnectPending, viewOnly],
  )

  const onReconnect = useCallback<OnReconnect<FlowEdge>>(
    (oldEdge, connection) => {
      if (viewOnly) return
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
    [reconnectEdge, resolveHandles, onConnectTargetChange, viewOnly],
  )

  const onConnectStart = useCallback<OnConnectStart>(
    (event, params) => {
      if (viewOnly || !params.nodeId) return
      const clientX = 'clientX' in event ? event.clientX : 0
      const clientY = 'clientY' in event ? event.clientY : 0
      connectGestureRef.current = {
        nodeId: params.nodeId,
        handleId: params.handleId,
        clientX,
        clientY,
      }
    },
    [viewOnly],
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
      if (viewOnly) {
        connectGestureRef.current = null
        return
      }

      const gesture = connectGestureRef.current
      connectGestureRef.current = null
      if (handleClickHandledRef.current) {
        handleClickHandledRef.current = false
        return
      }
      const clientX =
        'clientX' in event
          ? event.clientX
          : (event.changedTouches?.[0]?.clientX ?? gesture?.clientX ?? 0)
      const clientY =
        'clientY' in event
          ? event.clientY
          : (event.changedTouches?.[0]?.clientY ?? gesture?.clientY ?? 0)

      // Short handle press in connect mode = click-click source/target (not a drag).
      if (connectMode && gesture) {
        const dist = Math.hypot(clientX - gesture.clientX, clientY - gesture.clientY)
        if (dist < 8) {
          const fromId = connectFromIdRef.current
          if (!fromId) {
            connectFromIdRef.current = gesture.nodeId
            connectFromHandleRef.current = gesture.handleId
            onConnectFromChange?.(gesture.nodeId)
            onConnectFromHandleChange?.(gesture.handleId)
            setSelection([gesture.nodeId], [])
            const flowPt = screenToFlowPosition({ x: clientX, y: clientY })
            setConnectPreviewPt(flowPt)
            return
          }
          if (fromId !== gesture.nodeId) {
            finishConnectClick(gesture.nodeId, gesture.handleId)
            return
          }
          return
        }
      }

      if (state.isValid || !('fromNode' in state) || !state.fromNode) return
      const hit = hitTestConnect(event, state.fromNode.id, state.fromHandle?.id)
      if (!hit) return
      addEdgeFromConnection({
        source: state.fromNode.id,
        target: hit.targetId,
        sourceHandle: hit.sourceHandle,
        targetHandle: hit.targetHandle,
      })
      if (connectMode) {
        onConnectFromChange?.(hit.targetId)
        onConnectFromHandleChange?.(null)
      }
    },
    [
      addEdgeFromConnection,
      hitTestConnect,
      onConnectTargetChange,
      viewOnly,
      connectMode,
      connectFromId,
      onConnectFromChange,
      onConnectFromHandleChange,
      finishConnectClick,
      setSelection,
      screenToFlowPosition,
    ],
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
      if (viewOnly) {
        event.stopPropagation()
        onViewFocusChange?.(node.id)
        setSelection([node.id], [])
        return
      }
      if (connectMode) {
        event.stopPropagation()
        // Handle clicks are finished in onConnectEnd; ignore if the target was a handle.
        const target = event.target as HTMLElement | null
        if (target?.closest?.('.react-flow__handle')) return
        if (!connectFromId) {
          onConnectFromChange?.(node.id)
          onConnectFromHandleChange?.(null)
          setSelection([node.id], [])
          setConnectPreviewPt(
            screenToFlowPosition({ x: event.clientX, y: event.clientY }),
          )
          return
        }
        if (connectFromId === node.id) {
          setSelection([node.id], [])
          return
        }
        finishConnectClick(node.id, null)
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
      connectMode,
      connectFromId,
      onConnectFromChange,
      onConnectFromHandleChange,
      finishConnectClick,
      viewOnly,
      onViewFocusChange,
      screenToFlowPosition,
    ],
  )

  const onNodeMouseMove = useCallback(
    (_: ReactMouseEvent, node: FlowNode) => {
      if (connectMode && connectFromId && connectFromId !== node.id) {
        onConnectTargetChange?.(node.id)
      }
    },
    [connectMode, connectFromId, onConnectTargetChange],
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
      if (viewOnly) return
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
    [setSelection, viewOnly],
  )

  const onPaneContextMenu = useCallback(
    (event: ReactMouseEvent | MouseEvent) => {
      event.preventDefault()
      if (viewOnly) return
      setContextMenu({
        x: event.clientX,
        y: event.clientY,
        nodeIds: [],
        edgeIds: [],
      })
    },
    [viewOnly],
  )

  const onPaneClick = useCallback(() => {
    setContextMenu(null)
    if (viewOnly) {
      onViewFocusChange?.(null)
      return
    }
    if (connectMode && connectFromId) {
      clearConnectPending()
    }
  }, [viewOnly, onViewFocusChange, connectMode, connectFromId, clearConnectPending])

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

  const connectPreviewStart = useMemo(() => {
    if (!connectMode || !connectFromId || !diagramNodes) return null
    const sourceNode = diagramNodes.find((n) => n.id === connectFromId)
    if (!sourceNode) return null
    const box = nodeBox(sourceNode, diagramNodes)
    if (connectFromHandle && connectFromHandle !== 'null') {
      const side = connectFromHandle as SideHandleId
      if (side === 'top' || side === 'right' || side === 'bottom' || side === 'left') {
        return sideMidpoint(box, side)
      }
      // Branch / custom handle: approximate at bottom centre of the card.
      return { x: box.left + box.width / 2, y: box.top + box.height }
    }
    if (connectPreviewPt) {
      return sideMidpoint(box, nearestSideHandle(connectPreviewPt, box))
    }
    return { x: box.left + box.width / 2, y: box.top + box.height }
  }, [connectMode, connectFromId, connectFromHandle, connectPreviewPt, diagramNodes])

  const connectPreviewPath = useMemo(() => {
    if (!connectPreviewStart || !connectPreviewPt || !diagramNodes) return ''
    const obstacles = diagramNodes
      .filter((n) => n.id !== connectFromId && !isContainerKind(n.kind) && !n.hidden)
      .map((n) => {
        const b = nodeBox(n, diagramNodes)
        return { x: b.left, y: b.top, w: b.width, h: b.height }
      })
    const leave = handleLeaveDir(connectFromHandle ?? undefined, 'step', 'DOWN')
    const enter = handleEnterDir(undefined, 'DOWN')
    const pts = routeOrthogonal(
      connectPreviewStart,
      connectPreviewPt,
      leave,
      enter,
      obstacles,
      [],
      { slot: 0 },
    )
    return roundedOrthogonalPath(pts)
  }, [
    connectPreviewStart,
    connectPreviewPt,
    diagramNodes,
    connectFromId,
    connectFromHandle,
  ])

  if (!diagram) return null

  return (
    <div
      className={`editor-canvas ${paletteDragOver ? 'is-drop-target' : ''} ${viewOnly ? 'is-view-only' : ''}`}
      ref={wrapperRef}
      onDragEnter={viewOnly ? undefined : onDragEnter}
      onDragOver={viewOnly ? undefined : onDragOver}
      onDragLeave={viewOnly ? undefined : onDragLeave}
      onDrop={viewOnly ? undefined : onDrop}
      data-view-only={viewOnly ? 'true' : undefined}
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
        onConnectStart={onConnectStart}
        onConnectEnd={onConnectEnd}
        onReconnect={onReconnect}
        onReconnectStart={onReconnectStart}
        onReconnectEnd={onReconnectEnd}
        onSelectionChange={viewOnly ? undefined : onSelectionChange}
        onNodeClick={onNodeClick}
        onEdgeClick={viewOnly ? undefined : onEdgeClick}
        onNodeContextMenu={onNodeContextMenu}
        onPaneContextMenu={onPaneContextMenu}
        onNodeMouseEnter={onNodeMouseEnter}
        onNodeMouseMove={onNodeMouseMove}
        onNodeMouseLeave={(e) => {
          onNodeMouseLeave(e)
          if (connectMode) onConnectTargetChange?.(null)
        }}
        onPaneClick={onPaneClick}
        onNodeDragStart={viewOnly || connectMode ? undefined : onNodeDragStart}
        onNodeDragStop={viewOnly || connectMode ? undefined : onNodeDragStop}
        onViewportChange={onViewportChange}
        onPointerMove={(event) => {
          const flowPt = screenToFlowPosition({ x: event.clientX, y: event.clientY })
          setLastFlowPoint(flowPt)
          if (connectMode && connectFromId) {
            setConnectPreviewPt(flowPt)
            const hit = findNodeAtPoint(diagram.nodes, flowPt, connectFromId)
            onConnectTargetChange?.(hit && hit.id !== connectFromId ? hit.id : null)
          }
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
        snapToGrid={snapToGridEnabled && !altHeld && !viewOnly}
        snapGrid={[GRID_SIZE, GRID_SIZE]}
        deleteKeyCode={viewOnly ? null : ['Backspace', 'Delete']}
        multiSelectionKeyCode={viewOnly ? null : ['Shift']}
        selectionOnDrag={!spaceHeld && !connectMode && !viewOnly}
        panOnDrag={spaceHeld || viewOnly ? true : [1, 2]}
        panOnScroll
        zoomOnScroll
        zoomOnPinch
        zoomActivationKeyCode={['Meta', 'Control']}
        nodesDraggable={nodesInteractive}
        nodesConnectable={!viewOnly}
        elementsSelectable
        edgesReconnectable={!viewOnly}
        connectionMode={ConnectionMode.Loose}
        connectionRadius={36}
        connectionLineStyle={{ stroke: EDGE_COLOR, strokeWidth: EDGE_STROKE }}
        connectionLineComponent={ConnectPreviewLine}
        proOptions={{ hideAttribution: true }}
        defaultEdgeOptions={{
          type: 'flow',
          markerEnd: { type: MarkerType.ArrowClosed, width: 8, height: 8, color: EDGE_COLOR },
        }}
        className={[
          spaceHeld ? 'is-panning' : '',
          connectMode ? 'is-connector-tool' : '',
          viewOnly ? 'is-view-only' : '',
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
        {diagram.nodes.some((n) => n.hidden) && !viewOnly ? (
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
        {connectMode && connectFromId && connectPreviewStart && connectPreviewPt ? (
          <ViewportPortal>
            <svg
              className="connect-preview-layer"
              data-testid="connect-preview"
              style={{
                position: 'absolute',
                overflow: 'visible',
                pointerEvents: 'none',
                left: 0,
                top: 0,
                width: 1,
                height: 1,
              }}
            >
              <path
                d={connectPreviewPath}
                fill="none"
                stroke="var(--color-accent)"
                strokeWidth={EDGE_STROKE}
                strokeDasharray="4 4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <circle
                cx={connectPreviewStart.x}
                cy={connectPreviewStart.y}
                r={4}
                fill="var(--color-accent)"
              />
              {connectTargetId ? (
                <circle
                  cx={connectPreviewPt.x}
                  cy={connectPreviewPt.y}
                  r={6}
                  fill="none"
                  stroke="var(--color-accent)"
                  strokeWidth={2}
                />
              ) : null}
            </svg>
          </ViewportPortal>
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
                data-testid="context-auto-arrange"
                onClick={() => {
                  window.dispatchEvent(new CustomEvent('flow-builder:auto-arrange'))
                  setContextMenu(null)
                }}
              >
                Auto-arrange
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
