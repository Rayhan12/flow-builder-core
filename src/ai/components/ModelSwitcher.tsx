import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { listConnections } from '../providers/connections'
import { getModelCache, reasonLabel } from '../providers/modelCache'
import {
  getSelectedModel,
  resolveActiveSelection,
  setSelectedModel,
  type SelectedModelRef,
} from '../providers/selectedModel'
import {
  PROVIDER_META,
  type CachedModelStatus,
  type ProviderId,
} from '../providers/types'

type ModelSwitcherProps = {
  uid: string
  value?: SelectedModelRef | null
  onChange?: (ref: SelectedModelRef) => void
  /** Refresh token when connections/cache change. */
  revision?: number
}

type Row = {
  connectionId: string
  provider: ProviderId
  providerLabel: string
  model: CachedModelStatus
}

function providerLabel(id: ProviderId, customLabel?: string): string {
  if (id === 'custom') return customLabel || 'Custom'
  return PROVIDER_META[id].label
}

export function ModelSwitcher({ uid, value, onChange, revision = 0 }: ModelSwitcherProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<SelectedModelRef | null>(
    () => value ?? getSelectedModel(uid) ?? resolveActiveSelection(uid),
  )
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (value) setSelected(value)
  }, [value])

  useEffect(() => {
    setSelected(getSelectedModel(uid) ?? resolveActiveSelection(uid))
  }, [uid, revision])

  useEffect(() => {
    if (!open) return
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const { usable, unavailable } = useMemo(() => {
    const connections = listConnections(uid)
    const usableRows: Row[] = []
    const badRows: Row[] = []
    for (const conn of connections) {
      const cache = getModelCache(uid, conn.id)
      const models = cache?.models ?? []
      const label = providerLabel(conn.provider, conn.label)
      for (const model of models) {
        const row: Row = {
          connectionId: conn.id,
          provider: conn.provider,
          providerLabel: label,
          model,
        }
        if (model.usable) usableRows.push(row)
        else badRows.push(row)
      }
      if (models.length === 0 && conn.apiKey) {
        // Show a placeholder so the user can still pick a known default.
        const fallback =
          conn.provider === 'custom'
            ? null
            : PROVIDER_META[conn.provider].defaultModel
        if (fallback) {
          usableRows.push({
            connectionId: conn.id,
            provider: conn.provider,
            providerLabel: label,
            model: {
              id: fallback,
              usable: true,
              supportsTools: true,
              checkedAt: 0,
            },
          })
        }
      }
    }
    const q = query.trim().toLowerCase()
    const filter = (rows: Row[]) =>
      q
        ? rows.filter(
            (r) =>
              r.model.id.toLowerCase().includes(q) ||
              r.providerLabel.toLowerCase().includes(q),
          )
        : rows
    return { usable: filter(usableRows), unavailable: filter(badRows) }
  }, [uid, revision, query])

  const groupedUsable = useMemo(() => groupByProvider(usable), [usable])
  const display =
    selected?.model ||
    usable[0]?.model.id ||
    'Select model'

  function pick(row: Row) {
    const ref: SelectedModelRef = {
      connectionId: row.connectionId,
      provider: row.provider,
      model: row.model.id,
    }
    setSelectedModel(uid, ref)
    setSelected(ref)
    onChange?.(ref)
    setOpen(false)
    setQuery('')
  }

  return (
    <div className="ai-model-switcher" ref={rootRef} data-testid="ai-model-switcher">
      <button
        type="button"
        className="ai-model-switcher-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="ai-model-switcher-value">{display}</span>
        <ChevronDown size={14} aria-hidden />
      </button>
      {open ? (
        <div className="ai-model-switcher-menu" role="listbox">
          <input
            className="ai-model-switcher-search"
            type="search"
            placeholder="Search models"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search models"
          />
          {groupedUsable.length === 0 && unavailable.length === 0 ? (
            <p className="ai-model-switcher-empty">No models yet. Add a key in Settings.</p>
          ) : null}
          {groupedUsable.map(([label, rows]) => (
            <div key={label} className="ai-model-switcher-group">
              <p className="ai-model-switcher-group-label">{label}</p>
              {rows.map((row) => {
                const active =
                  selected?.connectionId === row.connectionId &&
                  selected?.model === row.model.id
                return (
                  <button
                    key={`${row.connectionId}:${row.model.id}`}
                    type="button"
                    role="option"
                    aria-selected={active}
                    className={`ai-model-switcher-option${active ? ' is-active' : ''}`}
                    onClick={() => pick(row)}
                  >
                    <span>{row.model.id}</span>
                    {row.model.supportsTools ? (
                      <span className="ai-model-tools-badge">Tools</span>
                    ) : null}
                  </button>
                )
              })}
            </div>
          ))}
          {unavailable.length > 0 ? (
            <details className="ai-model-switcher-unavailable">
              <summary>Not available ({unavailable.length})</summary>
              {unavailable.map((row) => (
                <div
                  key={`bad-${row.connectionId}:${row.model.id}`}
                  className="ai-model-switcher-option is-disabled"
                >
                  <span>{row.model.id}</span>
                  <span className="ai-model-reason">{reasonLabel(row.model.reason)}</span>
                </div>
              ))}
            </details>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

function groupByProvider(rows: Row[]): Array<[string, Row[]]> {
  const map = new Map<string, Row[]>()
  for (const row of rows) {
    const list = map.get(row.providerLabel) ?? []
    list.push(row)
    map.set(row.providerLabel, list)
  }
  return [...map.entries()]
}
