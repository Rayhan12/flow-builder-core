import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { formatRelative } from '../../lib/format'
import {
  ensureConnectionFingerprints,
  listConnections,
  removeConnection,
  saveConnectionWithFingerprint,
} from '../providers/connections'
import {
  clearModelCache,
  getModelCache,
  isKeyFingerprintChanged,
  reasonLabel,
  setEnabledModelIds,
} from '../providers/modelCache'
import { listAndProbeModels, recheckModel } from '../providers/probe'
import { getSelectedModel, setSelectedModel } from '../providers/selectedModel'
import {
  CUSTOM_PRESETS,
  PROVIDER_META,
  type AiConnection,
  type CachedModelStatus,
  type ConnectionModelCache,
  type CustomPresetId,
  type ProviderId,
} from '../providers/types'

type AiProvidersSectionProps = {
  uid: string
  onChange?: () => void
}

type Draft = {
  provider: ProviderId
  label: string
  apiKey: string
  baseUrl: string
  preset: CustomPresetId
  headerKey: string
  headerValue: string
}

const EMPTY: Draft = {
  provider: 'gemini',
  label: '',
  apiKey: '',
  baseUrl: '',
  preset: 'custom',
  headerKey: '',
  headerValue: '',
}

type DraftEnabled = Record<string, string[]>

export function AiProvidersSection({ uid, onChange }: AiProvidersSectionProps) {
  const [connections, setConnections] = useState<AiConnection[]>(() => listConnections(uid))
  const [caches, setCaches] = useState<Record<string, ConnectionModelCache>>({})
  const [keyChanged, setKeyChanged] = useState<Record<string, boolean>>({})
  const [draftEnabled, setDraftEnabled] = useState<DraftEnabled>({})
  const [filter, setFilter] = useState<Record<string, string>>({})
  const [draft, setDraft] = useState<Draft>(EMPTY)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [autoRefreshId, setAutoRefreshId] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    const list = await ensureConnectionFingerprints(uid)
    setConnections(list)
    const next: Record<string, ConnectionModelCache> = {}
    const changed: Record<string, boolean> = {}
    const enabledDraft: DraftEnabled = {}
    for (const c of list) {
      const cache = getModelCache(uid, c)
      if (cache) {
        next[c.id] = cache
        enabledDraft[c.id] = [...cache.enabledModelIds]
      }
      changed[c.id] = isKeyFingerprintChanged(uid, c)
    }
    setCaches(next)
    setKeyChanged(changed)
    setDraftEnabled((prev) => {
      const merged = { ...enabledDraft }
      for (const id of Object.keys(prev)) {
        if (merged[id] === undefined && prev[id]) merged[id] = prev[id]
      }
      return merged
    })
  }, [uid])

  useEffect(() => {
    void refresh()
  }, [refresh])

  // Auto-refresh once when Settings is open and the key fingerprint changed.
  useEffect(() => {
    if (busyId) return
    const pending = connections.find((c) => keyChanged[c.id] && autoRefreshId !== c.id)
    if (!pending) return
    setAutoRefreshId(pending.id)
    setBusyId(pending.id)
    setProgress('Fetching models...')
    setError(null)
    void listAndProbeModels(uid, pending, {
      mode: 'refresh',
      onProgress: (done, total) => setProgress(`Checking models ${done}/${total}`),
    })
      .then((cache) => {
        setCaches((prev) => ({ ...prev, [pending.id]: cache }))
        setDraftEnabled((prev) => ({ ...prev, [pending.id]: [...cache.enabledModelIds] }))
        setKeyChanged((prev) => ({ ...prev, [pending.id]: false }))
        setMessage(`Refreshed ${cache.models.length} models for ${pending.label}.`)
        onChange?.()
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Could not check models')
      })
      .finally(() => {
        setBusyId(null)
        setProgress(null)
        void refresh()
      })
  }, [connections, keyChanged, busyId, autoRefreshId, uid, onChange, refresh])

  function notify() {
    void refresh()
    onChange?.()
  }

  async function probeConnection(conn: AiConnection, mode: 'initial' | 'refresh') {
    setBusyId(conn.id)
    setProgress('Fetching models...')
    setError(null)
    try {
      const cache = await listAndProbeModels(uid, conn, {
        mode,
        onProgress: (done, total) => setProgress(`Checking models ${done}/${total}`),
      })
      const enabledIds = cache.enabledModelIds ?? []
      setCaches((prev) => ({ ...prev, [conn.id]: cache }))
      setDraftEnabled((prev) => ({ ...prev, [conn.id]: [...enabledIds] }))
      setKeyChanged((prev) => ({ ...prev, [conn.id]: false }))
      const firstEnabled = cache.models.find((m) => enabledIds.includes(m.id))
      const selected = getSelectedModel(uid)
      if (firstEnabled && (!selected || selected.connectionId === conn.id)) {
        setSelectedModel(uid, {
          connectionId: conn.id,
          provider: conn.provider,
          model: firstEnabled.id,
        })
      }
      setMessage(
        mode === 'refresh'
          ? `Refreshed ${cache.models.length} models for ${conn.label}.`
          : `Checked ${cache.models.length} models for ${conn.label}. Select which to enable, then save.`,
      )
      notify()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not check models')
      notify()
    } finally {
      setBusyId(null)
      setProgress(null)
    }
  }

  async function onAdd(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setMessage(null)
    try {
      const headers =
        draft.headerKey.trim() && draft.headerValue.trim()
          ? { [draft.headerKey.trim()]: draft.headerValue.trim() }
          : undefined
      const preset = CUSTOM_PRESETS.find((p) => p.id === draft.preset)
      const baseUrl =
        draft.provider === 'custom'
          ? draft.baseUrl.trim() || preset?.baseUrl || ''
          : undefined
      if (draft.provider === 'custom' && !baseUrl) {
        setError('Custom providers need a base URL.')
        return
      }
      if (draft.provider !== 'custom' && !draft.apiKey.trim()) {
        setError('Paste an API key first.')
        return
      }
      const conn = await saveConnectionWithFingerprint(uid, {
        provider: draft.provider,
        label:
          draft.label.trim() ||
          (draft.provider === 'custom'
            ? preset?.label || 'Custom'
            : PROVIDER_META[draft.provider].label),
        apiKey: draft.apiKey,
        baseUrl,
        headers,
        preset: draft.provider === 'custom' ? draft.preset : undefined,
      })
      setDraft(EMPTY)
      notify()
      setMessage(`Saved ${conn.label}. Checking models...`)
      await probeConnection(conn, 'initial')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save connection')
    }
  }

  function onForget(conn: AiConnection) {
    removeConnection(uid, conn.id)
    clearModelCache(uid, conn.id)
    notify()
    setMessage(`Removed ${conn.label}.`)
  }

  async function onRecheckOne(conn: AiConnection, modelId: string) {
    setBusyId(conn.id)
    try {
      await recheckModel(uid, conn, modelId)
      notify()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Recheck failed')
    } finally {
      setBusyId(null)
    }
  }

  function toggleEnabled(connId: string, model: CachedModelStatus, checked: boolean) {
    if (!model.usable) return
    setDraftEnabled((prev) => {
      const cur = new Set(prev[connId] ?? [])
      if (checked) cur.add(model.id)
      else cur.delete(model.id)
      return { ...prev, [connId]: [...cur] }
    })
  }

  function selectAllUsable(conn: AiConnection, cache: ConnectionModelCache) {
    setDraftEnabled((prev) => ({
      ...prev,
      [conn.id]: cache.models.filter((m) => m.usable).map((m) => m.id),
    }))
  }

  function clearEnabled(conn: AiConnection) {
    setDraftEnabled((prev) => ({ ...prev, [conn.id]: [] }))
  }

  function saveEnabled(conn: AiConnection) {
    const ids = draftEnabled[conn.id] ?? []
    const next = setEnabledModelIds(uid, conn, ids)
    if (next) {
      setCaches((prev) => ({ ...prev, [conn.id]: next }))
      const first = next.models.find((m) => next.enabledModelIds.includes(m.id))
      if (first) {
        const selected = getSelectedModel(uid)
        if (!selected || selected.connectionId === conn.id) {
          setSelectedModel(uid, {
            connectionId: conn.id,
            provider: conn.provider,
            model: first.id,
          })
        }
      }
      setMessage(`Saved ${next.enabledModelIds.length} enabled model(s) for ${conn.label}.`)
      notify()
    }
  }

  return (
    <section className="settings-card" data-testid="ai-providers-settings">
      <p className="section-eyebrow">AI</p>
      <h2>AI providers</h2>
      <p className="settings-note">
        Add one or more provider connections. Keys stay in this browser and are never sent to our
        servers. After saving a key, pick which models to enable.
      </p>

      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      {message ? (
        <p className="form-success" role="status">
          {message}
        </p>
      ) : null}
      {progress ? (
        <p className="settings-key-status" role="status" data-testid="ai-probe-progress">
          {progress}
        </p>
      ) : null}

      <ul className="ai-conn-list">
        {connections.map((conn) => {
          const cache = caches[conn.id]
          const usable = cache?.models.filter((m) => m.usable).length ?? 0
          const total = cache?.models.length ?? 0
          const enabled = draftEnabled[conn.id] ?? cache?.enabledModelIds ?? []
          const q = (filter[conn.id] ?? '').trim().toLowerCase()
          const models = (cache?.models ?? []).filter((m) =>
            q ? m.id.toLowerCase().includes(q) || (m.displayName ?? '').toLowerCase().includes(q) : true,
          )
          const lastChecked = cache?.lastCheckedAt
            ? formatRelative(new Date(cache.lastCheckedAt))
            : null
          return (
            <li key={conn.id} className="ai-conn-item" data-testid={`ai-conn-${conn.id}`}>
              <div className="ai-conn-head">
                <div>
                  <strong>{conn.label}</strong>
                  <p className="settings-key-status">
                    {conn.provider}
                    {conn.baseUrl ? ` · ${conn.baseUrl}` : ''}
                    {conn.apiKey ? ` · key ${maskKey(conn.apiKey)}` : ' · no key'}
                    {total > 0 ? ` · ${usable}/${total} usable` : ''}
                    {enabled.length > 0 ? ` · ${enabled.length} enabled` : ''}
                  </p>
                  {keyChanged[conn.id] ? (
                    <p className="form-error" role="status" data-testid="ai-key-changed">
                      Key changed, refresh needed
                    </p>
                  ) : null}
                  {lastChecked && !keyChanged[conn.id] ? (
                    <p className="settings-key-status" data-testid="ai-last-checked">
                      Last checked {lastChecked}
                    </p>
                  ) : null}
                  {cache?.listError ? (
                    <p className="form-error" role="alert">
                      List failed: {cache.listError}
                    </p>
                  ) : null}
                </div>
                <div className="settings-actions">
                  <button
                    type="button"
                    className="btn btn-secondary"
                    disabled={busyId === conn.id}
                    data-testid="ai-refresh-models"
                    onClick={() => void probeConnection(conn, 'refresh')}
                  >
                    Refresh models
                  </button>
                  <button type="button" className="btn btn-ghost" onClick={() => onForget(conn)}>
                    Forget
                  </button>
                </div>
              </div>

              {cache && cache.models.length > 0 ? (
                <div className="ai-conn-model-panel">
                  <div className="ai-conn-model-toolbar">
                    <input
                      className="ai-conn-model-search"
                      type="search"
                      placeholder="Filter models"
                      value={filter[conn.id] ?? ''}
                      onChange={(e) =>
                        setFilter((prev) => ({ ...prev, [conn.id]: e.target.value }))
                      }
                      aria-label={`Filter models for ${conn.label}`}
                    />
                    <button
                      type="button"
                      className="btn btn-ghost btn-tiny"
                      onClick={() => selectAllUsable(conn, cache)}
                    >
                      Select all usable
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-tiny"
                      onClick={() => clearEnabled(conn)}
                    >
                      Clear
                    </button>
                    <button
                      type="button"
                      className="btn btn-primary btn-tiny"
                      data-testid="ai-save-enabled"
                      onClick={() => saveEnabled(conn)}
                    >
                      Save enabled
                    </button>
                  </div>
                  <ul className="ai-conn-models" data-testid="ai-model-list">
                    {models.map((m) => {
                      const checked = enabled.includes(m.id)
                      return (
                        <li key={m.id} data-testid={`ai-model-row-${m.id}`}>
                          <label className="ai-conn-model-check">
                            <input
                              type="checkbox"
                              checked={checked}
                              disabled={!m.usable}
                              onChange={(e) => toggleEnabled(conn.id, m, e.target.checked)}
                              aria-label={`Enable ${m.id}`}
                            />
                            <span>
                              {m.id}
                              {m.supportsTools ? (
                                <span className="ai-model-tools-badge">Tools</span>
                              ) : null}
                              {m.isNew ? (
                                <span className="ai-model-new-badge" data-testid="ai-model-new">
                                  New
                                </span>
                              ) : null}
                            </span>
                          </label>
                          <span className="ai-conn-model-status">
                            {m.usable ? 'Usable' : reasonLabel(m.reason)}
                            <button
                              type="button"
                              className="btn btn-ghost btn-tiny"
                              disabled={busyId === conn.id}
                              onClick={() => void onRecheckOne(conn, m.id)}
                            >
                              Re-check
                            </button>
                          </span>
                        </li>
                      )
                    })}
                  </ul>
                </div>
              ) : (
                <p className="settings-key-status">
                  {busyId === conn.id
                    ? 'Checking models...'
                    : 'No model list yet. Save a key or click Refresh models.'}
                </p>
              )}
            </li>
          )
        })}
      </ul>

      <form className="settings-form" onSubmit={(e) => void onAdd(e)} data-testid="ai-add-connection">
        <h3 className="ai-conn-add-title">Add connection</h3>
        <label className="field">
          <span>Provider</span>
          <select
            value={draft.provider}
            aria-label="Provider"
            onChange={(e) => {
              const provider = e.target.value as ProviderId
              setDraft((d) => ({
                ...d,
                provider,
                label: provider === 'custom' ? d.label : PROVIDER_META[provider].label,
              }))
            }}
          >
            {(Object.keys(PROVIDER_META) as Array<Exclude<ProviderId, 'custom'>>).map((id) => (
              <option key={id} value={id}>
                {PROVIDER_META[id].label}
              </option>
            ))}
            <option value="custom">Custom OpenAI-compatible</option>
          </select>
        </label>
        <label className="field">
          <span>Label</span>
          <input
            value={draft.label}
            onChange={(e) => setDraft((d) => ({ ...d, label: e.target.value }))}
            placeholder="My Gemini key"
          />
        </label>
        {draft.provider === 'custom' ? (
          <>
            <label className="field">
              <span>Preset</span>
              <select
                value={draft.preset}
                aria-label="Custom preset"
                onChange={(e) => {
                  const preset = e.target.value as CustomPresetId
                  const found = CUSTOM_PRESETS.find((p) => p.id === preset)
                  setDraft((d) => ({
                    ...d,
                    preset,
                    baseUrl: found?.baseUrl || d.baseUrl,
                    label: d.label || found?.label || 'Custom',
                  }))
                }}
              >
                {CUSTOM_PRESETS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Base URL</span>
              <input
                value={draft.baseUrl}
                onChange={(e) => setDraft((d) => ({ ...d, baseUrl: e.target.value }))}
                placeholder="https://api.example.com/v1"
                spellCheck={false}
              />
            </label>
            <div className="ai-conn-headers">
              <label className="field">
                <span>Extra header (optional)</span>
                <input
                  value={draft.headerKey}
                  onChange={(e) => setDraft((d) => ({ ...d, headerKey: e.target.value }))}
                  placeholder="Header name"
                />
              </label>
              <label className="field">
                <span>Header value</span>
                <input
                  value={draft.headerValue}
                  onChange={(e) => setDraft((d) => ({ ...d, headerValue: e.target.value }))}
                  placeholder="Value"
                />
              </label>
            </div>
            {CUSTOM_PRESETS.find((p) => p.id === draft.preset)?.keyUrl ? (
              <a
                className="settings-link"
                href={CUSTOM_PRESETS.find((p) => p.id === draft.preset)?.keyUrl}
                target="_blank"
                rel="noreferrer"
              >
                Get a key
              </a>
            ) : null}
          </>
        ) : (
          <a
            className="settings-link"
            href={PROVIDER_META[draft.provider].keyUrl}
            target="_blank"
            rel="noreferrer"
          >
            Get a key
          </a>
        )}
        <label className="field">
          <span>API key</span>
          <input
            type="password"
            autoComplete="off"
            value={draft.apiKey}
            onChange={(e) => setDraft((d) => ({ ...d, apiKey: e.target.value }))}
            placeholder={
              draft.provider === 'custom' && (draft.preset === 'ollama' || draft.preset === 'lmstudio')
                ? 'Optional'
                : 'Paste API key'
            }
            spellCheck={false}
          />
        </label>
        <div className="settings-actions">
          <button type="submit" className="btn btn-primary">
            Save connection
          </button>
        </div>
      </form>
    </section>
  )
}

function maskKey(key: string): string {
  if (key.length <= 8) return '••••••••'
  return `${key.slice(0, 4)}…${key.slice(-4)}`
}
