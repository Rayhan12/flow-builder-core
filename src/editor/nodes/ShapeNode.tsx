import type { NodeProps } from '@xyflow/react'
import { memo } from 'react'
import type { FlowNode } from '../flowTypes'
import { FlowNodeShell } from './FlowNodeShell'

function ShapeNodeInner(props: NodeProps<FlowNode>) {
  const node = props.data.diagramNode
  const shape = node.kind === 'shape' ? node.data.shape : 'rect'
  return (
    <FlowNodeShell {...props} compact>
      <p className="flow-node-desc">Shape: {shape}</p>
    </FlowNodeShell>
  )
}

export const ShapeNode = memo(ShapeNodeInner)
