import type { NodeProps } from '@xyflow/react'
import { memo } from 'react'
import type { FlowNode } from '../flowTypes'
import { FlowNodeShell } from './FlowNodeShell'

function RuleNodeInner(props: NodeProps<FlowNode>) {
  const node = props.data.diagramNode
  const data = node.kind === 'rule' ? node.data : null
  const count = data?.rules.length ?? 0
  const first = data?.rules.find((r) => r.condition.trim() || r.outcome.trim())
  return (
    <FlowNodeShell {...props}>
      <div className="flow-node-kv">
        {first ? (
          <span className="flow-node-kv-row">
            IF {first.condition || '...'} → {first.outcome || '...'}
          </span>
        ) : (
          <span className="flow-node-kv-row">
            {count} {count === 1 ? 'rule' : 'rules'}
            {data?.threshold != null ? ` · threshold ${data.threshold}` : ''}
          </span>
        )}
      </div>
    </FlowNodeShell>
  )
}

export const RuleNode = memo(RuleNodeInner)
