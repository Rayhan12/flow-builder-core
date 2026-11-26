/**
 * Layout Web Worker — runs shared ELK layout off the main thread for large flows.
 */
import {
  layoutDiagram,
  type LayoutDirection,
  type LayoutOptions,
} from '../../shared/layout/index.ts'
import type { DiagramEdge, DiagramNode } from '../schema'

export type { LayoutDirection }

export type LayoutNodeInput = {
  id: string
  width: number
  height: number
}

export type LayoutEdgeInput = {
  id: string
  source: string
  target: string
}

export type LayoutRequest = {
  id: string
  nodes: DiagramNode[]
  edges: DiagramEdge[]
  options: LayoutOptions
}

export type LayoutResponse = {
  id: string
  nodes?: DiagramNode[]
  edges?: DiagramEdge[]
  error?: string
}

const ctx: Worker = self as unknown as Worker

ctx.onmessage = (event: MessageEvent<LayoutRequest>) => {
  const req = event.data
  void layoutDiagram(req.nodes, req.edges, req.options ?? {})
    .then((result) => {
      const response: LayoutResponse = {
        id: req.id,
        nodes: result.nodes,
        edges: result.edges,
      }
      ctx.postMessage(response)
    })
    .catch((err: unknown) => {
      const message = err instanceof Error ? err.message : 'Layout failed'
      const failure: LayoutResponse = {
        id: req.id,
        error: message,
      }
      ctx.postMessage(failure)
    })
}
