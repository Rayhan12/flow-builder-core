import type { NodeProps } from '@xyflow/react'
import type { FlowNode } from '../flowTypes'
import { FlowNodeShell } from './FlowNodeShell'

export function StepNode(props: NodeProps<FlowNode>) {
  const data = props.data.diagramNode.kind === 'step' ? props.data.diagramNode.data : undefined
  return (
    <FlowNodeShell {...props}>
      {data?.owner ? <p className="flow-node-meta">Owner: {data.owner}</p> : null}
    </FlowNodeShell>
  )
}
