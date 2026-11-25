import type { NodeProps } from '@xyflow/react'
import { memo } from 'react'
import type { FlowNode } from '../flowTypes'
import { FlowNodeShell } from './FlowNodeShell'

function StepNodeInner(props: NodeProps<FlowNode>) {
  const data = props.data.diagramNode.kind === 'step' ? props.data.diagramNode.data : undefined
  if (!data?.owner && !data?.notes) {
    return <FlowNodeShell {...props} />
  }
  return (
    <FlowNodeShell {...props}>
      <div className="flow-node-kv">
        {data.owner ? <span className="flow-node-kv-row">owner: {data.owner}</span> : null}
        {data.notes ? <span className="flow-node-kv-row">{data.notes}</span> : null}
      </div>
    </FlowNodeShell>
  )
}

export const StepNode = memo(StepNodeInner)
