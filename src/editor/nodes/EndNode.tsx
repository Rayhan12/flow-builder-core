import type { NodeProps } from '@xyflow/react'
import type { FlowNode } from '../flowTypes'
import { FlowNodeShell } from './FlowNodeShell'

export function EndNode(props: NodeProps<FlowNode>) {
  return <FlowNodeShell {...props} showSource={false} compact />
}
