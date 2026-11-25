import type { Diagram, DiagramEdge, DiagramNode, NodeKind } from '../../schema'
import { CURRENT_SCHEMA_VERSION } from '../../schema'
import { KIND_META, createNodeOfKind } from '../kinds'

const KINDS_CYCLE: NodeKind[] = ['step', 'decision', 'integration', 'rule', 'mapping']

/**
 * Builds a deterministic diagram with `nodeCount` nodes arranged in a grid,
 * plus a start and end node. Used for scale and performance checks (M6).
 */
export function createLargeDiagram(
  id = 'd_large_perf',
  nodeCount = 1000,
): Diagram {
  const safeCount = Math.max(2, Math.min(nodeCount, 2000))
  const nodes: DiagramNode[] = []
  const edges: DiagramEdge[] = []

  nodes.push(
    createNodeOfKind('start', { x: 0, y: 0 }, { id: 'n_start', label: 'Start' }),
  )

  const cols = 25
  const bodyCount = safeCount - 2

  for (let i = 0; i < bodyCount; i += 1) {
    const kind = KINDS_CYCLE[i % KINDS_CYCLE.length]
    const col = i % cols
    const row = Math.floor(i / cols)
    const nodeId = `n_${i}`
    const meta = KIND_META[kind]
    nodes.push(
      createNodeOfKind(kind, { x: col * 260, y: 120 + row * 140 }, {
        id: nodeId,
        label: `Node ${i + 1}`,
        color: meta.defaultColor,
        icon: meta.defaultIcon,
      }),
    )

    const prevId = i === 0 ? 'n_start' : `n_${i - 1}`
    edges.push({
      id: `e_${i}`,
      source: prevId,
      target: nodeId,
      label: i % 7 === 0 ? 'next' : undefined,
    })
  }

  const endRow = Math.floor(Math.max(bodyCount - 1, 0) / cols)
  const endCol = Math.max(bodyCount - 1, 0) % cols
  nodes.push(
    createNodeOfKind(
      'end',
      { x: endCol * 260, y: 120 + endRow * 140 + 140 },
      { id: 'n_end', label: 'End' },
    ),
  )

  if (bodyCount > 0) {
    edges.push({
      id: 'e_end',
      source: `n_${bodyCount - 1}`,
      target: 'n_end',
    })
  } else {
    edges.push({
      id: 'e_end',
      source: 'n_start',
      target: 'n_end',
    })
  }

  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    id,
    title: `Large flow (${safeCount} nodes)`,
    description: 'Generated fixture for scale and performance checks',
    nodes,
    edges,
    groups: [],
    viewport: { x: 0, y: 0, zoom: 0.35 },
    theme: { palette: 'default' },
  }
}

/** Approximate UTF-8 byte size of a diagram JSON payload (doc body). */
export function estimateDiagramBytes(diagram: {
  schemaVersion: number
  title: string
  description?: string
  nodes: unknown[]
  edges: unknown[]
  groups: unknown[]
  viewport: unknown
  theme: unknown
}): number {
  const payload = {
    schemaVersion: diagram.schemaVersion,
    title: diagram.title,
    description: diagram.description,
    nodes: diagram.nodes,
    edges: diagram.edges,
    groups: diagram.groups,
    viewport: diagram.viewport,
    theme: diagram.theme,
  }
  return new TextEncoder().encode(JSON.stringify(payload)).length
}

/** Warn when a diagram approaches the Firestore 1 MiB doc limit. */
export const DIAGRAM_SIZE_WARN_BYTES = 700 * 1024
