import { PanelLeftClose, PanelLeftOpen, Search } from 'lucide-react'
import { LogoMark } from '../../assets/brand'
import { useCallback, useEffect, useMemo, useState, type DragEvent } from 'react'
import type { NodeKind, ShapeType } from '../../schema'
import { resolveColor } from '../colors'
import { KIND_META, PALETTE_GROUPS, type PaletteItem } from '../kinds'
import { ShapePreview } from '../nodes/ShapePreview'
import { setPaletteDragData } from '../paletteDrop'
import { CollapseSection } from '../ui/CollapseToggle'

type Props = {
  onAdd: (kind: NodeKind, options?: { shape?: ShapeType }) => void
  diagramTitle?: string
}

const COLLAPSE_KEY = 'flow-builder.palette-collapsed'
const GROUP_OPEN_KEY = 'flow-builder.palette-group-open'

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSE_KEY) === '1'
  } catch {
    return false
  }
}

function readGroupOpen(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(GROUP_OPEN_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Record<string, boolean>
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

export function NodePalette({ onAdd, diagramTitle = 'Untitled diagram' }: Props) {
  const [query, setQuery] = useState('')
  const [collapsed, setCollapsed] = useState(readCollapsed)
  const [groupOpen, setGroupOpen] = useState<Record<string, boolean>>(() => {
    const stored = readGroupOpen()
    const next: Record<string, boolean> = {}
    for (const g of PALETTE_GROUPS) {
      next[g.id] = stored[g.id] ?? true
    }
    return next
  })
  const [draggingId, setDraggingId] = useState<string | null>(null)

  useEffect(() => {
    try {
      localStorage.setItem(COLLAPSE_KEY, collapsed ? '1' : '0')
    } catch {
      // ignore
    }
  }, [collapsed])

  useEffect(() => {
    try {
      localStorage.setItem(GROUP_OPEN_KEY, JSON.stringify(groupOpen))
    } catch {
      // ignore
    }
  }, [groupOpen])

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase()
    return PALETTE_GROUPS.map((group) => {
      const items = group.items.filter((item) => {
        if (!q) return true
        const meta = KIND_META[item.kind]
        return (
          item.label.toLowerCase().includes(q) ||
          item.hint.toLowerCase().includes(q) ||
          item.kind.includes(q) ||
          meta.label.toLowerCase().includes(q) ||
          group.label.toLowerCase().includes(q) ||
          (item.shape?.includes(q) ?? false)
        )
      })
      return { ...group, items }
    }).filter((group) => group.items.length > 0)
  }, [query])

  const flatItems = useMemo(() => groups.flatMap((g) => g.items), [groups])

  const onDragStart = useCallback((item: PaletteItem, event: DragEvent) => {
    setPaletteDragData(event.dataTransfer, { kind: item.kind, shape: item.shape })
    setDraggingId(item.id)
  }, [])

  const onDragEnd = useCallback(() => {
    setDraggingId(null)
  }, [])

  function addItem(item: PaletteItem) {
    onAdd(item.kind, item.shape ? { shape: item.shape } : undefined)
  }

  return (
    <aside
      className={`node-palette ${collapsed ? 'is-collapsed' : ''}`}
      aria-label="Node palette"
      data-collapsed={collapsed ? 'true' : 'false'}
      data-testid="node-palette"
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
            data-testid="palette-search"
          />
        </div>
      ) : null}

      <div className={`palette-list ${collapsed ? 'is-rail' : ''}`}>
        {collapsed
          ? flatItems.map((item) => {
              const meta = KIND_META[item.kind]
              const color = resolveColor(meta.defaultColor)
              const Icon = meta.icon
              return (
                <button
                  key={item.id}
                  type="button"
                  className={`palette-item palette-item-rail ${draggingId === item.id ? 'is-dragging' : ''}`}
                  draggable
                  title={`${item.label}: ${item.hint}`}
                  aria-label={`Add ${item.label}`}
                  data-palette-kind={item.kind}
                  data-palette-item={item.id}
                  data-palette-shape={item.shape}
                  onDragStart={(e) => onDragStart(item, e)}
                  onDragEnd={onDragEnd}
                  onClick={() => addItem(item)}
                >
                  <span
                    className="palette-item-icon"
                    style={{ background: color.tint, color: color.solid }}
                    aria-hidden
                  >
                    {item.shape ? (
                      <ShapePreview shape={item.shape} size={16} color={color.solid} />
                    ) : (
                      <Icon size={14} strokeWidth={2} />
                    )}
                  </span>
                  <span className="palette-item-chip" style={{ background: color.solid }} aria-hidden />
                </button>
              )
            })
          : groups.map((group) => (
              <CollapseSection
                key={group.id}
                open={groupOpen[group.id] !== false}
                onToggle={() =>
                  setGroupOpen((prev) => ({
                    ...prev,
                    [group.id]: !(prev[group.id] !== false),
                  }))
                }
                title={group.label}
                testId={`palette-group-${group.id}`}
                className="palette-group"
              >
                <ul className="palette-group-items">
                  {group.items.map((item) => {
                    const meta = KIND_META[item.kind]
                    const color = resolveColor(meta.defaultColor)
                    const Icon = meta.icon
                    return (
                      <li key={item.id}>
                        <button
                          type="button"
                          className={`palette-item ${draggingId === item.id ? 'is-dragging' : ''}`}
                          draggable
                          title={`${item.label}: ${item.hint}`}
                          aria-label={`Add ${item.label}`}
                          data-palette-kind={item.kind}
                          data-palette-item={item.id}
                          data-palette-shape={item.shape}
                          onDragStart={(e) => onDragStart(item, e)}
                          onDragEnd={onDragEnd}
                          onClick={() => addItem(item)}
                        >
                          <span
                            className="palette-item-icon"
                            style={{ background: color.tint, color: color.solid }}
                            aria-hidden
                          >
                            {item.shape ? (
                              <ShapePreview shape={item.shape} size={16} color={color.solid} />
                            ) : (
                              <Icon size={14} strokeWidth={2} />
                            )}
                          </span>
                          <span
                            className="palette-item-chip"
                            style={{ background: color.solid }}
                            aria-hidden
                          />
                          <span className="palette-item-text">
                            <span className="palette-item-label">{item.label}</span>
                            <span className="palette-item-hint">{item.hint}</span>
                          </span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </CollapseSection>
            ))}
      </div>
    </aside>
  )
}
