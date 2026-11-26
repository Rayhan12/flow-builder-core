import { useState } from 'react'
import { Link } from 'react-router-dom'
import { upsertConnection } from '../providers/connections'
import { listAndProbeModels } from '../providers/probe'
import { setSelectedModel } from '../providers/selectedModel'
import {
  CUSTOM_PRESETS,
  PROVIDER_META,
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

  const meta = provider === 'custom' ? null : PROVIDER_META[provider]
  const ollama = CUSTOM_PRESETS.find((p) => p.id === 'ollama')

  async function onSave() {
    if (saving) return
    setSaving(true)
    setError(null)
    try {
      const conn = upsertConnection(uid, {
        provider,
        label: meta?.label ?? 'Custom',
        apiKey: keyDraft,
        ...(provider === 'custom'
          ? { baseUrl: ollama?.baseUrl, preset: 'ollama' as const }
          : {}),
      })
      setSelectedModel(uid, {
        connectionId: conn.id,
        provider: conn.provider,
        model: meta?.defaultModel ?? '',
      })
      // Probe in the background; UI can proceed once the key is saved.
      void listAndProbeModels(uid, conn).catch(() => undefined)
      setKeyDraft('')
      onReady()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save key')
    } finally {
      setSaving(false)
    }
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
        <div className="ai-key-actions">
          <button
            type="button"
            className="btn btn-primary"
            disabled={saving || (provider !== 'custom' && !keyDraft.trim())}
            onClick={() => void onSave()}
          >
            {saving ? 'Saving...' : 'Save key'}
          </button>
          <Link to="/settings" className="settings-link">
            Open Settings
          </Link>
        </div>
      </div>
    </div>
  )
}
