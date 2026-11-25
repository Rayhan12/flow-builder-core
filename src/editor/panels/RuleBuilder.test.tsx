import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { emptyRuleMatch, type DiagramNode } from '../../schema'
import { RuleBuilder } from './RuleBuilder'

const baseNode: Extract<DiagramNode, { kind: 'rule' }> = {
  id: 'r1',
  kind: 'rule',
  label: 'Rules',
  position: { x: 0, y: 0 },
  data: {
    rules: [
      {
        id: 'rule_1',
        outcome: 'Approve',
        match: emptyRuleMatch(),
      },
    ],
  },
}

describe('RuleBuilder', () => {
  it('updates field operator value and shows a sentence preview', () => {
    const onChange = vi.fn()
    render(<RuleBuilder node={baseNode} onChange={onChange} />)

    fireEvent.change(screen.getByLabelText('Condition 1 field'), {
      target: { value: 'credit score' },
    })
    expect(onChange).toHaveBeenCalled()
    const last = onChange.mock.calls.at(-1)?.[0] as typeof baseNode
    expect(last.data.rules[0].match?.groups[0].conditions[0].field).toBe('credit score')

    fireEvent.change(screen.getByLabelText('Rule 1 outcome'), {
      target: { value: 'Approve' },
    })
    expect(screen.getByTestId('rule-preview').textContent).toMatch(/Approve/)
  })
})
