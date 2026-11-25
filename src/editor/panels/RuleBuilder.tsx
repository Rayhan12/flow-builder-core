import { Plus, Trash2 } from 'lucide-react'
import {
  emptyConditionGroup,
  emptyRuleMatch,
  ensureRuleMatch,
  rulePreviewSentence,
  type DiagramNode,
  type RuleMatch,
  type RuleRow,
} from '../../schema'
import { newNodeId } from '../kinds'
import { ConditionRows } from './ConditionBuilder'

type RuleNode = Extract<DiagramNode, { kind: 'rule' }>

type Props = {
  node: RuleNode
  onChange: (node: RuleNode) => void
}

function updateRule(rules: RuleRow[], index: number, patch: Partial<RuleRow>): RuleRow[] {
  return rules.map((r, i) => (i === index ? { ...r, ...patch } : r))
}

function setMatch(rule: RuleRow, match: RuleMatch): RuleRow {
  return { ...rule, match, condition: undefined }
}

export function RuleBuilder({ node, onChange }: Props) {
  const rules = node.data.rules

  function commit(nextRules: RuleRow[], threshold = node.data.threshold) {
    onChange({ ...node, data: { ...node.data, rules: nextRules, threshold } })
  }

  return (
    <section className="side-section" data-testid="rule-builder">
      <h3 className="side-section-label">Rules</h3>
      <label className="field">
        <span>Threshold</span>
        <input
          type="number"
          value={node.data.threshold ?? ''}
          onChange={(e) =>
            commit(
              rules,
              e.target.value === '' ? undefined : Number(e.target.value),
            )
          }
        />
        <p className="field-help">Optional score cut-off for this rule set.</p>
      </label>

      <div className="rule-builder-list">
        {rules.map((rule, index) => {
          const match = ensureRuleMatch(rule)
          const preview = rulePreviewSentence(match, rule.outcome)
          return (
            <div key={rule.id ?? index} className="rule-card" data-testid="rule-card">
              <div className="rule-card-header">
                <span className="rule-card-title">Rule {index + 1}</span>
                <button
                  type="button"
                  className="btn btn-ghost btn-icon btn-danger-icon"
                  aria-label={`Remove rule ${index + 1}`}
                  disabled={rules.length <= 1}
                  onClick={() => commit(rules.filter((_, i) => i !== index))}
                >
                  <Trash2 size={14} />
                </button>
              </div>

              <div className="rule-groups">
                {match.groups.map((group, gIndex) => (
                  <div key={gIndex} className="rule-group">
                    {gIndex > 0 ? (
                      <button
                        type="button"
                        className="condition-combinator"
                        aria-label={`Group join ${match.combinator}. Click to toggle.`}
                        onClick={() => {
                          const nextMatch: RuleMatch = {
                            ...match,
                            combinator: match.combinator === 'and' ? 'or' : 'and',
                          }
                          commit(updateRule(rules, index, setMatch(rule, nextMatch)))
                        }}
                      >
                        {match.combinator.toUpperCase()}
                      </button>
                    ) : null}
                    <ConditionRows
                      conditions={group.conditions}
                      combinator={group.combinator}
                      onChangeConditions={(conditions) => {
                        const groups = match.groups.map((g, i) =>
                          i === gIndex ? { ...g, conditions } : g,
                        )
                        commit(updateRule(rules, index, setMatch(rule, { ...match, groups })))
                      }}
                      onChangeCombinator={(combinator) => {
                        const groups = match.groups.map((g, i) =>
                          i === gIndex ? { ...g, combinator } : g,
                        )
                        commit(updateRule(rules, index, setMatch(rule, { ...match, groups })))
                      }}
                    />
                    {match.groups.length > 1 ? (
                      <button
                        type="button"
                        className="btn btn-ghost btn-danger-icon"
                        onClick={() => {
                          const groups = match.groups.filter((_, i) => i !== gIndex)
                          commit(
                            updateRule(
                              rules,
                              index,
                              setMatch(rule, {
                                ...match,
                                groups: groups.length ? groups : [emptyConditionGroup()],
                              }),
                            ),
                          )
                        }}
                      >
                        Remove group
                      </button>
                    ) : null}
                  </div>
                ))}
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => {
                    const groups = [...match.groups, emptyConditionGroup('or')]
                    commit(updateRule(rules, index, setMatch(rule, { ...match, groups })))
                  }}
                >
                  <Plus size={14} />
                  Add AND/OR group
                </button>
              </div>

              <label className="field">
                <span>Outcome</span>
                <input
                  value={rule.outcome}
                  aria-label={`Rule ${index + 1} outcome`}
                  onChange={(e) =>
                    commit(updateRule(rules, index, { outcome: e.target.value }))
                  }
                />
              </label>
              <label className="field">
                <span>Score (optional)</span>
                <input
                  type="number"
                  value={rule.score ?? ''}
                  aria-label={`Rule ${index + 1} score`}
                  onChange={(e) =>
                    commit(
                      updateRule(rules, index, {
                        score: e.target.value === '' ? undefined : Number(e.target.value),
                      }),
                    )
                  }
                />
              </label>
              <p className="rule-preview" data-testid="rule-preview">
                {preview}
              </p>
            </div>
          )
        })}
      </div>

      <button
        type="button"
        className="btn btn-secondary"
        onClick={() =>
          commit([
            ...rules,
            {
              id: newNodeId('rule'),
              outcome: '',
              match: emptyRuleMatch(),
            },
          ])
        }
      >
        <Plus size={14} />
        Add rule
      </button>
    </section>
  )
}
