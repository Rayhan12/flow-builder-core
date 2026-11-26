import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronDown } from 'lucide-react'
import { listConnections } from '../providers/connections'
import { getEnabledModels, getModelCache } from '../providers/modelCache'
import {
  getSelectedModel,
  needsModelSetup,
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

/**
 * Shows only stored enabled models. Never lists, probes, or invents placeholders.
 * Zero provider fetch calls on mount or open.
 */
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

  const enabledRows = useMemo(() => {
    const connections = listConnections(uid)
    const rows: Row[] = []
    for (const conn of connections) {
      const models = getEnabledModels(uid, conn)
      const label = providerLabel(conn.provider, conn.label)
      for (const model of models) {
        rows.push({
          connectionId: conn.id,
          provider: conn.provider,
          providerLabel: label,
          model,
        })
      }
    }
    const q = query.trim().toLowerCase()
    if (!q) return rows
    return rows.filter(
      (r) =>
        r.model.id.toLowerCase().includes(q) ||
        r.providerLabel.toLowerCase().includes(q),
    )
  }, [uid, revision, query])

  const setupNeeded = useMemo(() => {
    if (enabledRows.length > 0) return false
    return needsModelSetup(uid) || listConnections(uid).some((c) => getModelCache(uid, c) == null)
  }, [uid, revision, enabledRows.length])

  const grouped = useMemo(() => groupByProvider(enabledRows), [enabledRows])
  const display =
    selected?.model ||
    enabledRows[0]?.model.id ||
    (setupNeeded ? 'Set up models' : 'Select model')

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
          {enabledRows.length > 0 ? (
            <input
              className="ai-model-switcher-search"
              type="search"
              placeholder="Search models"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Search models"
            />
          ) : null}
          {enabledRows.length === 0 ? (
            <p className="ai-model-switcher-empty" data-testid="ai-model-setup-link">
              {setupNeeded || listConnections(uid).length > 0 ? (
                <>
                  <Link to="/settings" className="settings-link" onClick={() => setOpen(false)}>
                    Set up models in Settings
                  </Link>
                </>
              ) : (
                <>
                  No models yet.{' '}
                  <Link to="/settings" className="settings-link" onClick={() => setOpen(false)}>
                    Add a key in Settings
                  </Link>
                </>
              )}
            </p>
          ) : null}
          {grouped.map(([label, rows]) => (
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
