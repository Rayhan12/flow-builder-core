import { useUpdateNodeInternals, type NodeProps } from '@xyflow/react'
import { memo, useEffect } from 'react'
import { useEditorStore } from '../../store/editorStore'
import { decisionSizeForBranches } from '../decisionLayout'
import type { FlowNode } from '../flowTypes'
import { FlowNodeShell } from './FlowNodeShell'

function DecisionNodeInner(props: NodeProps<FlowNode>) {
  const updateNodeInternals = useUpdateNodeInternals()
  const resizeNode = useEditorStore((s) => s.resizeNode)
  const node = props.data.diagramNode
  const isBranching = node.kind === 'decision' || node.kind === 'switch'
  const branches = isBranching ? node.data.branches : []
  const branchHandleSide =
    isBranching && node.data.branchHandleSide === 'right' ? 'right' : 'bottom'

  useEffect(() => {
    if (!isBranching) return
    const next = decisionSizeForBranches(branches.length)
    const cur = node.size
    if (!cur || cur.w !== next.w || cur.h !== next.h) {
      resizeNode(node.id, next, false)
    }
    // jsdom lacks DOMMatrixReadOnly used by React Flow internals.
    if (typeof DOMMatrixReadOnly === 'undefined') return
    try {
      updateNodeInternals(node.id)
    } catch {
      // ignore measurement errors in non-browser environments
    }
  }, [
    node.id,
    isBranching,
    branches.length,
    branchHandleSide,
    node.size,
    resizeNode,
    updateNodeInternals,
  ])

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
