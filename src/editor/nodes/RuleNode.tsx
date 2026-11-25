import type { NodeProps } from '@xyflow/react'
import { memo } from 'react'
import type { FlowNode } from '../flowTypes'
import { FlowNodeShell } from './FlowNodeShell'

function RuleNodeInner(props: NodeProps<FlowNode>) {
  const node = props.data.diagramNode
  const data = node.kind === 'rule' ? node.data : null
  const count = data?.rules.length ?? 0
  return (
    <FlowNodeShell {...props}>
      <p className="flow-node-meta">
        {count} {count === 1 ? 'rule' : 'rules'}
        {data?.threshold != null ? ` · threshold ${data.threshold}` : ''}
      </p>
    </FlowNodeShell>
  )
}

export const RuleNode = memo(RuleNodeInner)
