import { create } from 'zustand'
import { isContainerKind, type Diagram, type DiagramEdge, type DiagramNode, type NodeKind } from '../schema'
import { createNodeOfKind, newEdgeId, newNodeId } from '../editor/kinds'
import { applyZOrder, type ZOrderAction } from '../editor/zOrder'

const MAX_HISTORY = 80
const PASTE_OFFSET = 40

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

  addNode: (kind: NodeKind, position: { x: number; y: number }) => string | null
  updateNode: (id: string, patch: Partial<DiagramNode>) => void
  updateNodes: (ids: string[], patch: Partial<DiagramNode>) => void
  replaceNode: (node: DiagramNode) => void
  removeNodes: (ids: string[]) => void
  moveNodes: (updates: Array<{ id: string; position: { x: number; y: number } }>, recordHistory: boolean) => void
  resizeNode: (id: string, size: { w: number; h: number }, recordHistory?: boolean) => void
  setNodeParent: (
    id: string,
    parentId: string | undefined,
    absolutePosition: { x: number; y: number },
  ) => void
  applyNodeLayout: (nodes: DiagramNode[]) => void
  replaceDiagramContent: (diagram: Diagram) => void

  addEdgeFromConnection: (conn: {
    source: string
    target: string
    sourceHandle?: string | null
    targetHandle?: string | null
  }) => void
  insertNodeOnEdge: (edgeId: string, kind: NodeKind) => string | null
  updateEdge: (id: string, patch: Partial<DiagramEdge>) => void
  updateEdges: (ids: string[], patch: Partial<DiagramEdge>) => void
  removeEdges: (ids: string[]) => void

  setSelection: (nodeIds: string[], edgeIds: string[]) => void
  clearSelection: () => void

  toggleHidden: (ids: string[]) => void
  setHidden: (ids: string[], hidden: boolean) => void
  showAllHidden: () => void
  toggleLocked: (ids: string[]) => void
  reorderZ: (ids: string[], action: ZOrderAction) => void

  copySelection: () => boolean
  pasteClipboard: () => boolean
  duplicateSelection: () => boolean

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

  addNode: (kind, position) => {
    let createdId: string | null = null
    set((state) =>
      withHistory(state, (d) => {
        const node = createNodeOfKind(kind, position)
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
            return pos ? { ...n, position: pos } : n
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

  applyNodeLayout: (nodes) =>
    set((state) =>
      withHistory(state, (d) => ({
        ...d,
        nodes: structuredClone(nodes),
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
          sourceHandle: conn.sourceHandle ?? undefined,
          targetHandle: conn.targetHandle ?? undefined,
        }
        const sourceNode = d.nodes.find((n) => n.id === conn.source)
        if (sourceNode?.kind === 'decision' && conn.sourceHandle) {
          const branch = sourceNode.data.branches.find((b) => b.id === conn.sourceHandle)
          if (branch) {
            edge.label = branch.label
            edge.color = branch.color
          }
        }
        return { ...d, edges: [...d.edges, edge] }
      }),
    )
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

  copySelection: () => {
    const state = get()
    if (!state.diagram || state.selectedNodeIds.length === 0) return false
    const selected = new Set(state.selectedNodeIds)
    const nodes = state.diagram.nodes.filter((n) => selected.has(n.id))
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

  pasteClipboard: () => {
    if (!editorClipboard || editorClipboard.nodes.length === 0) return false
    const { nodes, edges } = remapClipboard(editorClipboard, {
      x: PASTE_OFFSET,
      y: PASTE_OFFSET,
    })
    // Nudge clipboard so repeated pastes keep offsetting
    editorClipboard = {
      nodes: editorClipboard.nodes.map((n) => ({
        ...n,
        position: { x: n.position.x + PASTE_OFFSET, y: n.position.y + PASTE_OFFSET },
      })),
      edges: editorClipboard.edges,
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

  duplicateSelection: () => {
    const copied = get().copySelection()
    if (!copied) return false
    return get().pasteClipboard()
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
