import type { NodeProps } from '@xyflow/react'
import { memo } from 'react'
import type { FlowNode } from '../flowTypes'
import { FlowNodeShell } from './FlowNodeShell'

function MappingNodeInner(props: NodeProps<FlowNode>) {
  const node = props.data.diagramNode
  const count = node.kind === 'mapping' ? node.data.mappings.length : 0
  return (
    <FlowNodeShell {...props}>
      <p className="flow-node-meta">
        {count} {count === 1 ? 'mapping' : 'mappings'}
      </p>
    </FlowNodeShell>
  )
}

export const MappingNode = memo(MappingNodeInner)
