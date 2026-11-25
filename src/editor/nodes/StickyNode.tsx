import type { NodeProps } from '@xyflow/react'
import { memo } from 'react'
import type { FlowNode } from '../flowTypes'
import { FlowNodeShell } from './FlowNodeShell'

function StickyNodeInner(props: NodeProps<FlowNode>) {
  const node = props.data.diagramNode
  const text = node.kind === 'sticky' ? node.data.text : ''
  return (
    <FlowNodeShell {...props} noteStyle showTarget={false} showSource={false}>
      {text ? <p className="flow-node-desc">{text}</p> : null}
    </FlowNodeShell>
  )
}

export const StickyNode = memo(StickyNodeInner)
