import type { NodeProps } from '@xyflow/react'
import { memo } from 'react'
import type { FlowNode } from '../flowTypes'
import { FlowNodeShell } from './FlowNodeShell'

function IntegrationNodeInner(props: NodeProps<FlowNode>) {
  const node = props.data.diagramNode
  const data = node.kind === 'integration' ? node.data : null
  return (
    <FlowNodeShell {...props}>
      {data ? (
        <div className="flow-node-meta-row">
          <span className="flow-chip">{data.method ?? 'CALL'}</span>
          <span className="flow-node-meta">{data.service}</span>
        </div>
      ) : null}
    </FlowNodeShell>
  )
}

export const IntegrationNode = memo(IntegrationNodeInner)
