import type { NodeProps } from '@xyflow/react'
import { memo } from 'react'
import type { FlowNode } from '../flowTypes'
import { FlowNodeShell } from './FlowNodeShell'

function MappingNodeInner(props: NodeProps<FlowNode>) {
  const node = props.data.diagramNode
  const mappings = node.kind === 'mapping' ? node.data.mappings : []
  const first = mappings.find((m) => m.from.trim() || m.to.trim())
  return (
    <FlowNodeShell {...props}>
      <div className="flow-node-kv">
        {first ? (
          <span className="flow-node-kv-row">
            {first.from || '...'} → {first.to || '...'}
          </span>
        ) : (
          <span className="flow-node-kv-row">
            {mappings.length} {mappings.length === 1 ? 'mapping' : 'mappings'}
          </span>
        )}
      </div>
    </FlowNodeShell>
  )
}

export const MappingNode = memo(MappingNodeInner)
