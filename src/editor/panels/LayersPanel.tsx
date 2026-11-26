import { ChevronDown, ChevronRight, Eye, EyeOff, Lock, Unlock } from 'lucide-react'
import { useMemo, useRef, useState, type DragEvent } from 'react'
import { isContainerKind, type DiagramNode } from '../../schema'
import { useEditorStore, type LayerPlacement } from '../../store/editorStore'
import { KIND_META } from '../kinds'
import { effectiveZIndex } from '../zOrder'

function layerLabel(node: DiagramNode): string {
  if (node.kind === 'group' || node.kind === 'section') return node.data.label || node.label
  return node.label
}

type LayerRow = { node: DiagramNode; depth: number; hasChildren: boolean }

type DropTarget = { id: string; placement: LayerPlacement }

/** Front-most layer first, matching the list order users expect. */
function orderSiblings(nodes: DiagramNode[], all: DiagramNode[]): DiagramNode[] {
  return [...nodes].sort((a, b) => {
    const z = effectiveZIndex(b) - effectiveZIndex(a)
    if (z !== 0) return z
    return all.indexOf(b) - all.indexOf(a)
  })
}

function buildRows(
  nodes: DiagramNode[],
  collapsed: Set<string>,
  query: string,
): LayerRow[] {
  const ids = new Set(nodes.map((n) => n.id))
  const children = new Map<string | undefined, DiagramNode[]>()
  for (const node of nodes) {
    const key = node.parentId && ids.has(node.parentId) ? node.parentId : undefined
    const list = children.get(key) ?? []
    list.push(node)
    children.set(key, list)
  }

  const q = query.trim().toLowerCase()
  const matches = (n: DiagramNode) => {
    if (!q) return true
    return (
      layerLabel(n).toLowerCase().includes(q) ||
      KIND_META[n.kind].label.toLowerCase().includes(q) ||
      n.kind.includes(q)
    )
  }

  const rows: LayerRow[] = []
  const visit = (parentId: string | undefined, depth: number) => {
    for (const node of orderSiblings(children.get(parentId) ?? [], nodes)) {
      const kids = children.get(node.id) ?? []
      if (q) {
        // While searching, flatten the tree so every hit is visible.
        if (matches(node)) rows.push({ node, depth, hasChildren: false })
        visit(node.id, depth + 1)
        continue
      }
      rows.push({ node, depth, hasChildren: kids.length > 0 })
      if (kids.length > 0 && !collapsed.has(node.id)) visit(node.id, depth + 1)
    }
  }
  visit(undefined, 0)
  return rows
}

function placementFor(e: DragEvent<HTMLElement>, container: boolean): LayerPlacement {
  const rect = e.currentTarget.getBoundingClientRect()
  const ratio = rect.height > 0 ? (e.clientY - rect.top) / rect.height : 0.5
  if (container) {
    if (ratio < 0.25) return 'before'
    if (ratio > 0.75) return 'after'
    return 'inside'
  }
  return ratio < 0.5 ? 'before' : 'after'
}

export function LayersPanel() {
  const diagram = useEditorStore((s) => s.diagram)
  const selectedNodeIds = useEditorStore((s) => s.selectedNodeIds)
  const setSelection = useEditorStore((s) => s.setSelection)
  const toggleHidden = useEditorStore((s) => s.toggleHidden)
  const toggleLocked = useEditorStore((s) => s.toggleLocked)
  const showAllHidden = useEditorStore((s) => s.showAllHidden)
  const renameNode = useEditorStore((s) => s.renameNode)
  const reorderLayer = useEditorStore((s) => s.reorderLayer)
  const [query, setQuery] = useState('')
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set())
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [dragId, setDragId] = useState<string | null>(null)
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null)
  const skipCommit = useRef(false)

  const diagramNodes = diagram?.nodes
  const hiddenCount = diagramNodes?.filter((n) => n.hidden).length ?? 0

  const rows = useMemo(
    () => buildRows(diagramNodes ?? [], collapsed, query),
    [diagramNodes, collapsed, query],
  )

  if (!diagram) return null

  function startRename(node: DiagramNode) {
    setEditingId(node.id)
    setDraft(layerLabel(node))
    skipCommit.current = false
  }

  function commitRename() {
    if (editingId && !skipCommit.current) renameNode(editingId, draft)
    skipCommit.current = false
    setEditingId(null)
  }

  function toggleCollapsed(id: string) {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function endDrag() {
    setDragId(null)
    setDropTarget(null)
  }

  return (
    <aside className="layers-panel" aria-label="Layers" data-testid="layers-panel">
      <div className="layers-panel-header">
        <h2 className="layers-panel-title">Layers</h2>
        {hiddenCount > 0 ? (
          <button
            type="button"
            className="btn btn-ghost"
            data-testid="show-all-hidden"
            onClick={() => showAllHidden()}
          >
            Show all hidden
          </button>
        ) : null}
      </div>
      <label className="field layers-search">
        <span className="sr-only">Search layers</span>
        <input
          value={query}
          placeholder="Search layers"
          aria-label="Search layers"
          onChange={(e) => setQuery(e.target.value)}
        />
      </label>
      <ul className="layers-list" role="listbox" aria-label="Layer list">
        {rows.map(({ node, depth, hasChildren }) => {
          const selected = selectedNodeIds.includes(node.id)
          const hidden = node.hidden === true
          const locked = node.locked === true
          const container = isContainerKind(node.kind)
          const editing = editingId === node.id
          const isCollapsed = collapsed.has(node.id)
          const drop = dropTarget?.id === node.id ? dropTarget.placement : null
          return (
            <li key={node.id}>
              <div
                className={[
                  'layers-row',
                  selected ? 'is-selected' : '',
                  hidden ? 'is-hidden' : '',
                  container ? 'is-container' : '',
                  dragId === node.id ? 'is-dragging' : '',
                  drop ? `is-drop-${drop}` : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                style={{ paddingLeft: 8 + depth * 14 }}
                role="option"
                aria-selected={selected}
                data-testid={`layer-row-${node.id}`}
                draggable={!editing && !locked}
                onClick={() => setSelection([node.id], [])}
                onDragStart={(e) => {
                  e.dataTransfer.effectAllowed = 'move'
                  e.dataTransfer.setData('text/plain', node.id)
                  setDragId(node.id)
                }}
                onDragOver={(e) => {
                  if (!dragId || dragId === node.id) return
                  e.preventDefault()
                  e.dataTransfer.dropEffect = 'move'
                  const placement = placementFor(e, container)
                  if (dropTarget?.id !== node.id || dropTarget.placement !== placement) {
                    setDropTarget({ id: node.id, placement })
                  }
                }}
                onDragLeave={(e) => {
                  if (e.currentTarget.contains(e.relatedTarget as Node | null)) return
                  setDropTarget((t) => (t?.id === node.id ? null : t))
                }}
                onDrop={(e) => {
                  e.preventDefault()
                  if (dragId && dragId !== node.id) {
                    reorderLayer(dragId, node.id, placementFor(e, container))
                  }
                  endDrag()
                }}
                onDragEnd={endDrag}
              >
                {hasChildren ? (
                  <button
                    type="button"
                    className="layers-chevron"
                    aria-label={isCollapsed ? `Expand ${layerLabel(node)}` : `Collapse ${layerLabel(node)}`}
                    aria-expanded={!isCollapsed}
                    data-testid={`layer-toggle-${node.id}`}
                    onClick={(e) => {
                      e.stopPropagation()
                      toggleCollapsed(node.id)
                    }}
                  >
                    {isCollapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
                  </button>
                ) : (
                  <span className="layers-chevron-spacer" aria-hidden />
                )}
                <span className="layers-row-kind">{KIND_META[node.kind].label}</span>
                {editing ? (
                  <input
                    className="layers-rename-input"
                    value={draft}
                    autoFocus
                    maxLength={200}
                    aria-label={`Rename ${layerLabel(node)}`}
                    data-testid={`layer-rename-${node.id}`}
                    onFocus={(e) => e.currentTarget.select()}
                    onClick={(e) => e.stopPropagation()}
                    onDoubleClick={(e) => e.stopPropagation()}
                    onChange={(e) => setDraft(e.target.value)}
                    onBlur={commitRename}
                    onKeyDown={(e) => {
                      e.stopPropagation()
                      if (e.key === 'Enter') e.currentTarget.blur()
                      if (e.key === 'Escape') {
                        skipCommit.current = true
                        e.currentTarget.blur()
                      }
                    }}
                  />
                ) : (
                  <span
                    className="layers-row-label"
                    title="Double-click to rename"
                    onDoubleClick={(e) => {
                      e.stopPropagation()
                      startRename(node)
                    }}
                  >
                    {layerLabel(node)}
                  </span>
                )}
                <button
                  type="button"
                  className="btn btn-ghost btn-icon layers-eye"
                  aria-label={hidden ? `Show ${layerLabel(node)}` : `Hide ${layerLabel(node)}`}
                  data-testid={`layer-eye-${node.id}`}
                  onClick={(e) => {
                    e.stopPropagation()
                    toggleHidden([node.id])
                  }}
                >
                  {hidden ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-icon"
                  aria-label={locked ? `Unlock ${layerLabel(node)}` : `Lock ${layerLabel(node)}`}
                  data-testid={`layer-lock-${node.id}`}
                  onClick={(e) => {
                    e.stopPropagation()
                    toggleLocked([node.id])
                  }}
                >
                  {locked ? <Lock size={14} /> : <Unlock size={14} />}
                </button>
              </div>
            </li>
          )
        })}
      </ul>
    </aside>
  )
}
