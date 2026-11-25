import { z } from 'zod'

export const CONDITION_OPERATORS = [
  'eq',
  'neq',
  'gt',
  'lt',
  'between',
  'contains',
  'empty',
  'in',
] as const

export type ConditionOperator = (typeof CONDITION_OPERATORS)[number]

export const OPERATOR_LABELS: Record<ConditionOperator, string> = {
  eq: 'equals',
  neq: 'does not equal',
  gt: 'is greater than',
  lt: 'is less than',
  between: 'is between',
  contains: 'contains',
  empty: 'is empty',
  in: 'is in',
}

export const ConditionSchema = z.object({
  field: z.string().max(200).default(''),
  operator: z.enum(CONDITION_OPERATORS).default('eq'),
  value: z.string().max(500).optional(),
  value2: z.string().max(500).optional(),
})

export type Condition = z.infer<typeof ConditionSchema>

export const ConditionGroupSchema = z.object({
  combinator: z.enum(['and', 'or']).default('and'),
  conditions: z.array(ConditionSchema).min(1).max(20),
})

export type ConditionGroup = z.infer<typeof ConditionGroupSchema>

/** One rule: groups combined by groupCombinator; each group has its own combinator. */
export const RuleMatchSchema = z.object({
  combinator: z.enum(['and', 'or']).default('and'),
  groups: z.array(ConditionGroupSchema).min(1).max(10),
})

export type RuleMatch = z.infer<typeof RuleMatchSchema>

export function emptyCondition(): Condition {
  return { field: '', operator: 'eq', value: '' }
}

export function emptyConditionGroup(combinator: 'and' | 'or' = 'and'): ConditionGroup {
  return { combinator, conditions: [emptyCondition()] }
}

export function emptyRuleMatch(): RuleMatch {
  return { combinator: 'and', groups: [emptyConditionGroup('and')] }
}

export function conditionToSentence(c: Condition): string {
  const field = c.field.trim() || 'field'
  const op = OPERATOR_LABELS[c.operator]
  if (c.operator === 'empty') return `${field} ${op}`
  if (c.operator === 'eq') {
    return `${field} is ${c.value?.trim() || '?'}`
  }
  if (c.operator === 'between') {
    return `${field} ${op} ${c.value?.trim() || '?'} and ${c.value2?.trim() || '?'}`
  }
  if (c.operator === 'in') {
    return `${field} ${op} ${c.value?.trim() || '(list)'}`
  }
  return `${field} ${op} ${c.value?.trim() || '?'}`
}

export function groupToSentence(group: ConditionGroup, wrap = false): string {
  const parts = group.conditions.map(conditionToSentence)
  const joiner = group.combinator === 'or' ? ' OR ' : ' AND '
  const joined = parts.join(joiner)
  if (parts.length === 1) return joined
  return wrap ? `(${joined})` : joined
}

export function matchToSentence(match: RuleMatch): string {
  const wrapGroups = match.groups.length > 1
  const parts = match.groups.map((g) => groupToSentence(g, wrapGroups))
  const joiner = match.combinator === 'or' ? ' OR ' : ' AND '
  return parts.join(joiner)
}

export function rulePreviewSentence(match: RuleMatch, outcome: string): string {
  const when = matchToSentence(match)
  const result = outcome.trim() || '…'
  return `If ${when} then ${result}`
}

/** Turn a legacy free-text condition into a structured match. */
export function matchFromLegacyCondition(condition: string | undefined): RuleMatch {
  const text = (condition ?? '').trim()
  if (!text) return emptyRuleMatch()
  return {
    combinator: 'and',
    groups: [
      {
        combinator: 'and',
        conditions: [{ field: text, operator: 'eq', value: '' }],
      },
    ],
  }
}

export function ensureRuleMatch(rule: {
  match?: RuleMatch
  condition?: string
}): RuleMatch {
  if (rule.match && rule.match.groups.length > 0) return rule.match
  return matchFromLegacyCondition(rule.condition)
}
