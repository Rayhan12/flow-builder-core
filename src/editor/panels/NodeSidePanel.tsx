import { createElement, useMemo, useState } from 'react'
import {
  BringToFront,
  Eye,
  EyeOff,
  Lock,
  MousePointerClick,
  Plus,
  SendToBack,
  Trash2,
  Unlock,
  X,
} from 'lucide-react'
import { EmptyState } from '../../components/EmptyState'
import { isContainerKind, type DiagramEdge, type DiagramNode } from '../../schema'
import { useEditorStore } from '../../store/editorStore'
import { ColourPicker } from '../ColourPicker'
import { resolveColor } from '../colors'
import { absolutePosition } from '../flowTypes'
import { getLucideIcon } from '../icons'
import { IconPicker } from '../IconPicker'
import { KIND_META } from '../kinds'
import { DecisionBranchesEditor } from './DecisionBranchesEditor'
import { RuleBuilder } from './RuleBuilder'

type PanelTab = 'settings' | 'look' | 'notes'

const MIXED = 'Mixed'

function sharedValue<T>(values: T[]): T | typeof MIXED {
  if (values.length === 0) return MIXED
  const first = values[0]
  return values.every((v) => Object.is(v, first)) ? first : MIXED
}

export function NodeSidePanel() {
  const diagram = useEditorStore((s) => s.diagram)
  const selectedNodeIds = useEditorStore((s) => s.selectedNodeIds)
  const selectedEdgeIds = useEditorStore((s) => s.selectedEdgeIds)
  const replaceNode = useEditorStore((s) => s.replaceNode)
  const updateNode = useEditorStore((s) => s.updateNode)
  const updateNodes = useEditorStore((s) => s.updateNodes)
  const updateEdges = useEditorStore((s) => s.updateEdges)
  const removeNodes = useEditorStore((s) => s.removeNodes)
  const removeEdges = useEditorStore((s) => s.removeEdges)
  const setNodeParent = useEditorStore((s) => s.setNodeParent)
  const clearSelection = useEditorStore((s) => s.clearSelection)
  const toggleHidden = useEditorStore((s) => s.toggleHidden)
  const toggleLocked = useEditorStore((s) => s.toggleLocked)
  const reorderZ = useEditorStore((s) => s.reorderZ)
  const [tab, setTab] = useState<PanelTab>('settings')

  const selectedNodes = useMemo(() => {
    if (!diagram) return [] as DiagramNode[]
    const set = new Set(selectedNodeIds)
    return diagram.nodes.filter((n) => set.has(n.id))
  }, [diagram, selectedNodeIds])

  const selectedEdges = useMemo(() => {
    if (!diagram) return [] as DiagramEdge[]
    const set = new Set(selectedEdgeIds)
    return diagram.edges.filter((e) => set.has(e.id))
  }, [diagram, selectedEdgeIds])

  if (!diagram) return null

  if (selectedNodes.length === 0 && selectedEdges.length === 0) {
    return (
      <aside className="side-panel" aria-label="Selection details" data-testid="properties-panel">
        <EmptyState
          icon={MousePointerClick}
          title="Nothing selected"
          hint="Click a node or connector on the canvas to edit it."
          className="side-panel-empty-state"
        />
      </aside>
    )
  }

  if (selectedNodes.length === 0 && selectedEdges.length > 0) {
    const labels = selectedEdges.map((e) => e.label ?? '')
    const labelValue = sharedValue(labels)
    return (
      <aside className="side-panel" aria-label="Connector details" data-testid="properties-panel">
        <div className="side-panel-header">
          <div className="side-panel-header-text">
            <span className="side-panel-kind">
              {selectedEdges.length === 1 ? 'Connector' : `${selectedEdges.length} connectors`}
            </span>
            <input
              className="side-panel-title-input"
              value={labelValue === MIXED ? '' : labelValue}
              placeholder={labelValue === MIXED ? MIXED : 'Label'}
              aria-label="Connector label"
              maxLength={200}
              onChange={(e) => updateEdges(selectedEdgeIds, { label: e.target.value || undefined })}
            />
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
        <section className="side-section">
          <h3 className="side-section-label">Connector</h3>
          <label className="field">
            <span>Label {labelValue === MIXED ? `(${MIXED})` : ''}</span>
            <input
              value={labelValue === MIXED ? '' : labelValue}
              placeholder={labelValue === MIXED ? MIXED : ''}
              onChange={(e) => updateEdges(selectedEdgeIds, { label: e.target.value || undefined })}
            />
          </label>
          <button
            type="button"
            className="btn btn-ghost btn-danger-icon"
            onClick={() => removeEdges(selectedEdgeIds)}
          >
            <Trash2 size={16} />
            Delete connector{selectedEdges.length > 1 ? 's' : ''}
          </button>
        </section>
      </aside>
    )
  }

  const multi = selectedNodes.length > 1
  const node = selectedNodes[0]
  const labelShared = sharedValue(selectedNodes.map((n) => n.label))
  const iconShared = sharedValue(selectedNodes.map((n) => n.icon ?? ''))
  const colorShared = sharedValue(selectedNodes.map((n) => n.color ?? ''))
  const descShared = sharedValue(selectedNodes.map((n) => n.description ?? ''))
  const anyHidden = selectedNodes.some((n) => n.hidden)
  const anyLocked = selectedNodes.some((n) => n.locked)
  const meta = KIND_META[node.kind]
  const color = resolveColor(
    colorShared === MIXED ? undefined : colorShared || undefined,
    meta.defaultColor,
  )
  const Icon = getLucideIcon(
    iconShared === MIXED ? undefined : iconShared || undefined,
    meta.icon,
  )

  const groups =
    diagram.nodes.filter(
      (n) => isContainerKind(n.kind) && !selectedNodeIds.includes(n.id),
    ) ?? []

  function setFieldOnAll<K extends keyof DiagramNode>(key: K, value: DiagramNode[K]) {
    updateNodes(selectedNodeIds, { [key]: value } as Partial<DiagramNode>)
  }

  return (
    <aside className="side-panel" aria-label="Node details" data-testid="properties-panel">
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
            <span className="side-panel-kind">
              {multi
                ? `${selectedNodes.length} selected`
                : meta.label}
            </span>
            <input
              className="side-panel-title-input"
              value={labelShared === MIXED ? '' : labelShared}
              placeholder={labelShared === MIXED ? MIXED : 'Label'}
              maxLength={200}
              aria-label="Node title"
              data-testid="properties-label"
              onChange={(e) => setFieldOnAll('label', e.target.value)}
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

      <div className="side-panel-quick" role="toolbar" aria-label="Selection actions">
        <button
          type="button"
          className="btn btn-ghost btn-icon"
          aria-label={anyHidden ? 'Show' : 'Hide'}
          title={anyHidden ? 'Show' : 'Hide'}
          data-testid="properties-hide"
          onClick={() => toggleHidden(selectedNodeIds)}
        >
          {anyHidden ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-icon"
          aria-label={anyLocked ? 'Unlock' : 'Lock'}
          title={anyLocked ? 'Unlock' : 'Lock'}
          onClick={() => toggleLocked(selectedNodeIds)}
        >
          {anyLocked ? <Lock size={16} /> : <Unlock size={16} />}
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-icon"
          aria-label="Bring forward"
          title="Bring forward (Ctrl/Cmd+])"
          onClick={() => reorderZ(selectedNodeIds, 'forward')}
        >
          <BringToFront size={16} />
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-icon"
          aria-label="Send backward"
          title="Send backward (Ctrl/Cmd+[)"
          onClick={() => reorderZ(selectedNodeIds, 'backward')}
        >
          <SendToBack size={16} />
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-icon"
          aria-label="Bring to front"
          title="Bring to front"
          onClick={() => reorderZ(selectedNodeIds, 'front')}
        >
          <BringToFront size={16} />
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-icon"
          aria-label="Send to back"
          title="Send to back"
          onClick={() => reorderZ(selectedNodeIds, 'back')}
        >
          <SendToBack size={16} />
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
              <span>Label {labelShared === MIXED ? `(${MIXED})` : ''}</span>
              <input
                value={labelShared === MIXED ? '' : labelShared}
                placeholder={labelShared === MIXED ? MIXED : ''}
                maxLength={200}
                onChange={(e) => setFieldOnAll('label', e.target.value)}
              />
              <p className="field-help">Short name shown on the node card.</p>
            </label>
            {!multi && node.kind !== 'group' && node.kind !== 'section' && groups.length > 0 ? (
              <label className="field">
                <span>Parent group</span>
                <select
                  value={node.parentId ?? ''}
                  onChange={(e) => {
                    const next = e.target.value || undefined
                    const abs = absolutePosition(node, diagram.nodes)
                    setNodeParent(node.id, next, abs)
                  }}
                >
                  <option value="">None</option>
                  {groups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.kind === 'group' || g.kind === 'section' ? g.data.label : g.label}
                    </option>
                  ))}
                </select>
                <p className="field-help">Nest this node inside a coloured segment.</p>
              </label>
            ) : null}
          </section>

          {!multi ? (
            <KindDetails
              node={node}
              edges={diagram.edges}
              replaceNode={replaceNode}
              removeEdges={removeEdges}
            />
          ) : (
            <section className="side-section">
              <p className="field-help">
                Shared fields show {MIXED} when values differ. Edits apply to all selected nodes.
              </p>
            </section>
          )}

          <section className="side-section">
            <button
              type="button"
              className="btn btn-ghost btn-danger-icon"
              onClick={() => removeNodes(selectedNodeIds)}
            >
              <Trash2 size={16} />
              Delete {multi ? 'selection' : isContainerKind(node.kind) ? 'group' : 'node'}
            </button>
          </section>
        </>
      ) : null}

      {tab === 'look' ? (
        <section className="side-section" data-testid="look-section">
          <h3 className="side-section-label">Look</h3>
          <label className="field">
            <span>Icon {iconShared === MIXED ? `(${MIXED})` : ''}</span>
            <IconPicker
              value={iconShared === MIXED ? undefined : iconShared || undefined}
              onChange={(name) => setFieldOnAll('icon', name)}
            />
            <p className="field-help">Pick a lucide icon for the coloured tile.</p>
          </label>
          <label className="field">
            <span>Colour {colorShared === MIXED ? `(${MIXED})` : ''}</span>
            <ColourPicker
              value={colorShared === MIXED ? undefined : colorShared || undefined}
              onChange={(nextColor) => {
                for (const n of selectedNodes) {
                  if (n.kind === 'group' || n.kind === 'section') {
                    replaceNode({
                      ...n,
                      color: nextColor,
                      data: { ...n.data, color: nextColor },
                    })
                  } else {
                    updateNode(n.id, { color: nextColor })
                  }
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
            <span>Description {descShared === MIXED ? `(${MIXED})` : ''}</span>
            <textarea
              className="field-textarea"
              rows={4}
              value={descShared === MIXED ? '' : descShared}
              placeholder={descShared === MIXED ? MIXED : ''}
              onChange={(e) => setFieldOnAll('description', e.target.value || undefined)}
            />
            <p className="field-help">Shown under the title on the canvas, two lines max.</p>
          </label>
          {!multi && node.kind === 'step' ? (
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
            </label>
          ) : null}
          {!multi && node.kind === 'note' ? (
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
          {!multi && node.kind === 'sticky' ? (
            <label className="field">
              <span>Sticky text</span>
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
  edges,
  replaceNode,
  removeEdges,
}: {
  node: DiagramNode
  edges: DiagramEdge[]
  replaceNode: (node: DiagramNode) => void
  removeEdges: (ids: string[]) => void
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
        <DecisionBranchesEditor
          node={node}
          edges={edges}
          onChange={replaceNode}
          onRemoveEdges={removeEdges}
        />
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
      return <RuleBuilder node={node} onChange={replaceNode} />
    case 'group':
    case 'section': {
      const groupColor = resolveColor(node.data.color ?? node.color, 'gray')
      const collapsed = node.data.collapsed === true
      return (
        <section className="side-section">
          <h3 className="side-section-label">Details</h3>
          <label className="field">
            <span>{node.kind === 'section' ? 'Section' : 'Group'} label</span>
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
            Drag nodes onto this container to nest them. Collapsing hides children and their
            connectors.
          </p>
        </section>
      )
    }
    case 'shape':
      return (
        <section className="side-section">
          <h3 className="side-section-label">Shape</h3>
          <label className="field">
            <span>Kind</span>
            <select
              value={node.data.shape}
              onChange={(e) =>
                replaceNode({
                  ...node,
                  data: {
                    ...node.data,
                    shape: e.target.value as 'rect' | 'rounded' | 'diamond' | 'ellipse',
                  },
                })
              }
            >
              <option value="rect">Rectangle</option>
              <option value="rounded">Rounded</option>
              <option value="diamond">Diamond</option>
              <option value="ellipse">Ellipse</option>
            </select>
          </label>
        </section>
      )
    default:
      return null
  }
}
