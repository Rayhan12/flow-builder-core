import { Search } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { DiagramNode, NodeKind } from '../schema'
import { resolveColor } from './colors'
import { KIND_META, PALETTE_KINDS } from './kinds'

export type NodeSearchResult =
  | { type: 'add'; kind: NodeKind }
  | { type: 'focus'; nodeId: string }

type Props = {
  open: boolean
  nodes: DiagramNode[]
  onClose: () => void
  onSelect: (result: NodeSearchResult) => void
}

type Row =
  | { key: string; kind: 'add'; nodeKind: NodeKind; label: string; hint: string }
  | { key: string; kind: 'focus'; nodeId: string; label: string; hint: string }

export function NodeSearch({ open, nodes, onClose, onSelect }: Props) {
  if (!open) return null
  return <NodeSearchDialog nodes={nodes} onClose={onClose} onSelect={onSelect} />
}

function NodeSearchDialog({
  nodes,
  onClose,
  onSelect,
}: {
  nodes: DiagramNode[]
  onClose: () => void
  onSelect: (result: NodeSearchResult) => void
}) {
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const [prevQuery, setPrevQuery] = useState(query)
  const inputRef = useRef<HTMLInputElement>(null)

  if (query !== prevQuery) {
    setPrevQuery(query)
    setActive(0)
  }

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    const addRows: Row[] = PALETTE_KINDS.filter((kind) => {
      if (!q) return true
      const meta = KIND_META[kind]
      return (
        meta.label.toLowerCase().includes(q) ||
        meta.hint.toLowerCase().includes(q) ||
        kind.includes(q)
      )
    }).map((kind) => ({
      key: `add-${kind}`,
      kind: 'add' as const,
      nodeKind: kind,
      label: `Add ${KIND_META[kind].label}`,
      hint: KIND_META[kind].hint,
    }))

    const focusRows: Row[] = nodes
      .filter((n) => {
        if (!q) return false
        const label = n.kind === 'group' ? n.data.label : n.label
        return (
          label.toLowerCase().includes(q) ||
          n.kind.includes(q) ||
          (n.description?.toLowerCase().includes(q) ?? false)
        )
      })
      .slice(0, 20)
      .map((n) => {
        const label = n.kind === 'group' ? n.data.label : n.label
        return {
          key: `focus-${n.id}`,
          kind: 'focus' as const,
          nodeId: n.id,
          label,
          hint: KIND_META[n.kind].label,
        }
      })

    return [...focusRows, ...addRows]
  }, [nodes, query])

  useEffect(() => {
    const t = window.setTimeout(() => inputRef.current?.focus(), 0)
    return () => window.clearTimeout(t)
  }, [])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
        return
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setActive((i) => Math.min(i + 1, Math.max(rows.length - 1, 0)))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setActive((i) => Math.max(i - 1, 0))
      } else if (e.key === 'Enter') {
        e.preventDefault()
        const row = rows[active]
        if (!row) return
        if (row.kind === 'add') onSelect({ type: 'add', kind: row.nodeKind })
        else onSelect({ type: 'focus', nodeId: row.nodeId })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [rows, active, onClose, onSelect])

  return (
    <div
      className="dialog-backdrop node-search-backdrop"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        className="node-search-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Search nodes"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="node-search-field">
          <Search size={16} aria-hidden className="node-search-icon" />
          <input
            ref={inputRef}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search or add a node"
            aria-label="Search or add a node"
            autoComplete="off"
          />
        </div>
        <ul className="node-search-list" role="listbox">
          {rows.length === 0 ? (
            <li className="node-search-empty">No matches</li>
          ) : (
            rows.map((row, index) => {
              const node =
                row.kind === 'focus' ? nodes.find((n) => n.id === row.nodeId) : undefined
              const kindMeta =
                row.kind === 'add'
                  ? KIND_META[row.nodeKind]
                  : KIND_META[node?.kind ?? 'step']
              const Icon = kindMeta.icon
              const color = resolveColor(
                row.kind === 'add' ? kindMeta.defaultColor : (node?.color ?? kindMeta.defaultColor),
              )
              return (
                <li key={row.key}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={index === active}
                    className={`node-search-item ${index === active ? 'is-active' : ''}`}
                    onMouseEnter={() => setActive(index)}
                    onClick={() => {
                      if (row.kind === 'add') onSelect({ type: 'add', kind: row.nodeKind })
                      else onSelect({ type: 'focus', nodeId: row.nodeId })
                    }}
                  >
                    <span
                      className="palette-item-icon"
                      style={{ background: color.tint, color: color.solid }}
                      aria-hidden
                    >
                      <Icon size={14} strokeWidth={2} />
                    </span>
                    <span className="node-search-item-text">
                      <span className="node-search-item-label">{row.label}</span>
                      <span className="node-search-item-hint">{row.hint}</span>
                    </span>
                  </button>
                </li>
              )
            })
          )}
        </ul>
        <p className="node-search-footer">
          <kbd>↑</kbd>
          <kbd>↓</kbd> to move · <kbd>Enter</kbd> to choose · <kbd>Esc</kbd> to close
        </p>
      </div>
    </div>
  )
}
