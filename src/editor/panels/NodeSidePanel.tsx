import { Plus, Trash2, X } from 'lucide-react'
import type { DiagramNode } from '../../schema'
import { useEditorStore } from '../../store/editorStore'
import { ColourPicker } from '../ColourPicker'
import { resolveColor } from '../colors'
import { IconPicker } from '../IconPicker'
import { newNodeId } from '../kinds'
import { absolutePosition } from '../flowTypes'

export function NodeSidePanel() {
  const diagram = useEditorStore((s) => s.diagram)
  const selectedNodeIds = useEditorStore((s) => s.selectedNodeIds)
  const replaceNode = useEditorStore((s) => s.replaceNode)
  const updateNode = useEditorStore((s) => s.updateNode)
  const removeNodes = useEditorStore((s) => s.removeNodes)
  const setNodeParent = useEditorStore((s) => s.setNodeParent)
  const clearSelection = useEditorStore((s) => s.clearSelection)

  const node =
    diagram && selectedNodeIds.length === 1
      ? diagram.nodes.find((n) => n.id === selectedNodeIds[0])
      : undefined

  if (!node) {
    return (
      <aside className="side-panel" aria-label="Node details">
        <div className="side-panel-empty">
          <p className="side-panel-empty-title">No node selected</p>
          <p className="side-panel-empty-hint">Click a node on the canvas to edit it.</p>
        </div>
      </aside>
    )
  }

  function setField<K extends keyof DiagramNode>(key: K, value: DiagramNode[K]) {
    updateNode(node!.id, { [key]: value } as Partial<DiagramNode>)
  }

  const groups =
    diagram?.nodes.filter((n) => n.kind === 'group' && n.id !== node.id) ?? []

  return (
    <aside className="side-panel" aria-label="Node details">
      <div className="side-panel-header">
        <h2>{node.kind === 'group' ? 'Group' : 'Node'}</h2>
        <button
          type="button"
          className="btn btn-ghost btn-icon"
          aria-label="Close panel"
          onClick={clearSelection}
        >
          <X size={16} />
        </button>
      </div>

      <section className="side-section">
        <h3 className="side-section-label">General</h3>
        <label className="field">
          <span>Label</span>
          <input
            value={node.label}
            maxLength={200}
            onChange={(e) => setField('label', e.target.value)}
          />
        </label>
        <label className="field">
          <span>Description</span>
          <textarea
            className="field-textarea"
            rows={3}
            value={node.description ?? ''}
            onChange={(e) => setField('description', e.target.value || undefined)}
          />
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
          </label>
        ) : null}
      </section>

      <section className="side-section">
        <h3 className="side-section-label">Look</h3>
        <label className="field">
          <span>Icon</span>
          <IconPicker
            value={node.icon}
            onChange={(name) => setField('icon', name)}
          />
        </label>
        <label className="field">
          <span>Colour</span>
          <ColourPicker
            value={node.color}
            onChange={(color) => {
              if (node.kind === 'group') {
                replaceNode({
                  ...node,
                  color,
                  data: { ...node.data, color },
                })
              } else {
                setField('color', color)
              }
            }}
          />
        </label>
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
          </label>
          <label className="field">
            <span>Notes</span>
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
          </label>
        </section>
      )
    case 'decision':
      return (
        <section className="side-section">
          <h3 className="side-section-label">Branches</h3>
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
    case 'note':
      return (
        <section className="side-section">
          <h3 className="side-section-label">Details</h3>
          <label className="field">
            <span>Text</span>
            <textarea
              className="field-textarea"
              rows={4}
              value={node.data.text}
              onChange={(e) => replaceNode({ ...node, data: { text: e.target.value } })}
            />
          </label>
        </section>
      )
    case 'group': {
      const color = resolveColor(node.data.color ?? node.color, 'gray')
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
          <p className="side-hint" style={{ color: color.solid }}>
            Drag nodes onto this group to nest them, or pick a parent group in the panel.
          </p>
        </section>
      )
    }
    default:
      return null
  }
}
