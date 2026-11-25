import { Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { NodeKind } from '../../schema'
import { resolveColor } from '../colors'
import { KIND_META, PALETTE_KINDS } from '../kinds'

type Props = {
  onAdd: (kind: NodeKind) => void
}

export function NodePalette({ onAdd }: Props) {
  const [query, setQuery] = useState('')

  const kinds = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return PALETTE_KINDS
    return PALETTE_KINDS.filter((kind) => {
      const meta = KIND_META[kind]
      return (
        meta.label.toLowerCase().includes(q) ||
        meta.hint.toLowerCase().includes(q) ||
        kind.includes(q)
      )
    })
  }, [query])

  return (
    <aside className="node-palette" aria-label="Node palette">
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
      <ul className="palette-list">
        {kinds.map((kind) => {
          const meta = KIND_META[kind]
          const color = resolveColor(meta.defaultColor)
          const Icon = meta.icon
          return (
            <li key={kind}>
              <button
                type="button"
                className="palette-item"
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData('application/flow-builder-kind', kind)
                  e.dataTransfer.effectAllowed = 'move'
                }}
                onClick={() => onAdd(kind)}
              >
                <span
                  className="palette-item-icon"
                  style={{ background: color.tint, color: color.solid }}
                  aria-hidden
                >
                  <Icon size={14} strokeWidth={2} />
                </span>
                <span className="palette-item-text">
                  <span className="palette-item-label">{meta.label}</span>
                  <span className="palette-item-hint">{meta.hint}</span>
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </aside>
  )
}
