import type { NodeProps } from '@xyflow/react'
import { memo } from 'react'
import type { FlowNode } from '../flowTypes'
import { FlowNodeShell } from './FlowNodeShell'

function NoteNodeInner(props: NodeProps<FlowNode>) {
  const node = props.data.diagramNode
  const text = node.kind === 'note' ? node.data.text : ''
  return (
    <FlowNodeShell {...props} noteStyle showTarget={false} showSource={false}>
      {text ? <p className="flow-node-note-text">{text}</p> : null}
    </FlowNodeShell>
  )
}

export const NoteNode = memo(NoteNodeInner)
