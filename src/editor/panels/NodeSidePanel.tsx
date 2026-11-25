import { createElement, useState } from 'react'
import { MousePointerClick, Plus, Trash2, X } from 'lucide-react'
import { EmptyState } from '../../components/EmptyState'
import type { DiagramNode } from '../../schema'
import { useEditorStore } from '../../store/editorStore'
import { ColourPicker } from '../ColourPicker'
import { resolveColor } from '../colors'
import { absolutePosition } from '../flowTypes'
import { getLucideIcon } from '../icons'
import { IconPicker } from '../IconPicker'
import { KIND_META, newNodeId } from '../kinds'

type PanelTab = 'settings' | 'look' | 'notes'

export function NodeSidePanel() {
  const diagram = useEditorStore((s) => s.diagram)
  const selectedNodeIds = useEditorStore((s) => s.selectedNodeIds)
  const replaceNode = useEditorStore((s) => s.replaceNode)
  const updateNode = useEditorStore((s) => s.updateNode)
  const removeNodes = useEditorStore((s) => s.removeNodes)
  const setNodeParent = useEditorStore((s) => s.setNodeParent)
  const clearSelection = useEditorStore((s) => s.clearSelection)
  const [tab, setTab] = useState<PanelTab>('settings')

  const node =
    diagram && selectedNodeIds.length === 1
      ? diagram.nodes.find((n) => n.id === selectedNodeIds[0])
      : undefined

  if (!node) {
    return (
      <aside className="side-panel" aria-label="Node details">
        <EmptyState
          icon={MousePointerClick}
          title="No node selected"
          hint="Click a node on the canvas to edit it."
          className="side-panel-empty-state"
        />
      </aside>
    )
  }

  function setField<K extends keyof DiagramNode>(key: K, value: DiagramNode[K]) {
    updateNode(node!.id, { [key]: value } as Partial<DiagramNode>)
  }

  const groups =
    diagram?.nodes.filter((n) => n.kind === 'group' && n.id !== node.id) ?? []
  const meta = KIND_META[node.kind]
  const color = resolveColor(node.color, meta.defaultColor)
  const Icon = getLucideIcon(node.icon, meta.icon)

  return (
    <aside className="side-panel" aria-label="Node details">
      <div className="side-panel-header">
        <div className="side-panel-header-main">
          <span
            className="side-panel-header-icon"
            style={{ background: color.tint, color: color.solid }}
            aria-hidden
          >
            {createElement(Icon, { size: 16, strokeWidth: 2 })}
          </span>
          <div className="side-panel-header-text">
            <span className="side-panel-kind">{meta.label}</span>
            <input
              className="side-panel-title-input"
              value={node.label}
              maxLength={200}
              aria-label="Node title"
              onChange={(e) => setField('label', e.target.value)}
            />
          </div>
        </div>
        <button
          type="button"
          className="btn btn-ghost btn-icon"
          aria-label="Close panel"
          onClick={clearSelection}
        >
          <X size={16} />
        </button>
      </div>

      <div className="side-panel-tabs" role="tablist" aria-label="Node panel sections">
        {(
          [
            ['settings', 'Settings'],
            ['look', 'Look'],
            ['notes', 'Notes'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            className={`side-panel-tab ${tab === id ? 'is-active' : ''}`}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'settings' ? (
        <>
          <section className="side-section">
            <h3 className="side-section-label">General</h3>
            <label className="field">
              <span>Label</span>
              <input
                value={node.label}
                maxLength={200}
                onChange={(e) => setField('label', e.target.value)}
              />
              <p className="field-help">Short name shown on the node card.</p>
            </label>
            {node.kind !== 'group' && groups.length > 0 ? (
              <label className="field">
                <span>Parent group</span>
                <select
                  value={node.parentId ?? ''}
                  onChange={(e) => {
                    const next = e.target.value || undefined
                    const abs = absolutePosition(node, diagram!.nodes)
                    setNodeParent(node.id, next, abs)
                  }}
                >
                  <option value="">None</option>
                  {groups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.kind === 'group' ? g.data.label : g.label}
                    </option>
                  ))}
                </select>
                <p className="field-help">Nest this node inside a coloured segment.</p>
              </label>
            ) : null}
          </section>

          <KindDetails node={node} replaceNode={replaceNode} />

          <section className="side-section">
            <button
              type="button"
              className="btn btn-ghost btn-danger-icon"
              onClick={() => removeNodes([node.id])}
            >
              <Trash2 size={16} />
              Delete {node.kind === 'group' ? 'group' : 'node'}
            </button>
          </section>
        </>
      ) : null}

      {tab === 'look' ? (
        <section className="side-section">
          <h3 className="side-section-label">Look</h3>
          <label className="field">
            <span>Icon</span>
            <IconPicker value={node.icon} onChange={(name) => setField('icon', name)} />
            <p className="field-help">Pick a lucide icon for the coloured tile.</p>
          </label>
          <label className="field">
            <span>Colour</span>
            <ColourPicker
              value={node.color}
              onChange={(nextColor) => {
                if (node.kind === 'group') {
                  replaceNode({
                    ...node,
                    color: nextColor,
                    data: { ...node.data, color: nextColor },
                  })
                } else {
                  setField('color', nextColor)
                }
              }}
            />
            <p className="field-help">Used for the icon tile, stripe and group wash.</p>
          </label>
        </section>
      ) : null}

      {tab === 'notes' ? (
        <section className="side-section">
          <h3 className="side-section-label">Notes</h3>
          <label className="field">
            <span>Description</span>
            <textarea
              className="field-textarea"
              rows={4}
              value={node.description ?? ''}
              onChange={(e) => setField('description', e.target.value || undefined)}
            />
            <p className="field-help">Shown under the title on the canvas, two lines max.</p>
          </label>
          {node.kind === 'step' ? (
            <label className="field">
              <span>Step notes</span>
              <textarea
                className="field-textarea"
                rows={3}
                value={node.data?.notes ?? ''}
                onChange={(e) =>
                  replaceNode({
                    ...node,
                    data: { ...node.data, notes: e.target.value || undefined },
                  })
                }
              />
              <p className="field-help">Internal detail for this process step.</p>
            </label>
          ) : null}
          {node.kind === 'note' ? (
            <label className="field">
              <span>Note text</span>
              <textarea
                className="field-textarea"
                rows={5}
                value={node.data.text}
                onChange={(e) => replaceNode({ ...node, data: { text: e.target.value } })}
              />
            </label>
          ) : null}
        </section>
      ) : null}
    </aside>
  )
}

function KindDetails({
  node,
  replaceNode,
}: {
  node: DiagramNode
  replaceNode: (node: DiagramNode) => void
}) {
  switch (node.kind) {
    case 'step':
      return (
        <section className="side-section">
          <h3 className="side-section-label">Details</h3>
          <label className="field">
            <span>Owner</span>
            <input
              value={node.data?.owner ?? ''}
              onChange={(e) =>
                replaceNode({
                  ...node,
                  data: { ...node.data, owner: e.target.value || undefined },
                })
              }
            />
            <p className="field-help">Who owns this step in the process.</p>
          </label>
        </section>
      )
    case 'decision':
      return (
        <section className="side-section">
          <h3 className="side-section-label">Branches</h3>
          <p className="field-help">Each branch becomes an output handle on the node.</p>
          <div className="side-list">
            {node.data.branches.map((branch, index) => (
              <div key={branch.id} className="side-list-row">
                <input
                  value={branch.label}
                  aria-label={`Branch ${index + 1} label`}
                  onChange={(e) => {
                    const branches = node.data.branches.map((b, i) =>
                      i === index ? { ...b, label: e.target.value } : b,
                    )
                    replaceNode({ ...node, data: { branches } })
                  }}
                />
                <button
                  type="button"
                  className="btn btn-ghost btn-icon btn-danger-icon"
                  aria-label={`Remove branch ${branch.label}`}
                  disabled={node.data.branches.length <= 1}
                  onClick={() => {
                    const branches = node.data.branches.filter((_, i) => i !== index)
                    replaceNode({ ...node, data: { branches } })
                  }}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => {
              const branches = [
                ...node.data.branches,
                { id: newNodeId('br'), label: `Branch ${node.data.branches.length + 1}` },
              ]
              replaceNode({ ...node, data: { branches } })
            }}
          >
            <Plus size={14} />
            Add branch
          </button>
        </section>
      )
    case 'mapping':
      return (
        <section className="side-section">
          <h3 className="side-section-label">Mappings</h3>
          <p className="field-help">Map a source field to a destination field.</p>
          <div className="side-list">
            {node.data.mappings.map((row, index) => (
              <div key={index} className="side-list-row stacked">
                <input
                  placeholder="From"
                  value={row.from}
                  onChange={(e) => {
                    const mappings = node.data.mappings.map((m, i) =>
                      i === index ? { ...m, from: e.target.value } : m,
                    )
                    replaceNode({ ...node, data: { mappings } })
                  }}
                />
                <input
                  placeholder="To"
                  value={row.to}
                  onChange={(e) => {
                    const mappings = node.data.mappings.map((m, i) =>
                      i === index ? { ...m, to: e.target.value } : m,
                    )
                    replaceNode({ ...node, data: { mappings } })
                  }}
                />
                <button
                  type="button"
                  className="btn btn-ghost btn-icon btn-danger-icon"
                  aria-label={`Remove mapping ${index + 1}`}
                  onClick={() => {
                    const mappings = node.data.mappings.filter((_, i) => i !== index)
                    replaceNode({ ...node, data: { mappings } })
                  }}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() =>
              replaceNode({
                ...node,
                data: { mappings: [...node.data.mappings, { from: '', to: '' }] },
              })
            }
          >
            <Plus size={14} />
            Add mapping
          </button>
        </section>
      )
    case 'integration':
      return (
        <section className="side-section">
          <h3 className="side-section-label">Details</h3>
          <label className="field">
            <span>Service</span>
            <input
              value={node.data.service}
              onChange={(e) =>
                replaceNode({ ...node, data: { ...node.data, service: e.target.value } })
              }
            />
            <p className="field-help">Name of the system you call.</p>
          </label>
          <label className="field">
            <span>Method</span>
            <input
              value={node.data.method ?? ''}
              onChange={(e) =>
                replaceNode({
                  ...node,
                  data: { ...node.data, method: e.target.value || undefined },
                })
              }
            />
            <p className="field-help">HTTP method such as GET or POST.</p>
          </label>
          <label className="field">
            <span>Endpoint</span>
            <input
              value={node.data.endpoint ?? ''}
              onChange={(e) =>
                replaceNode({
                  ...node,
                  data: { ...node.data, endpoint: e.target.value || undefined },
                })
              }
            />
            <p className="field-help">Path or URL for the call.</p>
          </label>
        </section>
      )
    case 'rule':
      return (
        <section className="side-section">
          <h3 className="side-section-label">Rules</h3>
          <label className="field">
            <span>Threshold</span>
            <input
              type="number"
              value={node.data.threshold ?? ''}
              onChange={(e) =>
                replaceNode({
                  ...node,
                  data: {
                    ...node.data,
                    threshold: e.target.value === '' ? undefined : Number(e.target.value),
                  },
                })
              }
            />
            <p className="field-help">Optional score cut-off for this rule set.</p>
          </label>
          <div className="side-list">
            {node.data.rules.map((row, index) => (
              <div key={index} className="side-list-row stacked">
                <input
                  placeholder="Condition"
                  value={row.condition}
                  onChange={(e) => {
                    const rules = node.data.rules.map((r, i) =>
                      i === index ? { ...r, condition: e.target.value } : r,
                    )
                    replaceNode({ ...node, data: { ...node.data, rules } })
                  }}
                />
                <input
                  placeholder="Outcome"
                  value={row.outcome}
                  onChange={(e) => {
                    const rules = node.data.rules.map((r, i) =>
                      i === index ? { ...r, outcome: e.target.value } : r,
                    )
                    replaceNode({ ...node, data: { ...node.data, rules } })
                  }}
                />
                <button
                  type="button"
                  className="btn btn-ghost btn-icon btn-danger-icon"
                  aria-label={`Remove rule ${index + 1}`}
                  onClick={() => {
                    const rules = node.data.rules.filter((_, i) => i !== index)
                    replaceNode({ ...node, data: { ...node.data, rules } })
                  }}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() =>
              replaceNode({
                ...node,
                data: {
                  ...node.data,
                  rules: [...node.data.rules, { condition: '', outcome: '' }],
                },
              })
            }
          >
            <Plus size={14} />
            Add rule
          </button>
        </section>
      )
    case 'group': {
      const groupColor = resolveColor(node.data.color ?? node.color, 'gray')
      const collapsed = node.data.collapsed === true
      return (
        <section className="side-section">
          <h3 className="side-section-label">Details</h3>
          <label className="field">
            <span>Group label</span>
            <input
              value={node.data.label}
              onChange={(e) =>
                replaceNode({
                  ...node,
                  label: e.target.value,
                  data: { ...node.data, label: e.target.value },
                })
              }
            />
          </label>
          <label className="field checkbox-field">
            <input
              type="checkbox"
              checked={collapsed}
              onChange={(e) =>
                replaceNode({
                  ...node,
                  data: { ...node.data, collapsed: e.target.checked },
                })
              }
            />
            <span>Collapsed</span>
          </label>
          <p className="side-hint" style={{ color: groupColor.solid }}>
            Drag nodes onto this group to nest them, or pick a parent group in Settings.
          </p>
        </section>
      )
    }
    default:
      return null
  }
}
