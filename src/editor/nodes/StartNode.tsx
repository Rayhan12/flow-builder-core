import type { NodeProps } from '@xyflow/react'
import type { FlowNode } from '../flowTypes'
import { FlowNodeShell } from './FlowNodeShell'

export function StartNode(props: NodeProps<FlowNode>) {
  return <FlowNodeShell {...props} showTarget={false} compact />
}
