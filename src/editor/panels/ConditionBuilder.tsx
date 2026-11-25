import { Plus, Trash2 } from 'lucide-react'
import {
  CONDITION_OPERATORS,
  OPERATOR_LABELS,
  emptyCondition,
  type Condition,
  type ConditionGroup,
  type ConditionOperator,
} from '../../schema'

type Props = {
  group: ConditionGroup
  onChange: (group: ConditionGroup) => void
  /** Compact single-group builder (no nested group UI). */
  allowNested?: boolean
}

export function ConditionRows({
  conditions,
  combinator,
  onChangeConditions,
  onChangeCombinator,
}: {
  conditions: Condition[]
  combinator: 'and' | 'or'
  onChangeConditions: (next: Condition[]) => void
  onChangeCombinator: (next: 'and' | 'or') => void
}) {
  return (
    <div className="condition-rows" data-testid="condition-rows">
      {conditions.map((row, index) => (
        <div key={index} className="condition-row">
          {index > 0 ? (
            <button
              type="button"
              className="condition-combinator"
              aria-label={`Join with ${combinator.toUpperCase()}. Click to toggle.`}
              onClick={() => onChangeCombinator(combinator === 'and' ? 'or' : 'and')}
            >
              {combinator.toUpperCase()}
            </button>
          ) : (
            <span className="condition-combinator is-muted">If</span>
          )}
          <input
            className="condition-field"
            placeholder="Field"
            aria-label={`Condition ${index + 1} field`}
            value={row.field}
            onChange={(e) => {
              const next = conditions.map((c, i) =>
                i === index ? { ...c, field: e.target.value } : c,
              )
              onChangeConditions(next)
            }}
          />
          <select
            className="condition-operator"
            aria-label={`Condition ${index + 1} operator`}
            value={row.operator}
            onChange={(e) => {
              const operator = e.target.value as ConditionOperator
              const next = conditions.map((c, i) =>
                i === index ? { ...c, operator } : c,
              )
              onChangeConditions(next)
            }}
          >
            {CONDITION_OPERATORS.map((op) => (
              <option key={op} value={op}>
                {OPERATOR_LABELS[op]}
              </option>
            ))}
          </select>
          {row.operator !== 'empty' ? (
            <input
              className="condition-value"
              placeholder="Value"
              aria-label={`Condition ${index + 1} value`}
              value={row.value ?? ''}
              onChange={(e) => {
                const next = conditions.map((c, i) =>
                  i === index ? { ...c, value: e.target.value } : c,
                )
                onChangeConditions(next)
              }}
            />
          ) : null}
          {row.operator === 'between' ? (
            <input
              className="condition-value"
              placeholder="And"
              aria-label={`Condition ${index + 1} second value`}
              value={row.value2 ?? ''}
              onChange={(e) => {
                const next = conditions.map((c, i) =>
                  i === index ? { ...c, value2: e.target.value } : c,
                )
                onChangeConditions(next)
              }}
            />
          ) : null}
          <button
            type="button"
            className="btn btn-ghost btn-icon btn-danger-icon"
            aria-label={`Remove condition ${index + 1}`}
            disabled={conditions.length <= 1}
            onClick={() => onChangeConditions(conditions.filter((_, i) => i !== index))}
          >
            <Trash2 size={14} />
          </button>
        </div>
      ))}
      <button
        type="button"
        className="btn btn-ghost condition-add"
        onClick={() => onChangeConditions([...conditions, emptyCondition()])}
      >
        <Plus size={14} />
        Add condition
      </button>
    </div>
  )
}

export function ConditionBuilder({ group, onChange }: Props) {
  return (
    <ConditionRows
      conditions={group.conditions}
      combinator={group.combinator}
      onChangeConditions={(conditions) => onChange({ ...group, conditions })}
      onChangeCombinator={(combinator) => onChange({ ...group, combinator })}
    />
  )
}
