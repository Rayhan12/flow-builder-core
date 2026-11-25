import { Eye, EyeOff, Lock, Unlock } from 'lucide-react'
import { useMemo, useState } from 'react'
import { isContainerKind, type DiagramNode } from '../../schema'
import { useEditorStore } from '../../store/editorStore'
import { KIND_META } from '../kinds'
import { sortNodesForCanvas } from '../zOrder'

function layerLabel(node: DiagramNode): string {
  if (node.kind === 'group' || node.kind === 'section') return node.data.label || node.label
  return node.label
}

export function LayersPanel() {
  const diagram = useEditorStore((s) => s.diagram)
  const selectedNodeIds = useEditorStore((s) => s.selectedNodeIds)
  const setSelection = useEditorStore((s) => s.setSelection)
  const toggleHidden = useEditorStore((s) => s.toggleHidden)
  const toggleLocked = useEditorStore((s) => s.toggleLocked)
  const showAllHidden = useEditorStore((s) => s.showAllHidden)
  const [query, setQuery] = useState('')

  const diagramNodes = diagram?.nodes
  const hiddenCount = diagramNodes?.filter((n) => n.hidden).length ?? 0

  const rows = useMemo(() => {
    const nodes = diagramNodes ?? []
    const q = query.trim().toLowerCase()
    const ordered = sortNodesForCanvas(nodes).reverse() // top of list = front
    if (!q) return ordered
    return ordered.filter((n) => {
      const meta = KIND_META[n.kind]
      return (
        layerLabel(n).toLowerCase().includes(q) ||
        meta.label.toLowerCase().includes(q) ||
        n.kind.includes(q)
      )
    })
  }, [diagramNodes, query])

  if (!diagram) return null

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
        {rows.map((node) => {
          const selected = selectedNodeIds.includes(node.id)
          const hidden = node.hidden === true
          const locked = node.locked === true
          const depth = node.parentId ? 1 : 0
          return (
            <li key={node.id}>
              <div
                className={[
                  'layers-row',
                  selected ? 'is-selected' : '',
                  hidden ? 'is-hidden' : '',
                  isContainerKind(node.kind) ? 'is-container' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                style={{ paddingLeft: 8 + depth * 12 }}
                role="option"
                aria-selected={selected}
                data-testid={`layer-row-${node.id}`}
                onClick={() => setSelection([node.id], [])}
              >
                <span className="layers-row-kind">{KIND_META[node.kind].label}</span>
                <span className="layers-row-label">{layerLabel(node)}</span>
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
