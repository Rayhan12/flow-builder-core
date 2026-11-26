/**
 * Browser-facing layout: delegates to shared pure ELK (worker for large graphs).
 */
import {
  layoutDiagram as layoutDiagramShared,
  placeNodesIncremental as placeIncrementalShared,
  type LayoutDirection,
  type LayoutOptions,
} from '../../shared/layout/index.ts'
import type { DiagramEdge, DiagramNode } from '../schema'

export type { LayoutDirection }

export type LayoutResult = {
  nodes: DiagramNode[]
  edges: DiagramEdge[]
}

const WORKER_THRESHOLD = 80

let worker: Worker | null = null
let requestSeq = 0
const pending = new Map<
  string,
  {
    resolve: (value: LayoutResult) => void
    reject: (reason?: unknown) => void
  }
>()

type WorkerRequest = {
  id: string
  nodes: DiagramNode[]
  edges: DiagramEdge[]
  options: LayoutOptions
}

type WorkerResponse = {
  id: string
  nodes?: DiagramNode[]
  edges?: DiagramEdge[]
  error?: string
}

function getWorker(): Worker | null {
  if (typeof Worker === 'undefined') return null
  if (typeof window !== 'undefined') {
    try {
      if (window.__FB_DISABLE_LAYOUT_WORKER__) return null
    } catch {
      // ignore
    }
  }
  if (worker) return worker
  try {
    worker = new Worker(new URL('./layout.worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const result = event.data
      const entry = pending.get(result.id)
      if (!entry) return
      pending.delete(result.id)
      if (result.error || !result.nodes || !result.edges) {
        entry.reject(new Error(result.error ?? 'Layout failed'))
      } else {
        entry.resolve({ nodes: result.nodes, edges: result.edges })
      }
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

async function layoutOnMain(
  nodes: DiagramNode[],
  edges: DiagramEdge[],
  options: LayoutOptions,
): Promise<LayoutResult> {
  return layoutDiagramShared(nodes, edges, options)
}

async function layoutViaWorkerOrMain(
  nodes: DiagramNode[],
  edges: DiagramEdge[],
  options: LayoutOptions,
): Promise<LayoutResult> {
  const useWorker = nodes.length >= WORKER_THRESHOLD
  const w = useWorker ? getWorker() : null
  if (!w) return layoutOnMain(nodes, edges, options)

  requestSeq += 1
  const id = `layout_${requestSeq}`
  const req: WorkerRequest = { id, nodes, edges, options }

  try {
    return await new Promise<LayoutResult>((resolve, reject) => {
      pending.set(id, { resolve, reject })
      w.postMessage(req)
      window.setTimeout(() => {
        if (pending.has(id)) {
          pending.delete(id)
          reject(new Error('Layout timed out'))
        }
      }, 12_000)
    })
  } catch {
    return layoutOnMain(nodes, edges, options)
  }
}

/** Test / e2e hook: skip auto-layout when set. */
export function isAutoLayoutDisabled(): boolean {
  if (typeof window === 'undefined') return false
  try {
    if (window.__FB_DISABLE_AUTO_LAYOUT__) return true
    if (new URLSearchParams(window.location.search).get('disableAutoLayout') === '1') {
      return true
    }
  } catch {
    // ignore
  }
  return false
}

/**
 * Auto-layout diagram nodes and orthogonal edge waypoints.
 * Top-level + groups; stickies/annotations go to a side column when unconnected.
 */
export async function layoutDiagram(
  nodes: DiagramNode[],
  edges: DiagramEdge[],
  options: LayoutOptions | LayoutDirection = {},
): Promise<LayoutResult> {
  const opts: LayoutOptions =
    typeof options === 'string' ? { direction: options } : options
  return layoutViaWorkerOrMain(nodes, edges, opts)
}

/**
 * Backward-compatible helper: returns only nodes (edges' waypoints discarded).
 */
export async function autoLayoutDiagram(
  nodes: DiagramNode[],
  edges: DiagramEdge[],
  direction: LayoutDirection = 'DOWN',
): Promise<DiagramNode[]> {
  const result = await layoutDiagram(nodes, edges, { direction })
  return result.nodes
}

/**
 * Place newly added nodes near anchors without relaying out the whole board.
 */
export function placeNodesIncremental(
  nodes: DiagramNode[],
  edges: DiagramEdge[],
  newNodeIds: string[],
  direction: LayoutDirection = 'DOWN',
): LayoutResult {
  return placeIncrementalShared(nodes, edges, newNodeIds, { direction })
}

declare global {
  interface Window {
    __FB_DISABLE_AUTO_LAYOUT__?: boolean
    __FB_DISABLE_LAYOUT_WORKER__?: boolean
    __FLOW_BUILDER_LAYOUT__?: {
      layoutDiagram: typeof layoutDiagram
      placeNodesIncremental: typeof placeNodesIncremental
      autoLayoutDiagram: typeof autoLayoutDiagram
    }
  }
}

if (typeof window !== 'undefined') {
  window.__FLOW_BUILDER_LAYOUT__ = {
    layoutDiagram,
    placeNodesIncremental,
    autoLayoutDiagram,
  }
}
