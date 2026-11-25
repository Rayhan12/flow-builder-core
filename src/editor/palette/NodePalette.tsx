import { Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { NodeKind } from '../../schema'
import { resolveColor } from '../colors'
import { KIND_META } from '../kinds'

type Props = {
  onAdd: (kind: NodeKind) => void
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

export function NodePalette({ onAdd }: Props) {
  const [query, setQuery] = useState('')

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
      <div className="palette-list">
        {groups.map((group) => (
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
          </section>
        ))}
      </div>
    </aside>
  )
}
