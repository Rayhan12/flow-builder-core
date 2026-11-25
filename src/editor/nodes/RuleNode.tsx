import type { NodeProps } from '@xyflow/react'
import { memo } from 'react'
import { ensureRuleMatch, rulePreviewSentence } from '../../schema'
import type { FlowNode } from '../flowTypes'
import { FlowNodeShell } from './FlowNodeShell'

function RuleNodeInner(props: NodeProps<FlowNode>) {
  const node = props.data.diagramNode
  const data = node.kind === 'rule' ? node.data : null
  const count = data?.rules.length ?? 0
  const first = data?.rules.find((r) => {
    const match = ensureRuleMatch(r)
    return match.groups.some((g) =>
      g.conditions.some((c) => c.field.trim() || (c.value ?? '').trim()),
    ) || r.outcome.trim()
  })
  const preview = first
    ? rulePreviewSentence(ensureRuleMatch(first), first.outcome)
    : null
  return (
    <FlowNodeShell {...props}>
      <div className="flow-node-kv">
        {preview ? (
          <span className="flow-node-kv-row">{preview}</span>
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
