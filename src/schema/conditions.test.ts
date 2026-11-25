import { describe, expect, it } from 'vitest'
import {
  emptyRuleMatch,
  ensureRuleMatch,
  matchFromLegacyCondition,
  rulePreviewSentence,
} from './conditions'

describe('rule conditions', () => {
  it('builds a readable sentence preview', () => {
    const match = {
      combinator: 'and' as const,
      groups: [
        {
          combinator: 'and' as const,
          conditions: [
            { field: 'credit score', operator: 'gt' as const, value: '650' },
            { field: 'country', operator: 'eq' as const, value: 'SA' },
          ],
        },
      ],
    }
    expect(rulePreviewSentence(match, 'Approve')).toBe(
      'If credit score is greater than 650 AND country is SA then Approve',
    )
  })

  it('migrates legacy free-text conditions', () => {
    const match = matchFromLegacyCondition('score > 10')
    expect(match.groups[0].conditions[0].field).toBe('score > 10')
    expect(ensureRuleMatch({ condition: 'x' }).groups).toHaveLength(1)
    expect(ensureRuleMatch({ match: emptyRuleMatch() }).groups).toHaveLength(1)
  })
})
