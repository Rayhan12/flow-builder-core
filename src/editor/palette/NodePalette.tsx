import { PanelLeftClose, PanelLeftOpen, Search } from 'lucide-react'
import { LogoMark } from '../../assets/brand'
import { useCallback, useEffect, useMemo, useState, type DragEvent } from 'react'
import type { NodeKind } from '../../schema'
import { resolveColor } from '../colors'
import { KIND_META } from '../kinds'
import { setPaletteDragData } from '../paletteDrop'

type Props = {
  onAdd: (kind: NodeKind) => void
  diagramTitle?: string
}

type PaletteGroup = {
  id: string
  label: string
  kinds: NodeKind[]
}

const PALETTE_GROUPS: PaletteGroup[] = [
  { id: 'flow', label: 'Flow', kinds: ['start', 'end', 'step', 'group'] },
  { id: 'logic', label: 'Logic', kinds: ['decision', 'rule'] },
  { id: 'data', label: 'Data', kinds: ['mapping', 'integration'] },
  { id: 'other', label: 'Other', kinds: ['note'] },
]

const COLLAPSE_KEY = 'flow-builder.palette-collapsed'

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSE_KEY) === '1'
  } catch {
    return false
  }
}

export function NodePalette({ onAdd, diagramTitle = 'Untitled diagram' }: Props) {
  const [query, setQuery] = useState('')
  const [collapsed, setCollapsed] = useState(readCollapsed)
  const [draggingKind, setDraggingKind] = useState<NodeKind | null>(null)

  useEffect(() => {
    try {
      localStorage.setItem(COLLAPSE_KEY, collapsed ? '1' : '0')
    } catch {
      // ignore
    }
  }, [collapsed])

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase()
    return PALETTE_GROUPS.map((group) => {
      const kinds = group.kinds.filter((kind) => {
        if (!q) return true
        const meta = KIND_META[kind]
        return (
          meta.label.toLowerCase().includes(q) ||
          meta.hint.toLowerCase().includes(q) ||
          kind.includes(q) ||
          group.label.toLowerCase().includes(q)
        )
      })
      return { ...group, kinds }
    }).filter((group) => group.kinds.length > 0)
  }, [query])

  const flatKinds = useMemo(() => groups.flatMap((g) => g.kinds), [groups])

  const onDragStart = useCallback((kind: NodeKind, event: DragEvent) => {
    setPaletteDragData(event.dataTransfer, kind)
    setDraggingKind(kind)
  }, [])

  const onDragEnd = useCallback(() => {
    setDraggingKind(null)
  }, [])

  return (
    <aside
      className={`node-palette ${collapsed ? 'is-collapsed' : ''}`}
      aria-label="Node palette"
      data-collapsed={collapsed ? 'true' : 'false'}
    >
      <div className="palette-header">
        {!collapsed ? (
          <div className="palette-breadcrumb">
            <LogoMark size={14} title="" className="palette-breadcrumb-icon" />
            <div className="palette-breadcrumb-text">
              <span className="palette-breadcrumb-project">Diagrams</span>
              <span className="palette-breadcrumb-diagram" title={diagramTitle}>
                {diagramTitle}
              </span>
            </div>
          </div>
        ) : (
          <span className="palette-rail-brand" aria-hidden>
            <LogoMark size={16} title="" />
          </span>
        )}
        <button
          type="button"
          className="btn btn-ghost btn-icon palette-collapse-btn"
          aria-label={collapsed ? 'Expand palette' : 'Collapse palette'}
          aria-pressed={collapsed}
          title={collapsed ? 'Expand palette' : 'Collapse palette'}
          onClick={() => setCollapsed((v) => !v)}
        >
          {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
        </button>
      </div>

      {!collapsed ? (
        <div className="palette-search">
          <Search size={14} aria-hidden className="palette-search-icon" />
          <input
            type="search"
            placeholder="Search nodes"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search nodes"
          />
        </div>
      ) : null}

      <div className={`palette-list ${collapsed ? 'is-rail' : ''}`}>
        {collapsed
          ? flatKinds.map((kind) => {
              const meta = KIND_META[kind]
              const color = resolveColor(meta.defaultColor)
              const Icon = meta.icon
              return (
                <button
                  key={kind}
                  type="button"
                  className={`palette-item palette-item-rail ${draggingKind === kind ? 'is-dragging' : ''}`}
                  draggable
                  title={`${meta.label}: ${meta.hint}`}
                  aria-label={`Add ${meta.label}`}
                  onDragStart={(e) => onDragStart(kind, e)}
                  onDragEnd={onDragEnd}
                  onClick={() => onAdd(kind)}
                >
                  <span
                    className="palette-item-icon"
                    style={{ background: color.tint, color: color.solid }}
                    aria-hidden
                  >
                    <Icon size={14} strokeWidth={2} />
                  </span>
                  <span className="palette-item-chip" style={{ background: color.solid }} aria-hidden />
                </button>
              )
            })
          : groups.map((group) => (
              <section key={group.id} className="palette-group" aria-label={group.label}>
                <h3 className="palette-group-label">{group.label}</h3>
                <ul className="palette-group-items">
                  {group.kinds.map((kind) => {
                    const meta = KIND_META[kind]
                    const color = resolveColor(meta.defaultColor)
                    const Icon = meta.icon
                    return (
                      <li key={kind}>
                        <button
                          type="button"
                          className={`palette-item ${draggingKind === kind ? 'is-dragging' : ''}`}
                          draggable
                          onDragStart={(e) => onDragStart(kind, e)}
                          onDragEnd={onDragEnd}
                          onClick={() => onAdd(kind)}
                        >
                          <span
                            className="palette-item-icon"
                            style={{ background: color.tint, color: color.solid }}
                            aria-hidden
                          >
                            <Icon size={14} strokeWidth={2} />
                          </span>
                          <span
                            className="palette-item-chip"
                            style={{ background: color.solid }}
                            aria-hidden
                          />
                          <span className="palette-item-text">
                            <span className="palette-item-label">{meta.label}</span>
                            <span className="palette-item-hint">{meta.hint}</span>
                          </span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </section>
            ))}
      </div>
    </aside>
  )
}
