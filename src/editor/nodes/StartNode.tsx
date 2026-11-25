import type { NodeProps } from '@xyflow/react'
import { memo } from 'react'
import type { FlowNode } from '../flowTypes'
import { FlowNodeShell } from './FlowNodeShell'

function StartNodeInner(props: NodeProps<FlowNode>) {
  return <FlowNodeShell {...props} showTarget={false} compact />
}

export const StartNode = memo(StartNodeInner)
