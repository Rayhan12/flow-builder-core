import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import {
  emptyCondition,
  type Branch,
  type DiagramEdge,
  type DiagramNode,
} from '../../schema'
import { ColourPicker } from '../ColourPicker'
import { decisionSizeForBranches } from '../decisionLayout'
import { newNodeId } from '../kinds'
import { ConditionRows } from './ConditionBuilder'

type DecisionNode = Extract<DiagramNode, { kind: 'decision' | 'switch' }>

type Props = {
  node: DecisionNode
  edges: DiagramEdge[]
  onChange: (node: DecisionNode) => void
  onRemoveEdges: (ids: string[]) => void
}

function defaultBranchMatch() {
  return { combinator: 'and' as const, conditions: [emptyCondition()] }
}

export function DecisionBranchesEditor({ node, edges, onChange, onRemoveEdges }: Props) {
  const mode = node.data.mode === 'switch' ? 'switch' : 'branches'
  const branches = node.data.branches
  const [pendingDelete, setPendingDelete] = useState<{
    index: number
    edgeIds: string[]
  } | null>(null)

  function commit(data: DecisionNode['data']) {
    const size = decisionSizeForBranches(data.branches.length)
    onChange({ ...node, data, size })
  }

  function moveBranch(index: number, dir: -1 | 1) {
    const next = index + dir
    if (next < 0 || next >= branches.length) return
    const copy = [...branches]
    const tmp = copy[index]
    copy[index] = copy[next]
    copy[next] = tmp
    commit({ ...node.data, branches: copy })
  }

  function requestDelete(index: number) {
    const branch = branches[index]
    if (!branch || branches.length <= 1) return
    const connected = edges
      .filter((e) => e.source === node.id && e.sourceHandle === branch.id)
      .map((e) => e.id)
    if (connected.length > 0) {
      setPendingDelete({ index, edgeIds: connected })
      return
    }
    commit({
      ...node.data,
      branches: branches.filter((_, i) => i !== index),
    })
  }

  function confirmDelete() {
    if (!pendingDelete) return
    onRemoveEdges(pendingDelete.edgeIds)
    commit({
      ...node.data,
      branches: branches.filter((_, i) => i !== pendingDelete.index),
    })
    setPendingDelete(null)
  }

  return (
    <section className="side-section" data-testid="decision-branches">
      <h3 className="side-section-label">Branches</h3>
      <div className="decision-mode-toggle" role="group" aria-label="Decision mode">
        <button
          type="button"
          className={`btn btn-ghost ${mode === 'branches' ? 'is-active' : ''}`}
          aria-pressed={mode === 'branches'}
          onClick={() => commit({ ...node.data, mode: 'branches' })}
        >
          Custom branches
        </button>
        <button
          type="button"
          className={`btn btn-ghost ${mode === 'switch' ? 'is-active' : ''}`}
          aria-pressed={mode === 'switch'}
          onClick={() => commit({ ...node.data, mode: 'switch' })}
        >
          Switch on field
        </button>
      </div>

      {mode === 'switch' ? (
        <label className="field">
          <span>Field</span>
          <input
            value={node.data.switchField ?? ''}
            placeholder="e.g. status"
            aria-label="Switch field"
            onChange={(e) =>
              commit({ ...node.data, switchField: e.target.value || undefined })
            }
          />
          <p className="field-help">Each branch is a case value of this field.</p>
        </label>
      ) : null}

      <label className="field">
        <span>Branch handles</span>
        <select
          aria-label="Branch handle side"
          data-testid="branch-handle-side"
          value={node.data.branchHandleSide ?? 'bottom'}
          onChange={(e) =>
            commit({
              ...node.data,
              branchHandleSide: e.target.value === 'right' ? 'right' : 'bottom',
            })
          }
        >
          <option value="bottom">Bottom</option>
          <option value="right">Right</option>
        </select>
        <p className="field-help">Where each branch output leaves the card.</p>
      </label>

      <div className="side-list decision-branch-list">
        {branches.map((branch, index) => (
          <div key={branch.id} className="decision-branch-card" data-testid="decision-branch">
            <div className="decision-branch-toolbar">
              <input
                value={branch.label}
                aria-label={`Branch ${index + 1} label`}
                onChange={(e) => {
                  const next = branches.map((b, i) =>
                    i === index ? { ...b, label: e.target.value } : b,
                  )
                  commit({ ...node.data, branches: next })
                }}
              />
              <button
                type="button"
                className="btn btn-ghost btn-icon"
                aria-label={`Move branch ${branch.label} up`}
                disabled={index === 0}
                onClick={() => moveBranch(index, -1)}
              >
                <ArrowUp size={14} />
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-icon"
                aria-label={`Move branch ${branch.label} down`}
                disabled={index === branches.length - 1}
                onClick={() => moveBranch(index, 1)}
              >
                <ArrowDown size={14} />
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-icon btn-danger-icon"
                aria-label={`Remove branch ${branch.label}`}
                disabled={branches.length <= 1}
                onClick={() => requestDelete(index)}
              >
                <Trash2 size={14} />
              </button>
            </div>

            <label className="field checkbox-field">
              <input
                type="checkbox"
                checked={branch.isDefault === true}
                onChange={(e) => {
                  const checked = e.target.checked
                  const next = branches.map((b, i) => ({
                    ...b,
                    isDefault: i === index ? checked : checked ? false : b.isDefault,
                  }))
                  commit({ ...node.data, branches: next })
                }}
              />
              <span>Default / Else</span>
            </label>

            <label className="field">
              <span>Colour</span>
              <ColourPicker
                value={branch.color}
                fallback="amber"
                onChange={(color) => {
                  const next = branches.map((b, i) =>
                    i === index ? { ...b, color } : b,
                  )
                  commit({ ...node.data, branches: next })
                }}
              />
            </label>

            {branch.isDefault ? (
              <p className="field-help">Used when no other branch matches.</p>
            ) : mode === 'switch' ? (
              <label className="field">
                <span>Case value</span>
                <input
                  value={branch.condition ?? branch.match?.conditions[0]?.value ?? ''}
                  aria-label={`Branch ${branch.label} case value`}
                  onChange={(e) => {
                    const value = e.target.value
                    const next = branches.map((b, i) =>
                      i === index
                        ? {
                            ...b,
                            condition: value,
                            match: {
                              combinator: 'and' as const,
                              conditions: [
                                {
                                  field: node.data.switchField ?? 'field',
                                  operator: 'eq' as const,
                                  value,
                                },
                              ],
                            },
                          }
                        : b,
                    )
                    commit({ ...node.data, branches: next })
                  }}
                />
              </label>
            ) : (
              <ConditionRows
                conditions={branch.match?.conditions ?? [emptyCondition()]}
                combinator={branch.match?.combinator ?? 'and'}
                onChangeConditions={(conditions) => {
                  const next = branches.map((b, i) =>
                    i === index
                      ? {
                          ...b,
                          match: {
                            combinator: b.match?.combinator ?? 'and',
                            conditions,
                          },
                          condition: undefined,
                        }
                      : b,
                  )
                  commit({ ...node.data, branches: next })
                }}
                onChangeCombinator={(combinator) => {
                  const next = branches.map((b, i) =>
                    i === index
                      ? {
                          ...b,
                          match: {
                            combinator,
                            conditions: b.match?.conditions ?? [emptyCondition()],
                          },
                        }
                      : b,
                  )
                  commit({ ...node.data, branches: next })
                }}
              />
            )}
          </div>
        ))}
      </div>

      <div className="decision-branch-actions">
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => {
            const branch: Branch = {
              id: newNodeId('br'),
              label: `Branch ${branches.length + 1}`,
              color: 'amber',
              match: defaultBranchMatch(),
            }
            commit({ ...node.data, branches: [...branches, branch] })
          }}
        >
          <Plus size={14} />
          Add branch
        </button>
        {!branches.some((b) => b.isDefault) ? (
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => {
              const branch: Branch = {
                id: newNodeId('br'),
                label: 'Else',
                color: 'gray',
                isDefault: true,
              }
              commit({ ...node.data, branches: [...branches, branch] })
            }}
          >
            <Plus size={14} />
            Add Else
          </button>
        ) : null}
      </div>

      {pendingDelete ? (
        <div className="confirm-inline" role="alertdialog" aria-label="Delete branch">
          <p>
            This branch has {pendingDelete.edgeIds.length} connector
            {pendingDelete.edgeIds.length === 1 ? '' : 's'}. Delete the branch and its
            connectors?
          </p>
          <div className="confirm-inline-actions">
            <button type="button" className="btn btn-secondary" onClick={() => setPendingDelete(null)}>
              Cancel
            </button>
            <button type="button" className="btn btn-primary" onClick={confirmDelete}>
              Delete
            </button>
          </div>
        </div>
      ) : null}
    </section>
  )
}
