import { createElement, useCallback, useMemo, useRef, useState } from 'react'
import { useDismiss } from '../../hooks/useDismiss'
import {
  BringToFront,
  Copy,
  Eye,
  EyeOff,
  Lock,
  MoreHorizontal,
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
import { DesignSection } from './DesignSection'
import { RuleBuilder } from './RuleBuilder'

type PanelTab = 'design' | 'settings' | 'look' | 'notes'

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
  const updateEdge = useEditorStore((s) => s.updateEdge)
  const updateEdges = useEditorStore((s) => s.updateEdges)
  const removeNodes = useEditorStore((s) => s.removeNodes)
  const removeEdges = useEditorStore((s) => s.removeEdges)
  const setNodeParent = useEditorStore((s) => s.setNodeParent)
  const clearSelection = useEditorStore((s) => s.clearSelection)
  const toggleHidden = useEditorStore((s) => s.toggleHidden)
  const toggleLocked = useEditorStore((s) => s.toggleLocked)
  const reorderZ = useEditorStore((s) => s.reorderZ)
  const duplicateSelection = useEditorStore((s) => s.duplicateSelection)
  const selectSimilar = useEditorStore((s) => s.selectSimilar)
  const [tab, setTab] = useState<PanelTab>('design')
  const [overflowOpen, setOverflowOpen] = useState(false)
  const overflowRef = useRef<HTMLDivElement>(null)
  const selectionKey = `${selectedNodeIds.join(',')}|${selectedEdgeIds.join(',')}`
  const dismissOverflow = useCallback(() => setOverflowOpen(false), [])
  useDismiss({
    open: overflowOpen,
    onDismiss: dismissOverflow,
    rootRef: overflowRef,
    selectionKey,
    routeKey: typeof window !== 'undefined' ? window.location.pathname : undefined,
  })

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
          <label className="field">
            <span>Type</span>
            <select
              data-testid="edge-type"
              value={sharedValue(selectedEdges.map((e) => e.type ?? 'elbow'))}
              onChange={(e) =>
                updateEdges(selectedEdgeIds, {
                  type: e.target.value as 'elbow' | 'straight' | 'curved',
                })
              }
            >
              <option value="elbow">Elbow</option>
              <option value="straight">Straight</option>
              <option value="curved">Curved</option>
            </select>
          </label>
          <label className="field">
            <span>Start marker</span>
            <select
              data-testid="edge-start-marker"
              value={sharedValue(selectedEdges.map((e) => e.startMarker ?? 'none'))}
              onChange={(e) =>
                updateEdges(selectedEdgeIds, {
                  startMarker: e.target.value as
                    | 'none'
                    | 'arrow'
                    | 'arrowFilled'
                    | 'circle'
                    | 'diamond',
                })
              }
            >
              <option value="none">None</option>
              <option value="arrow">Arrow</option>
              <option value="arrowFilled">Filled arrow</option>
              <option value="circle">Circle</option>
              <option value="diamond">Diamond</option>
            </select>
          </label>
          <label className="field">
            <span>End marker</span>
            <select
              data-testid="edge-end-marker"
              value={sharedValue(selectedEdges.map((e) => e.endMarker ?? 'arrowFilled'))}
              onChange={(e) =>
                updateEdges(selectedEdgeIds, {
                  endMarker: e.target.value as
                    | 'none'
                    | 'arrow'
                    | 'arrowFilled'
                    | 'circle'
                    | 'diamond',
                })
              }
            >
              <option value="none">None</option>
              <option value="arrow">Arrow</option>
              <option value="arrowFilled">Filled arrow</option>
              <option value="circle">Circle</option>
              <option value="diamond">Diamond</option>
            </select>
          </label>
          <label className="field">
            <span>Stroke width</span>
            <select
              data-testid="edge-stroke-width"
              value={String(
                sharedValue(selectedEdges.map((e) => String(e.style?.width ?? 2))),
              )}
              onChange={(e) => {
                const width = Number(e.target.value)
                for (const edge of selectedEdges) {
                  updateEdge(edge.id, {
                    style: { ...(edge.style ?? {}), width },
                  })
                }
              }}
            >
              <option value="1">1</option>
              <option value="2">2</option>
              <option value="3">3</option>
              <option value="4">4</option>
            </select>
          </label>
          <label className="field">
            <span>Stroke</span>
            <select
              data-testid="edge-dash"
              value={sharedValue(selectedEdges.map((e) => e.style?.dash ?? 'solid'))}
              onChange={(e) => {
                const dash = e.target.value as 'solid' | 'dashed'
                for (const edge of selectedEdges) {
                  updateEdge(edge.id, {
                    style: { ...(edge.style ?? {}), dash },
                  })
                }
              }}
            >
              <option value="solid">Solid</option>
              <option value="dashed">Dashed</option>
            </select>
          </label>
          <label className="field">
            <span>Colour</span>
            <input
              data-testid="edge-color"
              type="color"
              value={
                resolveColor(
                  selectedEdges[0]?.style?.color ?? selectedEdges[0]?.color,
                  'gray',
                ).solid
              }
              onChange={(e) => {
                const color = e.target.value
                for (const edge of selectedEdges) {
                  updateEdge(edge.id, {
                    style: { ...(edge.style ?? {}), color },
                  })
                }
              }}
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

      <div
        className="side-panel-quick"
        role="toolbar"
        aria-label="Selection actions"
        data-testid="properties-toolbar"
      >
        <button
          type="button"
          className="side-panel-action"
          aria-label={anyHidden ? 'Show' : 'Hide'}
          title={anyHidden ? 'Show' : 'Hide'}
          data-testid="properties-hide"
          onClick={() => toggleHidden(selectedNodeIds)}
        >
          {anyHidden ? <EyeOff size={14} /> : <Eye size={14} />}
          <span>{anyHidden ? 'Show' : 'Hide'}</span>
        </button>
        <button
          type="button"
          className="side-panel-action"
          aria-label={anyLocked ? 'Unlock' : 'Lock'}
          title={anyLocked ? 'Unlock' : 'Lock'}
          data-testid="properties-lock"
          onClick={() => toggleLocked(selectedNodeIds)}
        >
          {anyLocked ? <Unlock size={14} /> : <Lock size={14} />}
          <span>{anyLocked ? 'Unlock' : 'Lock'}</span>
        </button>
        <button
          type="button"
          className="side-panel-action"
          aria-label="Duplicate"
          title="Duplicate"
          data-testid="properties-duplicate"
          onClick={() => duplicateSelection()}
        >
          <Copy size={14} />
          <span>Duplicate</span>
        </button>
        <button
          type="button"
          className="side-panel-action"
          aria-label="Bring forward"
          title="Bring forward"
          data-testid="properties-bring-forward"
          onClick={() => reorderZ(selectedNodeIds, 'forward')}
        >
          <BringToFront size={14} />
          <span>Forward</span>
        </button>
        <button
          type="button"
          className="side-panel-action"
          aria-label="Send backward"
          title="Send backward"
          data-testid="properties-send-backward"
          onClick={() => reorderZ(selectedNodeIds, 'backward')}
        >
          <SendToBack size={14} />
          <span>Back</span>
        </button>
        <div className="side-panel-overflow" ref={overflowRef}>
          <button
            type="button"
            className="side-panel-action"
            aria-label="More actions"
            aria-expanded={overflowOpen}
            title="More"
            data-testid="properties-more"
            onClick={() => setOverflowOpen((v) => !v)}
          >
            <MoreHorizontal size={14} />
            <span>More</span>
          </button>
          {overflowOpen ? (
            <div className="side-panel-overflow-menu" role="menu" data-testid="properties-more-menu">
              <button
                type="button"
                role="menuitem"
                className="side-panel-overflow-item"
                onClick={() => {
                  reorderZ(selectedNodeIds, 'front')
                  setOverflowOpen(false)
                }}
              >
                Bring to front
              </button>
              <button
                type="button"
                role="menuitem"
                className="side-panel-overflow-item"
                onClick={() => {
                  reorderZ(selectedNodeIds, 'back')
                  setOverflowOpen(false)
                }}
              >
                Send to back
              </button>
              <button
                type="button"
                role="menuitem"
                className="side-panel-overflow-item"
                data-testid="properties-select-similar"
                onClick={() => {
                  selectSimilar()
                  setOverflowOpen(false)
                }}
              >
                Select similar
              </button>
              <button
                type="button"
                role="menuitem"
                className="side-panel-overflow-item is-danger"
                data-testid="properties-delete"
                onClick={() => {
                  removeNodes(selectedNodeIds)
                  setOverflowOpen(false)
                }}
              >
                Delete
              </button>
            </div>
          ) : null}
        </div>
      </div>

      {!multi ? (
        <section className="side-section" data-testid="what-is-this">
          <h3 className="side-section-label">What is this?</h3>
          <p className="side-hint">{meta.description}</p>
          <p className="field-help">Example: {meta.example}</p>
        </section>
      ) : null}

      <div className="side-panel-tabs" role="tablist" aria-label="Node panel sections">
        {(
          [
            ['design', 'Design'],
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

      {tab === 'design' ? <DesignSection nodes={selectedNodes} allNodes={diagram.nodes} /> : null}

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
            <p className="field-help">Shown under the title on the canvas. Long text can expand inline.</p>
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
    case 'switch':
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
        <section className="side-section" data-testid="shape-properties">
          <h3 className="side-section-label">Shape</h3>
          <label className="field">
            <span>Swap shape</span>
            <select
              value={node.data.shape}
              data-testid="swap-shape"
              aria-label="Swap shape"
              onChange={(e) =>
                replaceNode({
                  ...node,
                  data: {
                    ...node.data,
                    shape: e.target.value as typeof node.data.shape,
                  },
                })
              }
            >
              <option value="rect">Rectangle</option>
              <option value="rounded">Rounded</option>
              <option value="diamond">Diamond</option>
              <option value="ellipse">Ellipse</option>
              <option value="parallelogram">Parallelogram</option>
              <option value="cylinder">Cylinder</option>
              <option value="document">Document</option>
              <option value="hexagon">Hexagon</option>
              <option value="triangle">Triangle</option>
            </select>
          </label>
          <label className="field">
            <span>Text</span>
            <input
              value={node.data.text ?? ''}
              onChange={(e) =>
                replaceNode({
                  ...node,
                  data: { ...node.data, text: e.target.value },
                  label: e.target.value || node.label,
                })
              }
            />
          </label>
          <label className="field">
            <span>Fill</span>
            <input
              type="color"
              value={node.style?.fill?.startsWith('#') ? node.style.fill : '#f1f5f9'}
              onChange={(e) =>
                replaceNode({
                  ...node,
                  style: { ...node.style, fill: e.target.value },
                })
              }
            />
          </label>
          <label className="field">
            <span>Stroke</span>
            <input
              type="color"
              value={node.style?.stroke?.startsWith('#') ? node.style.stroke : '#64748b'}
              onChange={(e) =>
                replaceNode({
                  ...node,
                  style: { ...node.style, stroke: e.target.value },
                })
              }
            />
          </label>
          <label className="field">
            <span>Stroke width</span>
            <input
              type="number"
              min={1}
              max={8}
              step={0.5}
              value={node.style?.strokeWidth ?? 1.5}
              onChange={(e) =>
                replaceNode({
                  ...node,
                  style: { ...node.style, strokeWidth: Number(e.target.value) || 1.5 },
                })
              }
            />
          </label>
        </section>
      )
    case 'loop':
    case 'delay':
    case 'subflow':
    case 'error':
    case 'database':
    case 'inputForm':
    case 'output':
    case 'score':
    case 'lookup':
    case 'actor':
    case 'approval':
    case 'notification':
    case 'timer':
    case 'event':
    case 'callout':
    case 'image':
    case 'link':
    case 'parallelSplit':
    case 'parallelJoin':
      return <KindDetailsSection node={node} replaceNode={replaceNode} />
    default:
      return null
  }
}

function KindDetailsSection({
  node,
  replaceNode,
}: {
  node: DiagramNode
  replaceNode: (node: DiagramNode) => void
}) {
  const title = KIND_META[node.kind]?.label ?? 'Details'
  return (
    <section className="side-section" data-testid={`details-${node.kind}`}>
      <h3 className="side-section-label">{title}</h3>
      {node.kind === 'loop' ? (
        <label className="field">
          <span>Collection</span>
          <input
            value={node.data?.collection ?? ''}
            onChange={(e) =>
              replaceNode({ ...node, data: { ...node.data, collection: e.target.value } })
            }
          />
        </label>
      ) : null}
      {node.kind === 'delay' ? (
        <label className="field">
          <span>Duration (ms)</span>
          <input
            type="number"
            value={node.data?.durationMs ?? 0}
            onChange={(e) =>
              replaceNode({
                ...node,
                data: { ...node.data, durationMs: Number(e.target.value) || 0 },
              })
            }
          />
        </label>
      ) : null}
      {node.kind === 'subflow' ? (
        <>
          <label className="field">
            <span>Diagram id</span>
            <input
              value={node.data?.diagramId ?? ''}
              onChange={(e) =>
                replaceNode({ ...node, data: { ...node.data, diagramId: e.target.value } })
              }
            />
          </label>
          <label className="field">
            <span>Diagram title</span>
            <input
              value={node.data?.diagramTitle ?? ''}
              onChange={(e) =>
                replaceNode({ ...node, data: { ...node.data, diagramTitle: e.target.value } })
              }
            />
          </label>
        </>
      ) : null}
      {node.kind === 'error' ? (
        <>
          <label className="field">
            <span>Code</span>
            <input
              value={node.data?.code ?? ''}
              onChange={(e) =>
                replaceNode({ ...node, data: { ...node.data, code: e.target.value } })
              }
            />
          </label>
          <label className="field">
            <span>Message</span>
            <input
              value={node.data?.message ?? ''}
              onChange={(e) =>
                replaceNode({ ...node, data: { ...node.data, message: e.target.value } })
              }
            />
          </label>
        </>
      ) : null}
      {node.kind === 'database' ? (
        <>
          <label className="field">
            <span>Operation</span>
            <select
              value={node.data?.operation ?? 'query'}
              onChange={(e) =>
                replaceNode({
                  ...node,
                  data: {
                    ...node.data,
                    operation: e.target.value as 'read' | 'write' | 'query' | 'upsert',
                  },
                })
              }
            >
              <option value="read">Read</option>
              <option value="write">Write</option>
              <option value="query">Query</option>
              <option value="upsert">Upsert</option>
            </select>
          </label>
          <label className="field">
            <span>Collection</span>
            <input
              value={node.data?.collection ?? ''}
              onChange={(e) =>
                replaceNode({ ...node, data: { ...node.data, collection: e.target.value } })
              }
            />
          </label>
        </>
      ) : null}
      {node.kind === 'notification' ? (
        <label className="field">
          <span>Channel</span>
          <select
            value={node.data?.channel ?? 'email'}
            onChange={(e) =>
              replaceNode({
                ...node,
                data: {
                  ...node.data,
                  channel: e.target.value as 'email' | 'sms' | 'push',
                },
              })
            }
          >
            <option value="email">Email</option>
            <option value="sms">SMS</option>
            <option value="push">Push</option>
          </select>
        </label>
      ) : null}
      {node.kind === 'image' ? (
        <label className="field">
          <span>Image URL</span>
          <input
            value={node.data?.url ?? ''}
            onChange={(e) =>
              replaceNode({ ...node, data: { ...node.data, url: e.target.value } })
            }
          />
        </label>
      ) : null}
      {node.kind === 'link' ? (
        <label className="field">
          <span>URL</span>
          <input
            value={node.data?.href ?? ''}
            onChange={(e) =>
              replaceNode({ ...node, data: { ...node.data, href: e.target.value } })
            }
          />
        </label>
      ) : null}
      {node.kind === 'callout' ? (
        <label className="field">
          <span>Text</span>
          <textarea
            value={node.data?.text ?? ''}
            rows={3}
            onChange={(e) =>
              replaceNode({ ...node, data: { ...node.data, text: e.target.value } })
            }
          />
        </label>
      ) : null}
      {node.kind === 'score' ? (
        <>
          <label className="field">
            <span>Model</span>
            <input
              value={node.data?.model ?? ''}
              onChange={(e) =>
                replaceNode({ ...node, data: { ...node.data, model: e.target.value } })
              }
            />
          </label>
          <label className="field">
            <span>Threshold</span>
            <input
              type="number"
              value={node.data?.threshold ?? 0}
              onChange={(e) =>
                replaceNode({
                  ...node,
                  data: { ...node.data, threshold: Number(e.target.value) || 0 },
                })
              }
            />
          </label>
        </>
      ) : null}
      {node.kind === 'lookup' ? (
        <>
          <label className="field">
            <span>Table</span>
            <input
              value={node.data?.table ?? ''}
              onChange={(e) =>
                replaceNode({ ...node, data: { ...node.data, table: e.target.value } })
              }
            />
          </label>
          <label className="field">
            <span>Key field</span>
            <input
              value={node.data?.keyField ?? ''}
              onChange={(e) =>
                replaceNode({ ...node, data: { ...node.data, keyField: e.target.value } })
              }
            />
          </label>
        </>
      ) : null}
      {node.kind === 'actor' ? (
        <label className="field">
          <span>Role</span>
          <input
            value={node.data?.role ?? ''}
            onChange={(e) =>
              replaceNode({ ...node, data: { ...node.data, role: e.target.value } })
            }
          />
        </label>
      ) : null}
      {node.kind === 'timer' ? (
        <label className="field">
          <span>Cron</span>
          <input
            value={node.data?.cron ?? ''}
            onChange={(e) =>
              replaceNode({ ...node, data: { ...node.data, cron: e.target.value } })
            }
          />
        </label>
      ) : null}
      {node.kind === 'event' ? (
        <label className="field">
          <span>Event name</span>
          <input
            value={node.data?.eventName ?? ''}
            onChange={(e) =>
              replaceNode({ ...node, data: { ...node.data, eventName: e.target.value } })
            }
          />
        </label>
      ) : null}
      {node.kind === 'output' ? (
        <label className="field">
          <span>Format</span>
          <input
            value={node.data?.format ?? ''}
            onChange={(e) =>
              replaceNode({ ...node, data: { ...node.data, format: e.target.value } })
            }
          />
        </label>
      ) : null}
      {node.kind === 'parallelJoin' ? (
        <label className="field">
          <span>Wait for</span>
          <select
            value={node.data?.waitFor ?? 'all'}
            onChange={(e) =>
              replaceNode({
                ...node,
                data: { ...node.data, waitFor: e.target.value as 'all' | 'any' },
              })
            }
          >
            <option value="all">All</option>
            <option value="any">Any</option>
          </select>
        </label>
      ) : null}
    </section>
  )
}
