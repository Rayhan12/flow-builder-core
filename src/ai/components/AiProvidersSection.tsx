import { useCallback, useEffect, useState, type FormEvent } from 'react'
import {
  listConnections,
  removeConnection,
  upsertConnection,
} from '../providers/connections'
import { clearModelCache, getModelCache, reasonLabel } from '../providers/modelCache'
import { listAndProbeModels, recheckModel } from '../providers/probe'
import { getSelectedModel, setSelectedModel } from '../providers/selectedModel'
import {
  CUSTOM_PRESETS,
  PROVIDER_META,
  type AiConnection,
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

export function AiProvidersSection({ uid, onChange }: AiProvidersSectionProps) {
  const [connections, setConnections] = useState<AiConnection[]>(() => listConnections(uid))
  const [caches, setCaches] = useState<Record<string, ConnectionModelCache>>({})
  const [draft, setDraft] = useState<Draft>(EMPTY)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState<string | null>(null)

  const refresh = useCallback(() => {
    const list = listConnections(uid)
    setConnections(list)
    const next: Record<string, ConnectionModelCache> = {}
    for (const c of list) {
      const cache = getModelCache(uid, c.id)
      if (cache) next[c.id] = cache
    }
    setCaches(next)
  }, [uid])

  useEffect(() => {
    refresh()
  }, [refresh])

  function notify() {
    refresh()
    onChange?.()
  }

  async function probeConnection(conn: AiConnection) {
    setBusyId(conn.id)
    setProgress('Checking models...')
    setError(null)
    try {
      const cache = await listAndProbeModels(uid, conn, {
        onProgress: (done, total) => setProgress(`Checking models ${done}/${total}`),
      })
      setCaches((prev) => ({ ...prev, [conn.id]: cache }))
      const usable = cache.models.find((m) => m.usable)
      const selected = getSelectedModel(uid)
      if (usable && (!selected || selected.connectionId === conn.id)) {
        setSelectedModel(uid, {
          connectionId: conn.id,
          provider: conn.provider,
          model: usable.id,
        })
      }
      setMessage(`Checked ${cache.models.length} models for ${conn.label}.`)
      notify()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not check models')
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
      const conn = upsertConnection(uid, {
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
      await probeConnection(conn)
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

  return (
    <section className="settings-card" data-testid="ai-providers-settings">
      <p className="section-eyebrow">AI</p>
      <h2>AI providers</h2>
      <p className="settings-note">
        Add one or more provider connections. Keys stay in this browser and are never sent to our
        servers.
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
        <p className="settings-key-status" role="status">
          {progress}
        </p>
      ) : null}

      <ul className="ai-conn-list">
        {connections.map((conn) => {
          const cache = caches[conn.id]
          const usable = cache?.models.filter((m) => m.usable).length ?? 0
          const total = cache?.models.length ?? 0
          return (
            <li key={conn.id} className="ai-conn-item">
              <div className="ai-conn-head">
                <div>
                  <strong>{conn.label}</strong>
                  <p className="settings-key-status">
                    {conn.provider}
                    {conn.baseUrl ? ` · ${conn.baseUrl}` : ''}
                    {conn.apiKey ? ` · key ${maskKey(conn.apiKey)}` : ' · no key'}
                    {total > 0 ? ` · ${usable}/${total} usable` : ''}
                  </p>
                </div>
                <div className="settings-actions">
                  <button
                    type="button"
                    className="btn btn-secondary"
                    disabled={busyId === conn.id}
                    onClick={() => void probeConnection(conn)}
                  >
                    Re-check
                  </button>
                  <button type="button" className="btn btn-ghost" onClick={() => onForget(conn)}>
                    Forget
                  </button>
                </div>
              </div>
              {cache && cache.models.length > 0 ? (
                <ul className="ai-conn-models">
                  {cache.models.slice(0, 12).map((m) => (
                    <li key={m.id}>
                      <span>
                        {m.id}
                        {m.supportsTools ? (
                          <span className="ai-model-tools-badge">Tools</span>
                        ) : null}
                      </span>
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
                  ))}
                  {cache.models.length > 12 ? (
                    <li className="settings-key-status">
                      +{cache.models.length - 12} more in the model switcher
                    </li>
                  ) : null}
                </ul>
              ) : null}
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
