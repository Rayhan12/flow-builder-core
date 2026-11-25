import { describe, expect, it } from 'vitest'
import { parseDiagram } from '../../schema'
import { toFlowEdge, toFlowNode } from '../flowTypes'
import {
  DIAGRAM_SIZE_WARN_BYTES,
  createLargeDiagram,
  estimateDiagramBytes,
} from './largeDiagram'

describe('large diagram fixture', () => {
  it('builds a valid 1000 node diagram under the size warning', () => {
    const diagram = createLargeDiagram('d_perf', 1000)
    expect(diagram.nodes).toHaveLength(1000)
    expect(diagram.edges.length).toBeGreaterThan(900)

    const parsed = parseDiagram(diagram)
    expect(parsed.nodes).toHaveLength(1000)

    const bytes = estimateDiagramBytes(diagram)
    expect(bytes).toBeGreaterThan(50_000)
    expect(bytes).toBeLessThan(DIAGRAM_SIZE_WARN_BYTES)
  })

  it('converts 1000 nodes to React Flow shapes quickly', () => {
    const diagram = createLargeDiagram('d_perf_flow', 1000)
    const start = performance.now()
    const flowNodes = diagram.nodes.map((n) => toFlowNode(n, false))
    const flowEdges = diagram.edges.map((e) => toFlowEdge(e, false))
    const elapsed = performance.now() - start

    expect(flowNodes).toHaveLength(1000)
    expect(flowEdges.length).toBe(diagram.edges.length)
    // Conversion should stay well under half a second on CI hardware.
    expect(elapsed).toBeLessThan(500)
  })

  it('loads into the editor store without hanging', async () => {
    const { useEditorStore } = await import('../../store/editorStore')
    const diagram = createLargeDiagram('d_perf_store', 1000)
    const start = performance.now()
    useEditorStore.getState().load(diagram, 0)
    const loaded = useEditorStore.getState().diagram
    const elapsed = performance.now() - start

    expect(loaded?.nodes).toHaveLength(1000)
    expect(elapsed).toBeLessThan(500)
    useEditorStore.getState().reset()
  })
})
