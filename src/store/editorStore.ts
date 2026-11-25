import { create } from 'zustand'
import type { Diagram, DiagramEdge, DiagramNode, NodeKind } from '../schema'
import { createNodeOfKind, newEdgeId } from '../editor/kinds'

const MAX_HISTORY = 80

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
  updateEdge: (id: string, patch: Partial<DiagramEdge>) => void
  removeEdges: (ids: string[]) => void

  setSelection: (nodeIds: string[], edgeIds: string[]) => void
  clearSelection: () => void

  undo: () => void
  redo: () => void
  canUndo: () => boolean
  canRedo: () => boolean

  markSaving: () => void
  markSaved: (revision: number) => void
  markSaveError: (message: string) => void
  markDirty: () => void
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
        if (!node || node.kind === 'group') return d
        if (parentId === id) return d

        let position = absolutePosition
        if (parentId) {
          const parent = d.nodes.find((n) => n.id === parentId && n.kind === 'group')
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

  updateEdge: (id, patch) =>
    set((state) =>
      withHistory(state, (d) => ({
        ...d,
        edges: d.edges.map((e) => (e.id === id ? { ...e, ...patch, id: e.id } : e)),
      })),
    ),

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

  setSelection: (nodeIds, edgeIds) => set({ selectedNodeIds: nodeIds, selectedEdgeIds: edgeIds }),

  clearSelection: () => set({ selectedNodeIds: [], selectedEdgeIds: [] }),

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
