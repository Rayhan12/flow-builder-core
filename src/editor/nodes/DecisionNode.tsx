import type { NodeProps } from '@xyflow/react'
import { memo } from 'react'
import type { FlowNode } from '../flowTypes'
import { FlowNodeShell } from './FlowNodeShell'

function DecisionNodeInner(props: NodeProps<FlowNode>) {
  const node = props.data.diagramNode
  const branches = node.kind === 'decision' ? node.data.branches : []
  return <FlowNodeShell {...props} showSource={false} sourceHandles={branches} />
}

export const DecisionNode = memo(DecisionNodeInner)
