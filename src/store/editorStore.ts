import { create } from 'zustand'
import {
  isContainerKind,
  MAX_LABEL_LENGTH,
  type Diagram,
  type DiagramEdge,
  type DiagramNode,
  type NodeKind,
  type ShapeType,
} from '../schema'
import {
  alignNodes,
  distributeNodes,
  tidyUpNodes,
  type AlignMode,
  type DistributeAxis,
} from '../editor/arrange'
import { GRID_SIZE, nodeBox } from '../editor/alignment'
import { absolutePosition } from '../editor/flowTypes'
import { createNodeOfKind, newEdgeId, newNodeId } from '../editor/kinds'
import { placeNodesIncremental } from '../editor/layout'
import type { SideHandleId } from '../editor/nodes/sideIds'
import { applyZOrder, type ZOrderAction } from '../editor/zOrder'

const MAX_HISTORY = 80
const PASTE_OFFSET = 40
const DEFAULT_NODE_WIDTH_FALLBACK = 256
const DEFAULT_NODE_HEIGHT_FALLBACK = 64
const GROUP_PADDING = 24
const GROUP_HEADER = 44

export type LayerPlacement = 'before' | 'after' | 'inside'

type ClipboardPayload = {
  nodes: DiagramNode[]
  edges: DiagramEdge[]
}

let editorClipboard: ClipboardPayload | null = null

type DiagramBody = {
  title: string
  description?: string
  nodes: DiagramNode[]
  edges: DiagramEdge[]
  groups: unknown[]
  viewport: Diagram['viewport']
  theme: Diagram['theme']
}

type HistoryEntry = DiagramBody

export type SaveStatus = 'idle' | 'dirty' | 'saving' | 'saved' | 'error'

type EditorState = {
  diagram: Diagram | null
  revision: number
  saveStatus: SaveStatus
  saveError: string | null
  selectedNodeIds: string[]
  selectedEdgeIds: string[]
  past: HistoryEntry[]
  future: HistoryEntry[]

  load: (diagram: Diagram, revision: number) => void
  reset: () => void
  getDiagram: () => Diagram | null

  setTitle: (title: string) => void
  setDescription: (description: string) => void
  setViewport: (viewport: Diagram['viewport']) => void

  addNode: (
    kind: NodeKind,
    position: { x: number; y: number },
    options?: { shape?: ShapeType },
  ) => string | null
  updateNode: (id: string, patch: Partial<DiagramNode>) => void
  updateNodes: (ids: string[], patch: Partial<DiagramNode>) => void
  replaceNode: (node: DiagramNode) => void
  removeNodes: (ids: string[]) => void
  moveNodes: (updates: Array<{ id: string; position: { x: number; y: number } }>, recordHistory: boolean) => void
  resizeNode: (id: string, size: { w: number; h: number }, recordHistory?: boolean) => void
  resizeNodes: (
    updates: Array<{ id: string; size: { w: number; h: number } }>,
    recordHistory: boolean,
  ) => void
  /** Merge style fields into each node. Pass undefined for a key to clear it. */
  patchNodeStyle: (
    ids: string[],
    patch: Partial<NonNullable<DiagramNode['style']>>,
    recordHistory?: boolean,
  ) => void
  setNodeParent: (
    id: string,
    parentId: string | undefined,
    absolutePosition: { x: number; y: number },
  ) => void
  applyNodeLayout: (nodes: DiagramNode[], edges?: DiagramEdge[]) => void
  replaceDiagramContent: (diagram: Diagram) => void

  addEdgeFromConnection: (conn: {
    source: string
    target: string
    sourceHandle?: string | null
    targetHandle?: string | null
  }) => void
  reconnectEdge: (
    edgeId: string,
    connection: {
      source: string
      target: string
      sourceHandle?: string | null
      targetHandle?: string | null
    },
  ) => void
  insertNodeOnEdge: (edgeId: string, kind: NodeKind) => string | null
  addConnectedNode: (sourceId: string, side: SideHandleId) => string | null
  updateEdge: (id: string, patch: Partial<DiagramEdge>) => void
  updateEdges: (ids: string[], patch: Partial<DiagramEdge>) => void
  removeEdges: (ids: string[]) => void

  alignSelection: (mode: AlignMode) => void
  distributeSelection: (axis: DistributeAxis) => void
  tidySelection: () => void
  /** Nudge selected nodes. Pass recordHistory true only on the first key of a burst. */
  nudgeSelection: (dx: number, dy: number, recordHistory: boolean) => void

  setSelection: (nodeIds: string[], edgeIds: string[]) => void
  selectAll: () => void
  clearSelection: () => void

  toggleHidden: (ids: string[]) => void
  setHidden: (ids: string[], hidden: boolean) => void
  showAllHidden: () => void
  toggleLocked: (ids: string[]) => void
  reorderZ: (ids: string[], action: ZOrderAction) => void
  groupSelection: () => string | null
  ungroupSelection: () => boolean
  renameNode: (id: string, label: string) => void
  reorderLayer: (
    dragId: string,
    targetId: string,
    placement: 'before' | 'after' | 'inside',
  ) => boolean

  copySelection: () => boolean
  pasteClipboard: (at?: { x: number; y: number }) => boolean
  pasteClipboardInPlace: () => boolean
  duplicateSelection: () => boolean
  selectSimilar: () => boolean

  undo: () => void
  redo: () => void
  canUndo: () => boolean
  canRedo: () => boolean

  markSaving: () => void
  markSaved: (revision: number) => void
  markSaveError: (message: string) => void
  markDirty: () => void
}

function sameIdList(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false
  }
  return true
}

function remapClipboard(
  payload: ClipboardPayload,
  offset: { x: number; y: number },
): { nodes: DiagramNode[]; edges: DiagramEdge[]; idMap: Map<string, string> } {
  const idMap = new Map<string, string>()
  for (const node of payload.nodes) {
    idMap.set(node.id, newNodeId(node.kind === 'group' ? 'g' : 'n'))
  }

  const nodes = payload.nodes.map((node) => {
    const nextId = idMap.get(node.id)!
    const parentId =
      node.parentId && idMap.has(node.parentId) ? idMap.get(node.parentId) : undefined
    return {
      ...structuredClone(node),
      id: nextId,
      parentId,
      position: {
        x: node.position.x + offset.x,
        y: node.position.y + offset.y,
      },
    } as DiagramNode
  })

  const edges = payload.edges
    .filter((edge) => idMap.has(edge.source) && idMap.has(edge.target))
    .map((edge) => ({
      ...structuredClone(edge),
      id: newEdgeId(),
      source: idMap.get(edge.source)!,
      target: idMap.get(edge.target)!,
    }))

  return { nodes, edges, idMap }
}

function isAncestorOf(nodes: DiagramNode[], ancestorId: string, nodeId: string): boolean {
  let current = nodes.find((n) => n.id === nodeId)
  const seen = new Set<string>()
  while (current?.parentId && !seen.has(current.id)) {
    if (current.parentId === ancestorId) return true
    seen.add(current.id)
    const parentId: string = current.parentId
    current = nodes.find((n) => n.id === parentId)
  }
  return false
}

function siblingOrder(nodes: DiagramNode[], parentId: string | undefined): DiagramNode[] {
  const siblings = nodes.filter((n) => n.parentId === parentId)
  const z = (n: DiagramNode) =>
    typeof n.zIndex === 'number' ? n.zIndex : isContainerKind(n.kind) ? -1 : 1
  return siblings
    .map((n, i) => ({ n, i }))
    .sort((a, b) => z(a.n) - z(b.n) || a.i - b.i)
    .map((x) => x.n)
}

function cloneBody(diagram: Diagram): HistoryEntry {
  return {
    title: diagram.title,
    description: diagram.description,
    nodes: structuredClone(diagram.nodes),
    edges: structuredClone(diagram.edges),
    groups: structuredClone(diagram.groups ?? []),
    viewport: { ...diagram.viewport },
    theme: { ...diagram.theme },
  }
}

function applyBody(diagram: Diagram, body: HistoryEntry): Diagram {
  return {
    ...diagram,
    title: body.title,
    description: body.description,
    nodes: structuredClone(body.nodes),
    edges: structuredClone(body.edges),
    groups: structuredClone(body.groups),
    viewport: { ...body.viewport },
    theme: { ...body.theme },
  }
}

function withHistory(
  state: EditorState,
  mutator: (diagram: Diagram) => Diagram,
  options: { record?: boolean } = {},
): Partial<EditorState> {
  if (!state.diagram) return {}
  const record = options.record !== false
  const past = record
    ? [...state.past, cloneBody(state.diagram)].slice(-MAX_HISTORY)
    : state.past
  const next = mutator(state.diagram)
  return {
    diagram: next,
    past,
    future: record ? [] : state.future,
    saveStatus: 'dirty',
    saveError: null,
  }
}

export const useEditorStore = create<EditorState>((set, get) => ({
  diagram: null,
  revision: 0,
  saveStatus: 'idle',
  saveError: null,
  selectedNodeIds: [],
  selectedEdgeIds: [],
  past: [],
  future: [],

  load: (diagram, revision) =>
    set({
      diagram: structuredClone(diagram),
      revision,
      saveStatus: 'saved',
      saveError: null,
      selectedNodeIds: [],
      selectedEdgeIds: [],
      past: [],
      future: [],
    }),

  reset: () =>
    set({
      diagram: null,
      revision: 0,
      saveStatus: 'idle',
      saveError: null,
      selectedNodeIds: [],
      selectedEdgeIds: [],
      past: [],
      future: [],
    }),

  getDiagram: () => get().diagram,

  setTitle: (title) =>
    set((state) =>
      withHistory(state, (d) => ({
        ...d,
        title: title.slice(0, 200) || d.title,
      })),
    ),

  setDescription: (description) =>
    set((state) =>
      withHistory(state, (d) => ({
        ...d,
        description,
      })),
    ),

  setViewport: (viewport) =>
    set((state) => {
      if (!state.diagram) return {}
      return {
        diagram: { ...state.diagram, viewport },
        saveStatus: state.saveStatus === 'saved' ? 'dirty' : state.saveStatus === 'idle' ? 'dirty' : state.saveStatus,
      }
    }),

  addNode: (kind, position, options) => {
    let createdId: string | null = null
    set((state) =>
      withHistory(state, (d) => {
        const node = createNodeOfKind(kind, position, options?.shape ? { shape: options.shape } : {})
        createdId = node.id
        return { ...d, nodes: [...d.nodes, node] }
      }),
    )
    if (createdId) {
      set({ selectedNodeIds: [createdId], selectedEdgeIds: [] })
    }
    return createdId
  },

  updateNode: (id, patch) =>
    set((state) =>
      withHistory(state, (d) => ({
        ...d,
        nodes: d.nodes.map((n) => {
          if (n.id !== id) return n
          return { ...n, ...patch, id: n.id, kind: n.kind } as DiagramNode
        }),
      })),
    ),

  updateNodes: (ids, patch) => {
    const idSet = new Set(ids)
    if (idSet.size === 0) return
    set((state) =>
      withHistory(state, (d) => ({
        ...d,
        nodes: d.nodes.map((n) => {
          if (!idSet.has(n.id)) return n
          return { ...n, ...patch, id: n.id, kind: n.kind } as DiagramNode
        }),
      })),
    )
  },

  replaceNode: (node) =>
    set((state) =>
      withHistory(state, (d) => ({
        ...d,
        nodes: d.nodes.map((n) => (n.id === node.id ? node : n)),
      })),
    ),

  removeNodes: (ids) => {
    const idSet = new Set(ids)
    set((state) =>
      withHistory(state, (d) => ({
        ...d,
        nodes: d.nodes
          .filter((n) => !idSet.has(n.id))
          .map((n) => (n.parentId && idSet.has(n.parentId) ? { ...n, parentId: undefined } : n)),
        edges: d.edges.filter((e) => !idSet.has(e.source) && !idSet.has(e.target)),
      })),
    )
    set((state) => ({
      selectedNodeIds: state.selectedNodeIds.filter((id) => !idSet.has(id)),
      selectedEdgeIds: state.selectedEdgeIds,
    }))
  },

  moveNodes: (updates, recordHistory) =>
    set((state) => {
      const map = new Map(updates.map((u) => [u.id, u.position]))
      return withHistory(
        state,
        (d) => ({
          ...d,
          nodes: d.nodes.map((n) => {
            const pos = map.get(n.id)
            return pos ? { ...n, position: pos, manuallyPositioned: true } : n
          }),
        }),
        { record: recordHistory },
      )
    }),

  resizeNode: (id, size, recordHistory = true) =>
    set((state) =>
      withHistory(
        state,
        (d) => ({
          ...d,
          nodes: d.nodes.map((n) => (n.id === id ? { ...n, size } : n)),
        }),
        { record: recordHistory },
      ),
    ),

  resizeNodes: (updates, recordHistory) => {
    if (updates.length === 0) return
    const map = new Map(updates.map((u) => [u.id, u.size]))
    set((state) =>
      withHistory(
        state,
        (d) => ({
          ...d,
          nodes: d.nodes.map((n) => {
            const size = map.get(n.id)
            return size ? ({ ...n, size } as DiagramNode) : n
          }),
        }),
        { record: recordHistory },
      ),
    )
  },

  patchNodeStyle: (ids, patch, recordHistory = true) => {
    const idSet = new Set(ids)
    if (idSet.size === 0) return
    set((state) =>
      withHistory(
        state,
        (d) => ({
          ...d,
          nodes: d.nodes.map((n) => {
            if (!idSet.has(n.id)) return n
            const style = { ...(n.style ?? {}), ...patch }
            for (const key of Object.keys(style) as Array<keyof typeof style>) {
              if (style[key] === undefined) delete style[key]
            }
            return {
              ...n,
              style: Object.keys(style).length > 0 ? style : undefined,
            } as DiagramNode
          }),
        }),
        { record: recordHistory },
      ),
    )
  },

  setNodeParent: (id, parentId, absolutePosition) =>
    set((state) =>
      withHistory(state, (d) => {
        const node = d.nodes.find((n) => n.id === id)
        if (!node || isContainerKind(node.kind)) return d
        if (parentId === id) return d

        let position = absolutePosition
        if (parentId) {
          const parent = d.nodes.find((n) => n.id === parentId && isContainerKind(n.kind))
          if (!parent) return d
          position = {
            x: absolutePosition.x - parent.position.x,
            y: absolutePosition.y - parent.position.y,
          }
        }

        return {
          ...d,
          nodes: d.nodes.map((n) =>
            n.id === id
              ? ({
                  ...n,
                  parentId: parentId || undefined,
                  position,
                } as DiagramNode)
              : n,
          ),
        }
      }),
    ),

  applyNodeLayout: (nodes, edges) =>
    set((state) =>
      withHistory(state, (d) => ({
        ...d,
        nodes: structuredClone(nodes),
        edges: edges ? structuredClone(edges) : d.edges,
        layoutPending: false,
        fitPending: false,
      })),
    ),

  replaceDiagramContent: (diagram) =>
    set((state) => {
      if (!state.diagram) return {}
      return withHistory(state, () => ({
        ...diagram,
        id: state.diagram!.id,
      }))
    }),

  addEdgeFromConnection: (conn) => {
    if (!conn.source || !conn.target || conn.source === conn.target) return
    set((state) =>
      withHistory(state, (d) => {
        const exists = d.edges.some(
          (e) =>
            e.source === conn.source &&
            e.target === conn.target &&
            (e.sourceHandle ?? null) === (conn.sourceHandle ?? null),
        )
        if (exists) return d
        const edge: DiagramEdge = {
          id: newEdgeId(),
          source: conn.source,
          target: conn.target,
          sourceHandle: conn.sourceHandle || 'bottom',
          targetHandle: conn.targetHandle || 'top',
        }
        const sourceNode = d.nodes.find((n) => n.id === conn.source)
        if (
          (sourceNode?.kind === 'decision' || sourceNode?.kind === 'switch') &&
          conn.sourceHandle
        ) {
          const branch = sourceNode.data.branches.find((b) => b.id === conn.sourceHandle)
          if (branch) {
            // Colour the edge; chip already names the branch so skip duplicate labels.
            edge.color = branch.color
          }
        }
        return { ...d, edges: [...d.edges, edge] }
      }),
    )
  },

  reconnectEdge: (edgeId, connection) => {
    if (!connection.source || !connection.target || connection.source === connection.target) {
      return
    }
    set((state) =>
      withHistory(state, (d) => ({
        ...d,
        edges: d.edges.map((e) =>
          e.id === edgeId
            ? {
                ...e,
                source: connection.source,
                target: connection.target,
                sourceHandle: connection.sourceHandle || e.sourceHandle || 'bottom',
                targetHandle: connection.targetHandle || e.targetHandle || 'top',
              }
            : e,
        ),
      })),
    )
  },

  addConnectedNode: (sourceId, side) => {
    let createdId: string | null = null
    set((state) =>
      withHistory(state, (d) => {
        const source = d.nodes.find((n) => n.id === sourceId)
        if (!source || source.locked) return d
        const kind: NodeKind =
          source.kind === 'start' || source.kind === 'end' || isContainerKind(source.kind)
            ? 'step'
            : source.kind
        const gap = GRID_SIZE * 5
        const sw = source.size?.w ?? 256
        const sh = source.size?.h ?? 96
        const offsets: Record<SideHandleId, { x: number; y: number; target: SideHandleId }> = {
          top: { x: 0, y: -(gap + 96), target: 'bottom' },
          right: { x: sw + gap, y: 0, target: 'left' },
          bottom: { x: 0, y: sh + gap, target: 'top' },
          left: { x: -(gap + 256), y: 0, target: 'right' },
        }
        const off = offsets[side]
        const position = {
          x: Math.round((source.position.x + off.x) / GRID_SIZE) * GRID_SIZE,
          y: Math.round((source.position.y + off.y) / GRID_SIZE) * GRID_SIZE,
        }
        const node =
          source.kind === 'shape'
            ? createNodeOfKind('shape', position, { shape: source.data.shape })
            : createNodeOfKind(kind, position)
        createdId = node.id
        const edge: DiagramEdge = {
          id: newEdgeId(),
          source: sourceId,
          target: node.id,
          sourceHandle: side,
          targetHandle: off.target,
          type: 'elbow',
        }
        const draftNodes = [...d.nodes, node]
        const draftEdges = [...d.edges, edge]
        const direction = side === 'left' || side === 'right' ? 'RIGHT' : 'DOWN'
        const laid = placeNodesIncremental(draftNodes, draftEdges, [node.id], direction)
        return { ...d, nodes: laid.nodes, edges: laid.edges }
      }),
    )
    if (createdId) {
      set({ selectedNodeIds: [createdId], selectedEdgeIds: [] })
    }
    return createdId
  },

  insertNodeOnEdge: (edgeId, kind) => {
    if (isContainerKind(kind)) return null
    let createdId: string | null = null
    set((state) =>
      withHistory(state, (d) => {
        const edge = d.edges.find((e) => e.id === edgeId)
        if (!edge) return d
        const source = d.nodes.find((n) => n.id === edge.source)
        const target = d.nodes.find((n) => n.id === edge.target)
        if (!source || !target) return d

        const mid = {
          x: Math.round((source.position.x + target.position.x) / 2 / 16) * 16,
          y: Math.round((source.position.y + target.position.y) / 2 / 16) * 16,
        }
        const node = createNodeOfKind(kind, mid)
        createdId = node.id

        const edgeToNew: DiagramEdge = {
          id: newEdgeId(),
          source: edge.source,
          target: node.id,
          sourceHandle: edge.sourceHandle,
          label: edge.label,
          color: edge.color,
        }
        const edgeFromNew: DiagramEdge = {
          id: newEdgeId(),
          source: node.id,
          target: edge.target,
          targetHandle: edge.targetHandle,
        }

        return {
          ...d,
          nodes: [...d.nodes, node],
          edges: [...d.edges.filter((e) => e.id !== edgeId), edgeToNew, edgeFromNew],
        }
      }),
    )
    if (createdId) {
      set({ selectedNodeIds: [createdId], selectedEdgeIds: [] })
    }
    return createdId
  },

  updateEdge: (id, patch) =>
    set((state) =>
      withHistory(state, (d) => ({
        ...d,
        edges: d.edges.map((e) => (e.id === id ? { ...e, ...patch, id: e.id } : e)),
      })),
    ),

  updateEdges: (ids, patch) => {
    const idSet = new Set(ids)
    if (idSet.size === 0) return
    set((state) =>
      withHistory(state, (d) => ({
        ...d,
        edges: d.edges.map((e) => (idSet.has(e.id) ? { ...e, ...patch, id: e.id } : e)),
      })),
    )
  },

  removeEdges: (ids) => {
    const idSet = new Set(ids)
    set((state) =>
      withHistory(state, (d) => ({
        ...d,
        edges: d.edges.filter((e) => !idSet.has(e.id)),
      })),
    )
    set((state) => ({
      selectedEdgeIds: state.selectedEdgeIds.filter((id) => !idSet.has(id)),
    }))
  },

  alignSelection: (mode) => {
    const state = get()
    if (!state.diagram || state.selectedNodeIds.length < 2) return
    const updates = alignNodes(state.diagram.nodes, state.selectedNodeIds, mode)
    if (!updates.length) return
    get().moveNodes(updates, true)
  },

  distributeSelection: (axis) => {
    const state = get()
    if (!state.diagram || state.selectedNodeIds.length < 3) return
    const updates = distributeNodes(state.diagram.nodes, state.selectedNodeIds, axis)
    if (!updates.length) return
    get().moveNodes(updates, true)
  },

  tidySelection: () => {
    const state = get()
    if (!state.diagram || state.selectedNodeIds.length < 2) return
    const updates = tidyUpNodes(state.diagram.nodes, state.selectedNodeIds)
    if (!updates.length) return
    get().moveNodes(updates, true)
  },

  nudgeSelection: (dx, dy, recordHistory) => {
    const state = get()
    if (!state.diagram || !state.selectedNodeIds.length) return
    const idSet = new Set(state.selectedNodeIds)
    const updates = state.diagram.nodes
      .filter((n) => idSet.has(n.id) && !n.locked && !n.hidden)
      .map((n) => ({
        id: n.id,
        position: { x: n.position.x + dx, y: n.position.y + dy },
      }))
    if (!updates.length) return
    get().moveNodes(updates, recordHistory)
  },

  setSelection: (nodeIds, edgeIds) => {
    const nextNodes = [...nodeIds]
    const nextEdges = [...edgeIds]
    const state = get()
    if (
      sameIdList(state.selectedNodeIds, nextNodes) &&
      sameIdList(state.selectedEdgeIds, nextEdges)
    ) {
      return
    }
    set({ selectedNodeIds: nextNodes, selectedEdgeIds: nextEdges })
  },

  selectAll: () => {
    const d = get().diagram
    if (!d) return
    const ids = d.nodes.filter((n) => !n.hidden && !n.locked).map((n) => n.id)
    set({ selectedNodeIds: ids, selectedEdgeIds: [] })
  },

  clearSelection: () => set({ selectedNodeIds: [], selectedEdgeIds: [] }),

  toggleHidden: (ids) => {
    const idSet = new Set(ids)
    if (idSet.size === 0) return
    set((state) =>
      withHistory(state, (d) => {
        const anyVisible = d.nodes.some((n) => idSet.has(n.id) && n.hidden !== true)
        const hidden = anyVisible
        return {
          ...d,
          nodes: d.nodes.map((n) =>
            idSet.has(n.id) ? ({ ...n, hidden } as DiagramNode) : n,
          ),
        }
      }),
    )
  },

  setHidden: (ids, hidden) => {
    const idSet = new Set(ids)
    if (idSet.size === 0) return
    set((state) =>
      withHistory(state, (d) => ({
        ...d,
        nodes: d.nodes.map((n) =>
          idSet.has(n.id) ? ({ ...n, hidden: hidden || undefined } as DiagramNode) : n,
        ),
      })),
    )
  },

  showAllHidden: () =>
    set((state) =>
      withHistory(state, (d) => {
        if (!d.nodes.some((n) => n.hidden)) return d
        return {
          ...d,
          nodes: d.nodes.map((n) =>
            n.hidden ? ({ ...n, hidden: undefined } as DiagramNode) : n,
          ),
        }
      }),
    ),

  toggleLocked: (ids) => {
    const idSet = new Set(ids)
    if (idSet.size === 0) return
    set((state) =>
      withHistory(state, (d) => {
        const anyUnlocked = d.nodes.some((n) => idSet.has(n.id) && n.locked !== true)
        const locked = anyUnlocked
        return {
          ...d,
          nodes: d.nodes.map((n) =>
            idSet.has(n.id) ? ({ ...n, locked: locked || undefined } as DiagramNode) : n,
          ),
        }
      }),
    )
  },

  reorderZ: (ids, action) => {
    if (ids.length === 0) return
    set((state) =>
      withHistory(state, (d) => ({
        ...d,
        nodes: applyZOrder(d.nodes, ids, action),
      })),
    )
  },

  renameNode: (id, label) => {
    const next = label.trim().slice(0, MAX_LABEL_LENGTH)
    if (!next) return
    const current = get().diagram?.nodes.find((n) => n.id === id)
    if (!current) return
    const currentLabel =
      current.kind === 'group' || current.kind === 'section' ? current.data.label : current.label
    if (currentLabel === next && current.label === next) return
    set((state) =>
      withHistory(state, (d) => ({
        ...d,
        nodes: d.nodes.map((n) => {
          if (n.id !== id) return n
          if (n.kind === 'group' || n.kind === 'section') {
            return { ...n, label: next, data: { ...n.data, label: next } } as DiagramNode
          }
          return { ...n, label: next } as DiagramNode
        }),
      })),
    )
  },

  reorderLayer: (dragId, targetId, placement) => {
    const state = get()
    const d = state.diagram
    if (!d || dragId === targetId) return false
    const drag = d.nodes.find((n) => n.id === dragId)
    const target = d.nodes.find((n) => n.id === targetId)
    if (!drag || !target || drag.locked) return false
    // Never drop a layer into its own subtree.
    if (isAncestorOf(d.nodes, dragId, targetId)) return false

    let newParentId: string | undefined
    if (placement === 'inside') {
      if (!isContainerKind(target.kind)) return false
      newParentId = target.id
    } else {
      newParentId = target.parentId
    }

    const dragAbs = absolutePosition(drag, d.nodes)
    let changed = false
    set((s) =>
      withHistory(s, (diagram) => {
        const nodes = diagram.nodes
        let position = drag.position
        if (newParentId !== drag.parentId) {
          if (newParentId) {
            const parent = nodes.find((n) => n.id === newParentId)!
            const parentAbs = absolutePosition(parent, nodes)
            position = { x: dragAbs.x - parentAbs.x, y: dragAbs.y - parentAbs.y }
          } else {
            position = dragAbs
          }
        }

        const others = siblingOrder(nodes, newParentId).filter((n) => n.id !== dragId)
        let insertAt: number
        if (placement === 'inside') {
          // Top of the container's stack (front).
          insertAt = others.length
        } else {
          const targetIndex = others.findIndex((n) => n.id === targetId)
          // Layers list shows front at top: "before" means visually above (higher z).
          insertAt = placement === 'before' ? targetIndex + 1 : targetIndex
        }
        const ordered = [...others]
        ordered.splice(insertAt, 0, drag)
        const zById = new Map<string, number>()
        ordered.forEach((n, index) => {
          zById.set(n.id, (isContainerKind(n.kind) ? -1000 : 0) + index)
        })

        changed = true
        return {
          ...diagram,
          nodes: nodes.map((n) => {
            if (n.id === dragId) {
              return {
                ...n,
                parentId: newParentId,
                position,
                zIndex: zById.get(n.id),
              } as DiagramNode
            }
            const z = zById.get(n.id)
            return z === undefined ? n : ({ ...n, zIndex: z } as DiagramNode)
          }),
        }
      }),
    )
    return changed
  },

  groupSelection: () => {
    const state = get()
    const d = state.diagram
    if (!d || state.selectedNodeIds.length === 0) return null
    const selectedSet = new Set(state.selectedNodeIds)
    const candidates = d.nodes.filter((n) => selectedSet.has(n.id) && !n.locked && !n.hidden)
    // Skip nodes already carried by a selected ancestor container.
    const top = candidates.filter(
      (n) => !candidates.some((other) => other.id !== n.id && isAncestorOf(d.nodes, other.id, n.id)),
    )
    if (top.length === 0) return null

    const boxes = top.map((n) => nodeBox(n, d.nodes))
    const minX = Math.min(...boxes.map((b) => b.left))
    const minY = Math.min(...boxes.map((b) => b.top))
    const maxX = Math.max(...boxes.map((b) => b.right))
    const maxY = Math.max(...boxes.map((b) => b.bottom))
    const origin = { x: minX - GROUP_PADDING, y: minY - GROUP_PADDING - GROUP_HEADER }
    const size = {
      w: maxX - minX + GROUP_PADDING * 2,
      h: maxY - minY + GROUP_PADDING * 2 + GROUP_HEADER,
    }

    // Share a parent only when every member already lives in the same container.
    const parents = new Set(top.map((n) => n.parentId))
    const sharedParent = parents.size === 1 ? top[0].parentId : undefined
    const sharedParentNode = sharedParent ? d.nodes.find((n) => n.id === sharedParent) : undefined
    const parentAbs = sharedParentNode ? absolutePosition(sharedParentNode, d.nodes) : { x: 0, y: 0 }

    const group = createNodeOfKind('group', sharedParentNode
      ? { x: origin.x - parentAbs.x, y: origin.y - parentAbs.y }
      : origin)
    group.size = size
    if (sharedParentNode) group.parentId = sharedParentNode.id

    const topIds = new Set(top.map((n) => n.id))
    const absById = new Map(top.map((n) => [n.id, absolutePosition(n, d.nodes)]))

    set((s) =>
      withHistory(s, (diagram) => {
        const firstIndex = diagram.nodes.findIndex((n) => topIds.has(n.id))
        const reparented = diagram.nodes.map((n) => {
          if (!topIds.has(n.id)) return n
          const abs = absById.get(n.id)!
          return {
            ...n,
            parentId: group.id,
            position: { x: abs.x - origin.x, y: abs.y - origin.y },
          } as DiagramNode
        })
        // Parents must precede children for React Flow.
        const insertAt = Math.max(0, firstIndex)
        const nodes = [...reparented.slice(0, insertAt), group, ...reparented.slice(insertAt)]
        return { ...diagram, nodes }
      }),
    )
    set({ selectedNodeIds: [group.id], selectedEdgeIds: [] })
    return group.id
  },

  ungroupSelection: () => {
    const state = get()
    const d = state.diagram
    if (!d || state.selectedNodeIds.length === 0) return false
    const selectedSet = new Set(state.selectedNodeIds)

    let containerIds = d.nodes
      .filter((n) => selectedSet.has(n.id) && isContainerKind(n.kind) && !n.locked)
      .map((n) => n.id)

    if (containerIds.length === 0) {
      // Fall back to the single container that holds the selected children.
      const selected = d.nodes.filter((n) => selectedSet.has(n.id))
      const parentIds = new Set(selected.map((n) => n.parentId))
      if (parentIds.size !== 1) return false
      const parentId = [...parentIds][0]
      const parent = parentId ? d.nodes.find((n) => n.id === parentId) : undefined
      if (!parent || !isContainerKind(parent.kind) || parent.locked) return false
      containerIds = [parent.id]
    }

    const removed = new Set(containerIds)
    const freed: string[] = []
    set((s) =>
      withHistory(s, (diagram) => {
        let nodes = diagram.nodes
        for (const containerId of containerIds) {
          const container = nodes.find((n) => n.id === containerId)
          if (!container) continue
          nodes = nodes
            .filter((n) => n.id !== containerId)
            .map((n) => {
              if (n.parentId !== containerId) return n
              if (!removed.has(n.id)) freed.push(n.id)
              // Child position is relative to the container; the container may itself be nested.
              return {
                ...n,
                parentId: container.parentId,
                position: {
                  x: n.position.x + container.position.x,
                  y: n.position.y + container.position.y,
                },
              } as DiagramNode
            })
        }
        const gone = new Set(containerIds)
        return {
          ...diagram,
          nodes,
          edges: diagram.edges.filter((e) => !gone.has(e.source) && !gone.has(e.target)),
        }
      }),
    )
    const nodeIds = new Set(get().diagram?.nodes.map((n) => n.id))
    set({
      selectedNodeIds: freed.filter((id) => nodeIds.has(id)),
      selectedEdgeIds: [],
    })
    return true
  },

  copySelection: () => {
    const state = get()
    if (!state.diagram || state.selectedNodeIds.length === 0) return false
    const selected = new Set(state.selectedNodeIds)
    const all = state.diagram.nodes
    // Nodes whose container is not copied are stored with absolute coordinates.
    const nodes = all
      .filter((n) => selected.has(n.id))
      .map((n) =>
        n.parentId && !selected.has(n.parentId)
          ? ({ ...n, parentId: undefined, position: absolutePosition(n, all) } as DiagramNode)
          : n,
      )
    const edges = state.diagram.edges.filter(
      (e) =>
        (selected.has(e.source) && selected.has(e.target)) ||
        state.selectedEdgeIds.includes(e.id),
    )
    editorClipboard = {
      nodes: structuredClone(nodes),
      edges: structuredClone(edges),
    }
    return true
  },

  pasteClipboard: (at) => {
    if (!editorClipboard || editorClipboard.nodes.length === 0) return false

    let offset = { x: PASTE_OFFSET, y: PASTE_OFFSET }
    if (at) {
      const xs = editorClipboard.nodes.map((n) => n.position.x)
      const ys = editorClipboard.nodes.map((n) => n.position.y)
      const minX = Math.min(...xs)
      const minY = Math.min(...ys)
      const maxX = Math.max(
        ...editorClipboard.nodes.map((n) => n.position.x + (n.size?.w ?? DEFAULT_NODE_WIDTH_FALLBACK)),
      )
      const maxY = Math.max(
        ...editorClipboard.nodes.map((n) => n.position.y + (n.size?.h ?? DEFAULT_NODE_HEIGHT_FALLBACK)),
      )
      const cx = (minX + maxX) / 2
      const cy = (minY + maxY) / 2
      offset = { x: at.x - cx, y: at.y - cy }
    }

    const { nodes, edges } = remapClipboard(editorClipboard, offset)
    // Nudge clipboard so repeated pastes keep offsetting when no cursor target.
    if (!at) {
      editorClipboard = {
        nodes: editorClipboard.nodes.map((n) => ({
          ...n,
          position: { x: n.position.x + PASTE_OFFSET, y: n.position.y + PASTE_OFFSET },
        })),
        edges: editorClipboard.edges,
      }
    }

    set((state) =>
      withHistory(state, (d) => ({
        ...d,
        nodes: [...d.nodes, ...nodes],
        edges: [...d.edges, ...edges],
      })),
    )
    set({
      selectedNodeIds: nodes.map((n) => n.id),
      selectedEdgeIds: edges.map((e) => e.id),
    })
    return true
  },

  pasteClipboardInPlace: () => {
    if (!editorClipboard || editorClipboard.nodes.length === 0) return false
    const { nodes, edges } = remapClipboard(editorClipboard, { x: 0, y: 0 })
    set((state) =>
      withHistory(state, (d) => ({
        ...d,
        nodes: [...d.nodes, ...nodes],
        edges: [...d.edges, ...edges],
      })),
    )
    set({
      selectedNodeIds: nodes.map((n) => n.id),
      selectedEdgeIds: edges.map((e) => e.id),
    })
    return true
  },

  duplicateSelection: () => {
    const copied = get().copySelection()
    if (!copied) return false
    return get().pasteClipboard()
  },

  selectSimilar: () => {
    const state = get()
    if (!state.diagram || state.selectedNodeIds.length === 0) return false
    const selected = state.diagram.nodes.filter((n) => state.selectedNodeIds.includes(n.id))
    if (selected.length === 0) return false
    const kind = selected[0].kind
    if (!selected.every((n) => n.kind === kind)) return false
    const ids = state.diagram.nodes.filter((n) => n.kind === kind).map((n) => n.id)
    set({ selectedNodeIds: ids, selectedEdgeIds: [] })
    return true
  },

  undo: () =>
    set((state) => {
      if (!state.diagram || state.past.length === 0) return {}
      const previous = state.past[state.past.length - 1]
      const past = state.past.slice(0, -1)
      const future = [cloneBody(state.diagram), ...state.future].slice(0, MAX_HISTORY)
      return {
        diagram: applyBody(state.diagram, previous),
        past,
        future,
        saveStatus: 'dirty',
        selectedNodeIds: [],
        selectedEdgeIds: [],
      }
    }),

  redo: () =>
    set((state) => {
      if (!state.diagram || state.future.length === 0) return {}
      const [next, ...rest] = state.future
      const past = [...state.past, cloneBody(state.diagram)].slice(-MAX_HISTORY)
      return {
        diagram: applyBody(state.diagram, next),
        past,
        future: rest,
        saveStatus: 'dirty',
        selectedNodeIds: [],
        selectedEdgeIds: [],
      }
    }),

  canUndo: () => get().past.length > 0,
  canRedo: () => get().future.length > 0,

  markSaving: () => set({ saveStatus: 'saving', saveError: null }),

  markSaved: (revision) =>
    set({
      revision,
      saveStatus: 'saved',
      saveError: null,
    }),

  markSaveError: (message) => set({ saveStatus: 'error', saveError: message }),

  markDirty: () => set({ saveStatus: 'dirty' }),
}))

// E2E / debug access (never used by product UI).
if (typeof window !== 'undefined') {
  ;(window as unknown as { __FLOW_BUILDER_STORE__: typeof useEditorStore }).__FLOW_BUILDER_STORE__ =
    useEditorStore
}
