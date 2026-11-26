import { describe, expect, it } from 'vitest'
import {
  CONFLICT_MARGIN,
  detectConflicts,
  edgesShareBus,
  estimateSourcePoint,
  layoutDiagram,
  pathPointsForEdge,
  resolveConflicts,
  segmentHitsRect,
  validateGraph,
  defaultNodeSize,
} from './index.ts'
import { buildMerchantOnboardingFixture } from './merchantOnboardingFixture.ts'
import type { LayoutEdgeLike, LayoutNodeLike } from './types.ts'

function contentBox(node: LayoutNodeLike) {
  const size = defaultNodeSize(node)
  return { x: node.position.x, y: node.position.y, w: size.w, h: size.h }
}

function assertNoNodeOverlaps(nodes: LayoutNodeLike[], margin = CONFLICT_MARGIN) {
  const boxes = nodes
    .filter((n) => !n.parentId && n.kind !== 'sticky')
    .map((n) => {
      const b = contentBox(n)
      return {
        id: n.id,
        x: b.x - margin,
        y: b.y - margin,
        w: b.w + margin * 2,
        h: b.h + margin * 2,
      }
    })
  for (let i = 0; i < boxes.length; i += 1) {
    for (let j = i + 1; j < boxes.length; j += 1) {
      const a = boxes[i]
      const b = boxes[j]
      const hit =
        a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
      expect(hit, `${a.id} overlaps ${b.id}`).toBe(false)
    }
  }
}

function assertNoEdgeThroughNodes(
  nodes: LayoutNodeLike[],
  edges: LayoutEdgeLike[],
) {
  for (const edge of edges) {
    const points = pathPointsForEdge(edge, nodes, (n) => defaultNodeSize(n), 'DOWN')
    for (let i = 1; i < points.length; i += 1) {
      const seg = {
        x1: points[i - 1].x,
        y1: points[i - 1].y,
        x2: points[i].x,
        y2: points[i].y,
      }
      for (const node of nodes) {
        if (node.id === edge.source || node.id === edge.target) continue
        if (node.kind === 'sticky' || node.parentId) continue
        const box = contentBox(node)
        expect(
          segmentHitsRect(seg, box, 1),
          `edge ${edge.id} through node ${node.id}`,
        ).toBe(false)
      }
    }
  }
}

function assertNoSharedBuses(nodes: LayoutNodeLike[], edges: LayoutEdgeLike[]) {
  for (let i = 0; i < edges.length; i += 1) {
    for (let j = i + 1; j < edges.length; j += 1) {
      const a = edges[i]
      const b = edges[j]
      if (a.source === b.source && (a.sourceHandle ?? '') === (b.sourceHandle ?? '')) {
        continue
      }
      const pa = pathPointsForEdge(a, nodes, (n) => defaultNodeSize(n), 'DOWN')
      const pb = pathPointsForEdge(b, nodes, (n) => defaultNodeSize(n), 'DOWN')
      expect(
        edgesShareBus(pa, pb, 4),
        `edges ${a.id} and ${b.id} share a bus`,
      ).toBe(false)
    }
  }
}

function assertBranchStartsNearChips(
  nodes: LayoutNodeLike[],
  edges: LayoutEdgeLike[],
) {
  const byId = new Map(nodes.map((n) => [n.id, n]))
  for (const edge of edges) {
    const src = byId.get(edge.source)
    if (!src) continue
    if (src.kind !== 'decision' && src.kind !== 'switch') continue
    if (!edge.sourceHandle) continue
    const expected = estimateSourcePoint(
      src,
      defaultNodeSize(src),
      edge.sourceHandle,
      'DOWN',
    )
    const points = pathPointsForEdge(edge, nodes, (n) => defaultNodeSize(n), 'DOWN')
    const start = points[0]
    const dist = Math.hypot(start.x - expected.x, start.y - expected.y)
    expect(dist, `edge ${edge.id} start vs chip ${edge.sourceHandle}`).toBeLessThanOrEqual(3)
  }
}

describe('merchant onboarding stress layout', () => {
  it('builds a 25+ node fixture', () => {
    const { nodes, edges } = buildMerchantOnboardingFixture()
    expect(nodes.length).toBeGreaterThanOrEqual(25)
    expect(edges.length).toBeGreaterThan(20)
  })

  it('layouts without overlaps, through-node hits, or shared buses', async () => {
    const { nodes, edges } = buildMerchantOnboardingFixture()
    const result = await layoutDiagram(nodes, edges, { direction: 'DOWN' })
    expect(result.nodes.length).toBe(nodes.length)
    assertNoNodeOverlaps(result.nodes)
    assertNoEdgeThroughNodes(result.nodes, result.edges)
    assertNoSharedBuses(result.nodes, result.edges)
    assertBranchStartsNearChips(result.nodes, result.edges)

    const report = detectConflicts(result.nodes, result.edges)
    expect(report.nodeOverlaps).toHaveLength(0)
    expect(report.edgesThroughNodes).toHaveLength(0)

    // Long end labels keep full text width budget.
    const declined = result.nodes.find((n) => n.id === 'n19')!
    expect(defaultNodeSize(declined).w).toBeGreaterThanOrEqual(176)
    expect(declined.label).toBe('Account Declined')
  })

  it('legacy bus routing can be requested for before screenshots', async () => {
    const { nodes, edges } = buildMerchantOnboardingFixture()
    const legacy = await layoutDiagram(nodes, edges, {
      direction: 'DOWN',
      legacyEdgeRouting: true,
      skipConflictResolve: true,
    })
    expect(legacy.nodes.length).toBe(nodes.length)
  })

  it('resolveConflicts clears forced overlaps', () => {
    const nodes: LayoutNodeLike[] = [
      {
        id: 'a',
        kind: 'step',
        label: 'A',
        position: { x: 0, y: 0 },
      },
      {
        id: 'b',
        kind: 'step',
        label: 'B',
        position: { x: 10, y: 10 },
      },
    ]
    const edges: LayoutEdgeLike[] = [{ id: 'e1', source: 'a', target: 'b' }]
    const before = detectConflicts(nodes, edges)
    expect(before.nodeOverlaps.length).toBeGreaterThan(0)
    const fixed = resolveConflicts(nodes, edges, { direction: 'DOWN' })
    const after = detectConflicts(fixed.nodes, fixed.edges)
    expect(after.nodeOverlaps).toHaveLength(0)
  })
})

describe('validateGraph', () => {
  it('requires a parallelJoin for each parallelSplit', () => {
    const nodes: LayoutNodeLike[] = [
      { id: 's', kind: 'parallelSplit', label: 'Split', position: { x: 0, y: 0 } },
      { id: 'a', kind: 'step', label: 'A', position: { x: 0, y: 0 } },
    ]
    const edges: LayoutEdgeLike[] = [{ id: 'e1', source: 's', target: 'a' }]
    const problems = validateGraph(nodes, edges)
    expect(problems.some((p) => p.code === 'parallel_missing_join')).toBe(true)
  })

  it('rejects two edges on the same decision branch', () => {
    const nodes: LayoutNodeLike[] = [
      {
        id: 'd',
        kind: 'decision',
        label: 'D',
        position: { x: 0, y: 0 },
        data: {
          branches: [
            { id: 'yes', label: 'Yes' },
            { id: 'no', label: 'No' },
          ],
        },
      },
      { id: 'a', kind: 'step', label: 'A', position: { x: 0, y: 0 } },
      { id: 'b', kind: 'step', label: 'B', position: { x: 0, y: 0 } },
    ]
    const edges: LayoutEdgeLike[] = [
      { id: 'e1', source: 'd', target: 'a', sourceHandle: 'yes' },
      { id: 'e2', source: 'd', target: 'b', sourceHandle: 'yes' },
    ]
    const problems = validateGraph(nodes, edges)
    expect(problems.some((p) => p.code === 'duplicate_branch_edge')).toBe(true)
  })

  it('rejects unknown branch handles', () => {
    const nodes: LayoutNodeLike[] = [
      {
        id: 'd',
        kind: 'switch',
        label: 'Admin',
        position: { x: 0, y: 0 },
        data: {
          branches: [
            { id: 'approve', label: 'Approve' },
            { id: 'decline', label: 'Decline' },
          ],
        },
      },
      { id: 'a', kind: 'step', label: 'A', position: { x: 0, y: 0 } },
    ]
    const edges: LayoutEdgeLike[] = [
      { id: 'e1', source: 'd', target: 'a', sourceHandle: 'suspend' },
    ]
    const problems = validateGraph(nodes, edges)
    expect(problems.some((p) => p.code === 'unknown_branch_handle')).toBe(true)
  })

  it('rejects adjacent duplicate kind+label in the same edit', () => {
    const nodes: LayoutNodeLike[] = [
      { id: 'a', kind: 'parallelJoin', label: 'Parallel join', position: { x: 0, y: 0 } },
      { id: 'b', kind: 'parallelJoin', label: 'Parallel join', position: { x: 0, y: 0 } },
    ]
    const edges: LayoutEdgeLike[] = [{ id: 'e1', source: 'a', target: 'b' }]
    const problems = validateGraph(nodes, edges, { editedNodeIds: ['a', 'b'] })
    expect(problems.some((p) => p.code === 'duplicate_adjacent_node')).toBe(true)
  })

  it('accepts the merchant fixture graph', () => {
    const { nodes, edges } = buildMerchantOnboardingFixture()
    const problems = validateGraph(nodes, edges, {
      editedNodeIds: nodes.map((n) => n.id),
    })
    expect(problems).toEqual([])
  })
})
