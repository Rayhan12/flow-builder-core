import ELK, { type ElkNode } from 'elkjs/lib/elk.bundled.js'

export type LayoutDirection = 'DOWN' | 'RIGHT'

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
  direction: LayoutDirection
  nodes: LayoutNodeInput[]
  edges: LayoutEdgeInput[]
}

export type LayoutResponse = {
  id: string
  positions: Array<{ id: string; x: number; y: number }>
  error?: string
}

const elk = new ELK()

async function runLayout(req: LayoutRequest): Promise<LayoutResponse> {
  const graph: ElkNode = {
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': req.direction,
      'elk.spacing.nodeNode': '48',
      'elk.layered.spacing.nodeNodeBetweenLayers': '72',
      'elk.edgeRouting': 'ORTHOGONAL',
    },
    children: req.nodes.map((n) => ({
      id: n.id,
      width: n.width,
      height: n.height,
    })),
    edges: req.edges.map((e) => ({
      id: e.id,
      sources: [e.source],
      targets: [e.target],
    })),
  }

  const layouted = await elk.layout(graph)
  const positions =
    layouted.children?.map((child) => ({
      id: child.id,
      x: child.x ?? 0,
      y: child.y ?? 0,
    })) ?? []

  return { id: req.id, positions }
}

const ctx: Worker = self as unknown as Worker

ctx.onmessage = (event: MessageEvent<LayoutRequest>) => {
  const req = event.data
  void runLayout(req)
    .then((result: LayoutResponse) => {
      ctx.postMessage(result)
    })
    .catch((err: unknown) => {
      const message = err instanceof Error ? err.message : 'Layout failed'
      const failure: LayoutResponse = {
        id: req.id,
        positions: [],
        error: message,
      }
      ctx.postMessage(failure)
    })
}
