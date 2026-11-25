import type { NodeProps } from '@xyflow/react'
import { memo } from 'react'
import type { FlowNode } from '../flowTypes'
import { FlowNodeShell } from './FlowNodeShell'

function IntegrationNodeInner(props: NodeProps<FlowNode>) {
  const node = props.data.diagramNode
  const data = node.kind === 'integration' ? node.data : null
  const method = data?.method ?? 'CALL'
  const endpoint = data?.endpoint?.trim()
  const service = data?.service?.trim()
  return (
    <FlowNodeShell {...props}>
      {data ? (
        <div className="flow-node-kv">
          <span className="flow-node-kv-row">
            {method}
            {endpoint ? ` ${endpoint}` : service ? ` ${service}` : ''}
          </span>
        </div>
      ) : null}
    </FlowNodeShell>
  )
}

export const IntegrationNode = memo(IntegrationNodeInner)
