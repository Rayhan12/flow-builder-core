import { useUpdateNodeInternals, type NodeProps } from '@xyflow/react'
import { memo, useEffect, useMemo } from 'react'
import { useEditorStore } from '../../store/editorStore'
import { decisionSizeForBranches } from '../decisionLayout'
import type { FlowNode } from '../flowTypes'
import { FlowNodeShell } from './FlowNodeShell'

function DecisionNodeInner(props: NodeProps<FlowNode>) {
  const updateNodeInternals = useUpdateNodeInternals()
  const resizeNode = useEditorStore((s) => s.resizeNode)
  const updateEdge = useEditorStore((s) => s.updateEdge)
  const diagram = useEditorStore((s) => s.diagram)
  const node = props.data.diagramNode
  const isBranching = node.kind === 'decision' || node.kind === 'switch'
  const branches = isBranching ? node.data.branches : []
  const branchHandleSide =
    isBranching && node.data.branchHandleSide === 'right' ? 'right' : 'bottom'
  const branchKey = branches.map((b) => `${b.id}:${b.label}`).join('|')
  const labels = useMemo(
    () => branches.map((b) => b.label),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- branchKey captures label/id changes
    [branchKey],
  )
  const branchIds = useMemo(
    () => new Set(branches.map((b) => b.id)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [branchKey],
  )
  const labelById = useMemo(
    () => new Map(branches.map((b) => [b.id, b.label] as const)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [branchKey],
  )

  useEffect(() => {
    if (!isBranching) return
    const next = decisionSizeForBranches(branches.length, labels)
    const cur = node.size
    if (!cur || cur.w !== next.w || cur.h !== next.h) {
      resizeNode(node.id, next, false)
    }
    if (typeof DOMMatrixReadOnly === 'undefined') return
    const refresh = () => {
      try {
        updateNodeInternals(node.id)
      } catch {
        // ignore measurement errors in non-browser environments
      }
    }
    refresh()
    const t = window.setTimeout(refresh, 0)
    const t2 = window.setTimeout(refresh, 50)
    return () => {
      window.clearTimeout(t)
      window.clearTimeout(t2)
    }
  }, [
    node.id,
    isBranching,
    branches.length,
    labels,
    branchHandleSide,
    node.size,
    resizeNode,
    updateNodeInternals,
  ])

  // Repair edges whose sourceHandle no longer matches a branch.
  useEffect(() => {
    if (!isBranching || !diagram) return
    const edges = diagram.edges.filter((e) => e.source === node.id)
    for (const edge of edges) {
      const handle = edge.sourceHandle
      if (!handle || handle === 'top' || handle === 'right' || handle === 'bottom' || handle === 'left') {
        continue
      }
      if (branchIds.has(handle)) continue
      const byLabel = branches.find(
        (b) => b.label === edge.label || labelById.get(b.id) === edge.label,
      )
      if (byLabel) {
        updateEdge(edge.id, { sourceHandle: byLabel.id })
        continue
      }
      // Visible warning via console + data attribute on next render through edge label.
      console.warn(
        `[flow-builder] Edge ${edge.id} sourceHandle "${handle}" does not match any branch on ${node.id}. Repair by reconnecting the branch.`,
      )
    }
  }, [isBranching, diagram, node.id, branchIds, branches, labelById, updateEdge])

  return (
    <FlowNodeShell
      {...props}
      showSource={false}
      showTarget={false}
      sourceHandles={branches}
      branchHandleSide={branchHandleSide}
    />
  )
}

export const DecisionNode = memo(DecisionNodeInner)
