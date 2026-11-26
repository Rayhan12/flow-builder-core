import { Search } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { DiagramNode, NodeKind } from '../schema'
import { resolveColor } from './colors'
import { KIND_META, PALETTE_KINDS } from './kinds'

export type CommandPaletteResult =
  | { type: 'add'; kind: NodeKind }
  | { type: 'focus'; nodeId: string }
  | { type: 'action'; actionId: string }

type Props = {
  open: boolean
  nodes: DiagramNode[]
  onClose: () => void
  onSelect: (result: CommandPaletteResult) => void
  /** Extra action rows (group, align, hide, etc.). */
  actions?: Array<{ id: string; label: string; hint?: string; keywords?: string }>
  /** When false, hide "Add node" rows (view-only mode). */
  allowAdd?: boolean
}

type Row =
  | { key: string; kind: 'action'; actionId: string; label: string; hint: string }
  | { key: string; kind: 'add'; nodeKind: NodeKind; label: string; hint: string }
  | { key: string; kind: 'focus'; nodeId: string; label: string; hint: string }

export function CommandPalette({
  open,
  nodes,
  onClose,
  onSelect,
  actions = [],
  allowAdd = true,
}: Props) {
  if (!open) return null
  return (
    <CommandPaletteDialog
      nodes={nodes}
      onClose={onClose}
      onSelect={onSelect}
      actions={actions}
      allowAdd={allowAdd}
    />
  )
}

function CommandPaletteDialog({
  nodes,
  onClose,
  onSelect,
  actions,
  allowAdd,
}: {
  nodes: DiagramNode[]
  onClose: () => void
  onSelect: (result: CommandPaletteResult) => void
  actions: Array<{ id: string; label: string; hint?: string; keywords?: string }>
  allowAdd: boolean
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
    const actionRows: Row[] = actions
      .filter((a) => {
        if (!q) return true
        return (
          a.label.toLowerCase().includes(q) ||
          (a.hint?.toLowerCase().includes(q) ?? false) ||
          (a.keywords?.toLowerCase().includes(q) ?? false) ||
          a.id.includes(q)
        )
      })
      .map((a) => ({
        key: `action-${a.id}`,
        kind: 'action' as const,
        actionId: a.id,
        label: a.label,
        hint: a.hint ?? 'Action',
      }))

    const addRows: Row[] = !allowAdd
      ? []
      : PALETTE_KINDS.filter((kind) => {
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
        const label = n.kind === 'group' || n.kind === 'section' ? n.data.label : n.label
        return (
          label.toLowerCase().includes(q) ||
          n.kind.includes(q) ||
          (n.description?.toLowerCase().includes(q) ?? false)
        )
      })
      .slice(0, 20)
      .map((n) => {
        const label = n.kind === 'group' || n.kind === 'section' ? n.data.label : n.label
        return {
          key: `focus-${n.id}`,
          kind: 'focus' as const,
          nodeId: n.id,
          label,
          hint: KIND_META[n.kind].label,
        }
      })

    // Prefer actions and find-node hits when searching; otherwise show add + actions.
    if (q) return [...actionRows, ...focusRows, ...addRows]
    return [...actionRows, ...addRows]
  }, [nodes, query, actions, allowAdd])

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
        else if (row.kind === 'focus') onSelect({ type: 'focus', nodeId: row.nodeId })
        else onSelect({ type: 'action', actionId: row.actionId })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [rows, active, onClose, onSelect])

  function pick(row: Row) {
    if (row.kind === 'add') onSelect({ type: 'add', kind: row.nodeKind })
    else if (row.kind === 'focus') onSelect({ type: 'focus', nodeId: row.nodeId })
    else onSelect({ type: 'action', actionId: row.actionId })
  }

  return (
    <div
      className="dialog-backdrop node-search-backdrop"
      role="presentation"
      data-testid="command-palette"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        className="node-search-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Quick actions"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="node-search-field">
          <Search size={16} aria-hidden className="node-search-icon" />
          <input
            ref={inputRef}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Actions, search nodes, or add"
            aria-label="Quick actions"
            autoComplete="off"
            data-testid="command-palette-input"
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
                  : row.kind === 'focus'
                    ? KIND_META[node?.kind ?? 'step']
                    : null
              const Icon = kindMeta?.icon
              const color = resolveColor(
                row.kind === 'add'
                  ? kindMeta!.defaultColor
                  : (node?.color ?? kindMeta?.defaultColor ?? 'slate'),
              )
              return (
                <li key={row.key}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={index === active}
                    className={`node-search-item ${index === active ? 'is-active' : ''}`}
                    data-testid={
                      row.kind === 'action' ? `command-action-${row.actionId}` : undefined
                    }
                    onMouseEnter={() => setActive(index)}
                    onClick={() => pick(row)}
                  >
                    {Icon ? (
                      <span
                        className="palette-item-icon"
                        style={{ background: color.tint, color: color.solid }}
                        aria-hidden
                      >
                        <Icon size={14} strokeWidth={2} />
                      </span>
                    ) : (
                      <span className="palette-item-icon command-action-icon" aria-hidden>
                        /
                      </span>
                    )}
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
