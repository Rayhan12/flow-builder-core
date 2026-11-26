import type { NodeProps } from '@xyflow/react'
import { memo } from 'react'
import type { FlowNode } from '../flowTypes'
import { ExpandableText } from '../ui/ExpandableText'
import { FlowNodeShell } from './FlowNodeShell'

function NoteNodeInner(props: NodeProps<FlowNode>) {
  const node = props.data.diagramNode
  const text = node.kind === 'note' ? node.data.text : ''
  return (
    <FlowNodeShell {...props} noteStyle>
      {text ? (
        <ExpandableText text={text} className="flow-node-note-wrap" testId={`note-text-${node.id}`} />
      ) : null}
    </FlowNodeShell>
  )
}

export const NoteNode = memo(NoteNodeInner)
