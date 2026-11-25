import type { NodeProps } from '@xyflow/react'
import { memo } from 'react'
import type { FlowNode } from '../flowTypes'
import { FlowNodeShell } from './FlowNodeShell'

function EndNodeInner(props: NodeProps<FlowNode>) {
  return <FlowNodeShell {...props} showSource={false} compact />
}

export const EndNode = memo(EndNodeInner)
