import type { NodeProps } from '@xyflow/react'
import type { FlowNode } from '../flowTypes'
import { FlowNodeShell } from './FlowNodeShell'

export function GroupNode(props: NodeProps<FlowNode>) {
  return <FlowNodeShell {...props} groupStyle showTarget={false} showSource={false} />
}
