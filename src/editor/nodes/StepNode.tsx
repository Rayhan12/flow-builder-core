import type { NodeProps } from '@xyflow/react'
import { memo } from 'react'
import type { FlowNode } from '../flowTypes'
import { FlowNodeShell } from './FlowNodeShell'

function StepNodeInner(props: NodeProps<FlowNode>) {
  const data = props.data.diagramNode.kind === 'step' ? props.data.diagramNode.data : undefined
  return (
    <FlowNodeShell {...props}>
      {data?.owner ? <p className="flow-node-meta">Owner: {data.owner}</p> : null}
    </FlowNodeShell>
  )
}

export const StepNode = memo(StepNodeInner)
