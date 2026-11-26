import { useState } from 'react'
import { Link } from 'react-router-dom'
import { formatRelative } from '../../lib/format'
import { listConnections, saveConnectionWithFingerprint } from '../providers/connections'
import {
  reasonLabel,
  saveModelCache,
} from '../providers/modelCache'
import { listAndProbeModels } from '../providers/probe'
import { setSelectedModel } from '../providers/selectedModel'
import {
  CUSTOM_PRESETS,
  PROVIDER_META,
  type CachedModelStatus,
  type ConnectionModelCache,
  type ProviderId,
} from '../providers/types'

type MissingKeyCardProps = {
  uid: string
  onReady: () => void
  /** Compact for panels; full for AI Create. */
  compact?: boolean
}

const QUICK: Array<{ id: ProviderId; label: string; keyUrl: string }> = [
  { id: 'gemini', label: PROVIDER_META.gemini.label, keyUrl: PROVIDER_META.gemini.keyUrl },
  { id: 'anthropic', label: PROVIDER_META.anthropic.label, keyUrl: PROVIDER_META.anthropic.keyUrl },
  { id: 'openai', label: PROVIDER_META.openai.label, keyUrl: PROVIDER_META.openai.keyUrl },
  { id: 'openrouter', label: PROVIDER_META.openrouter.label, keyUrl: PROVIDER_META.openrouter.keyUrl },
]

export function MissingKeyCard({ uid, onReady, compact }: MissingKeyCardProps) {
  const [provider, setProvider] = useState<ProviderId>('gemini')
  const [keyDraft, setKeyDraft] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [progress, setProgress] = useState<string | null>(null)
  const [cache, setCache] = useState<ConnectionModelCache | null>(null)
  const [enabled, setEnabled] = useState<string[]>([])
  const [connId, setConnId] = useState<string | null>(null)
  const [connProvider, setConnProvider] = useState<ProviderId | null>(null)

  const meta = provider === 'custom' ? null : PROVIDER_META[provider]
  const ollama = CUSTOM_PRESETS.find((p) => p.id === 'ollama')

  async function onSave() {
    if (saving) return
    setSaving(true)
    setError(null)
    setProgress('Fetching models...')
    try {
      const conn = await saveConnectionWithFingerprint(uid, {
        provider,
        label: meta?.label ?? 'Custom',
        apiKey: keyDraft,
        ...(provider === 'custom'
          ? { baseUrl: ollama?.baseUrl, preset: 'ollama' as const }
          : {}),
      })
      setConnId(conn.id)
      setConnProvider(conn.provider)
      const result = await listAndProbeModels(uid, conn, {
        mode: 'initial',
        onProgress: (done, total) => setProgress(`Checking models ${done}/${total}`),
      })
      setCache(result)
      setEnabled([...result.enabledModelIds])
      setProgress(null)
      setKeyDraft('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save key')
      setProgress(null)
    } finally {
      setSaving(false)
    }
  }

  function toggle(model: CachedModelStatus, checked: boolean) {
    if (!model.usable) return
    setEnabled((prev) => {
      const set = new Set(prev)
      if (checked) set.add(model.id)
      else set.delete(model.id)
      return [...set]
    })
  }

  function saveEnabledAndContinue() {
    if (!cache || !connId || !connProvider) return
    const usable = new Set(cache.models.filter((m) => m.usable).map((m) => m.id))
    const enabledModelIds = enabled.filter((id) => usable.has(id))
    const next = { ...cache, enabledModelIds }
    saveModelCache(uid, next)
    const first = next.models.find((m) => enabledModelIds.includes(m.id))
    if (first) {
      setSelectedModel(uid, {
        connectionId: connId,
        provider: connProvider,
        model: first.id,
      })
    }
    // Touch listConnections so fingerprint stays attached on the connection record.
    void listConnections(uid)
    onReady()
  }

  if (cache) {
    return (
      <div className={`ai-key-card${compact ? ' is-compact' : ''}`} data-testid="ai-missing-key">
        <p className="ai-key-card-title">Choose models to enable</p>
        <p className="ai-key-card-hint">
          Usable models that support tools are pre-selected. Unusable models cannot be enabled.
          {cache.lastCheckedAt
            ? ` Last checked ${formatRelative(new Date(cache.lastCheckedAt))}.`
            : ''}
        </p>
        <ul className="ai-conn-models" data-testid="ai-model-list">
          {cache.models.map((m) => (
            <li key={m.id} data-testid={`ai-model-row-${m.id}`}>
              <label className="ai-conn-model-check">
                <input
                  type="checkbox"
                  checked={enabled.includes(m.id)}
                  disabled={!m.usable}
                  onChange={(e) => toggle(m, e.target.checked)}
                  aria-label={`Enable ${m.id}`}
                />
                <span>
                  {m.id}
                  {m.supportsTools ? <span className="ai-model-tools-badge">Tools</span> : null}
                </span>
              </label>
              <span className="ai-conn-model-status">
                {m.usable ? 'Usable' : reasonLabel(m.reason)}
              </span>
            </li>
          ))}
        </ul>
        <div className="ai-key-actions">
          <button
            type="button"
            className="btn btn-primary"
            data-testid="ai-save-enabled"
            disabled={enabled.length === 0}
            onClick={() => saveEnabledAndContinue()}
          >
            Save enabled
          </button>
          <Link to="/settings" className="settings-link">
            Open Settings
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className={`ai-key-card${compact ? ' is-compact' : ''}`} data-testid="ai-missing-key">
      <p className="ai-key-card-title">Add an AI provider key</p>
      <p className="ai-key-card-hint">
        Keys stay in this browser and are sent only to the provider you pick. Get a key:
      </p>
      <ul className="ai-key-provider-links">
        {QUICK.map((p) => (
          <li key={p.id}>
            <a href={p.keyUrl} target="_blank" rel="noreferrer">
              {p.label}
            </a>
          </li>
        ))}
      </ul>
      <div className="ai-key-form">
        <label className="field">
          <span>Provider</span>
          <select
            value={provider}
            onChange={(e) => setProvider(e.target.value as ProviderId)}
            aria-label="Provider"
          >
            {QUICK.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
            <option value="custom">Custom / local</option>
          </select>
        </label>
        <label className="field">
          <span>API key</span>
          <input
            type="password"
            autoComplete="off"
            value={keyDraft}
            onChange={(e) => setKeyDraft(e.target.value)}
            placeholder={provider === 'custom' ? 'Optional for Ollama' : 'Paste your API key'}
            spellCheck={false}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                void onSave()
              }
            }}
          />
        </label>
        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}
        {progress ? (
          <p className="settings-key-status" role="status" data-testid="ai-probe-progress">
            {progress}
          </p>
        ) : null}
        <div className="ai-key-actions">
          <button
            type="button"
            className="btn btn-primary"
            disabled={saving || (provider !== 'custom' && !keyDraft.trim())}
            onClick={() => void onSave()}
          >
            {saving ? 'Checking models...' : 'Save key'}
          </button>
          <Link to="/settings" className="settings-link">
            Open Settings
          </Link>
        </div>
      </div>
    </div>
  )
}
