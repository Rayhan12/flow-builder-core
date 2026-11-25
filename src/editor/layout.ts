import ELK, { type ElkNode } from 'elkjs/lib/elk.bundled.js'
import type { DiagramEdge, DiagramNode } from '../schema'
import type { LayoutDirection, LayoutEdgeInput, LayoutNodeInput, LayoutRequest, LayoutResponse } from './layout.worker'

export type { LayoutDirection }

const DEFAULT_SIZE = { w: 220, h: 88 }
const GROUP_PADDING = 32
const GROUP_HEADER = 36

function nodeSize(node: DiagramNode): { w: number; h: number } {
  if (node.size) return { w: node.size.w, h: node.size.h }
  if (node.kind === 'start' || node.kind === 'end') return { w: 160, h: 64 }
  if (node.kind === 'note') return { w: 200, h: 96 }
  if (node.kind === 'decision') return { w: 240, h: 110 }
  if (node.kind === 'group') return { w: 360, h: 240 }
  return DEFAULT_SIZE
}

async function layoutFlat(
  nodes: LayoutNodeInput[],
  edges: LayoutEdgeInput[],
  direction: LayoutDirection,
): Promise<Array<{ id: string; x: number; y: number }>> {
  const elk = new ELK()
  const graph: ElkNode = {
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': direction,
      'elk.spacing.nodeNode': '48',
      'elk.layered.spacing.nodeNodeBetweenLayers': '72',
      'elk.edgeRouting': 'ORTHOGONAL',
    },
    children: nodes.map((n) => ({
      id: n.id,
      width: n.width,
      height: n.height,
    })),
    edges: edges.map((e) => ({
      id: e.id,
      sources: [e.source],
      targets: [e.target],
    })),
  }
  const layouted = await elk.layout(graph)
  return (
    layouted.children?.map((child) => ({
      id: child.id,
      x: child.x ?? 0,
      y: child.y ?? 0,
    })) ?? []
  )
}

let worker: Worker | null = null
let requestSeq = 0
const pending = new Map<
  string,
  { resolve: (value: LayoutResponse) => void; reject: (reason?: unknown) => void }
>()

function getWorker(): Worker | null {
  if (typeof Worker === 'undefined') return null
  if (worker) return worker
  try {
    worker = new Worker(new URL('./layout.worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (event: MessageEvent<LayoutResponse>) => {
      const result = event.data
      const entry = pending.get(result.id)
      if (!entry) return
      pending.delete(result.id)
      if (result.error) entry.reject(new Error(result.error))
      else entry.resolve(result)
    }
    worker.onerror = () => {
      for (const [, entry] of pending) entry.reject(new Error('Layout worker failed'))
      pending.clear()
      worker = null
    }
    return worker
  } catch {
    return null
  }
}

async function layoutViaWorkerOrMain(
  nodes: LayoutNodeInput[],
  edges: LayoutEdgeInput[],
  direction: LayoutDirection,
): Promise<Array<{ id: string; x: number; y: number }>> {
  const w = getWorker()
  if (!w) return layoutFlat(nodes, edges, direction)

  requestSeq += 1
  const id = `layout_${requestSeq}`
  const req: LayoutRequest = { id, direction, nodes, edges }

  try {
    const result = await new Promise<LayoutResponse>((resolve, reject) => {
      pending.set(id, { resolve, reject })
      w.postMessage(req)
      window.setTimeout(() => {
        if (pending.has(id)) {
          pending.delete(id)
          reject(new Error('Layout timed out'))
        }
      }, 8000)
    })
    return result.positions
  } catch {
    return layoutFlat(nodes, edges, direction)
  }
}

/**
 * Auto-layout diagram nodes. Top-level nodes (including groups) are laid out
 * first; children of each group are laid out inside the group and the group
 * size is updated to fit.
 */
export async function autoLayoutDiagram(
  nodes: DiagramNode[],
  edges: DiagramEdge[],
  direction: LayoutDirection = 'DOWN',
): Promise<DiagramNode[]> {
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const next = nodes.map((n) => ({ ...n, position: { ...n.position } }))

  const topLevel = next.filter((n) => !n.parentId)
  const topIds = new Set(topLevel.map((n) => n.id))
  const topEdges = edges.filter((e) => topIds.has(e.source) && topIds.has(e.target))

  const topPositions = await layoutViaWorkerOrMain(
    topLevel.map((n) => {
      const size = nodeSize(n)
      return { id: n.id, width: size.w, height: size.h }
    }),
    topEdges.map((e) => ({ id: e.id, source: e.source, target: e.target })),
    direction,
  )

  for (const pos of topPositions) {
    const node = next.find((n) => n.id === pos.id)
    if (node) node.position = { x: pos.x, y: pos.y }
  }

  const groups = next.filter((n) => n.kind === 'group')
  for (const group of groups) {
    const children = next.filter((n) => n.parentId === group.id)
    if (children.length === 0) continue

    const childIds = new Set(children.map((n) => n.id))
    const childEdges = edges.filter((e) => childIds.has(e.source) && childIds.has(e.target))
    const childPositions = await layoutViaWorkerOrMain(
      children.map((n) => {
        const size = nodeSize(n)
        return { id: n.id, width: size.w, height: size.h }
      }),
      childEdges.map((e) => ({ id: e.id, source: e.source, target: e.target })),
      direction,
    )

    let maxX = 0
    let maxY = 0
    for (const pos of childPositions) {
      const child = next.find((n) => n.id === pos.id)
      if (!child) continue
      const size = nodeSize(child)
      child.position = { x: pos.x + GROUP_PADDING, y: pos.y + GROUP_HEADER }
      maxX = Math.max(maxX, child.position.x + size.w)
      maxY = Math.max(maxY, child.position.y + size.h)
    }

    group.size = {
      w: Math.max(group.size?.w ?? 360, maxX + GROUP_PADDING),
      h: Math.max(group.size?.h ?? 240, maxY + GROUP_PADDING),
    }
  }

  // Keep parent references valid
  for (const node of next) {
    if (node.parentId && !byId.has(node.parentId)) {
      delete node.parentId
    }
  }

  return next
}
