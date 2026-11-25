import type { NodeProps } from '@xyflow/react'
import type { FlowNode } from '../flowTypes'
import { FlowNodeShell } from './FlowNodeShell'

export function DecisionNode(props: NodeProps<FlowNode>) {
  const node = props.data.diagramNode
  const branches = node.kind === 'decision' ? node.data.branches : []
  return <FlowNodeShell {...props} showSource={false} sourceHandles={branches} />
}
