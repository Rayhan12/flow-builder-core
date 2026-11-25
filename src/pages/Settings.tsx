import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { forgetApiKey, getApiKey, hasApiKey, setApiKey } from '../ai/keyStorage'
import { useAuth } from '../auth/useAuth'
import {
  DEFAULT_USER_SETTINGS,
  GEMINI_MODELS,
  getUserSettings,
  updateUserSettings,
  type UserSettings,
} from '../data/settings'

export function SettingsPage() {
  const { user } = useAuth()
  const uid = user?.uid

  const [settings, setSettings] = useState<UserSettings>(DEFAULT_USER_SETTINGS)
  const [keyDraft, setKeyDraft] = useState('')
  const [keySaved, setKeySaved] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!uid) return
    let cancelled = false
    void (async () => {
      try {
        const next = await getUserSettings(uid)
        if (cancelled) return
        setSettings(next)
        setKeySaved(hasApiKey(uid))
        setLoading(false)
      } catch (err) {
        if (cancelled) return
        setError(err instanceof Error ? err.message : 'Could not load settings')
        setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [uid])

  async function onSaveProvider(e: FormEvent) {
    e.preventDefault()
    if (!uid || saving) return
    setSaving(true)
    setError(null)
    setMessage(null)
    try {
      const next = await updateUserSettings(uid, {
        aiProvider: 'gemini',
        aiModel: settings.aiModel,
      })
      setSettings(next)
      setMessage('Settings saved.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save settings')
    } finally {
      setSaving(false)
    }
  }

  function onSaveKey(e: FormEvent) {
    e.preventDefault()
    if (!uid) return
    setError(null)
    setMessage(null)
    try {
      setApiKey(uid, keyDraft)
      setKeyDraft('')
      setKeySaved(true)
      setMessage('API key saved in this browser.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save API key')
    }
  }

  function onForgetKey() {
    if (!uid) return
    forgetApiKey(uid)
    setKeySaved(false)
    setKeyDraft('')
    setMessage('API key removed from this browser.')
    setError(null)
  }

  if (loading) {
    return (
      <div className="page-loading" role="status">
        Loading...
      </div>
    )
  }

  const existingHint = uid && keySaved ? maskKey(getApiKey(uid) ?? '') : null

  return (
    <div className="settings-page">
      <div className="page-heading-row">
        <div>
          <p className="section-eyebrow">Account</p>
          <h1>Settings</h1>
          <p className="page-subtitle">AI provider and your personal API key.</p>
        </div>
        <Link to="/" className="btn btn-secondary">
          Back to home
        </Link>
      </div>

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

      <section className="settings-card">
        <p className="section-eyebrow">Keys</p>
        <h2>Gemini API key</h2>
        <p className="settings-note">
          Your key stays in this browser. It is sent only to the AI provider you pick.
        </p>
        {existingHint ? (
          <p className="settings-key-status">
            Key on this device: <code>{existingHint}</code>
          </p>
        ) : (
          <p className="settings-key-status">No key saved yet.</p>
        )}
        <form className="settings-form" onSubmit={onSaveKey}>
          <label className="field">
            <span>{keySaved ? 'Replace key' : 'API key'}</span>
            <input
              type="password"
              name="apiKey"
              autoComplete="off"
              value={keyDraft}
              onChange={(e) => setKeyDraft(e.target.value)}
              placeholder="Paste your Gemini API key"
              spellCheck={false}
            />
          </label>
          <div className="settings-actions">
            <button type="submit" className="btn btn-primary" disabled={!keyDraft.trim()}>
              Save key
            </button>
            {keySaved ? (
              <button type="button" className="btn btn-ghost" onClick={onForgetKey}>
                Forget key
              </button>
            ) : null}
            <a
              className="settings-link"
              href="https://aistudio.google.com/apikey"
              target="_blank"
              rel="noreferrer"
            >
              Get a key
            </a>
          </div>
        </form>
      </section>

      <section className="settings-card">
        <p className="section-eyebrow">Provider</p>
        <h2>Model</h2>
        <form className="settings-form" onSubmit={(e) => void onSaveProvider(e)}>
          <label className="field">
            <span>Provider</span>
            <select value="gemini" disabled aria-label="AI provider">
              <option value="gemini">Gemini</option>
            </select>
          </label>
          <label className="field">
            <span>Model</span>
            <select
              value={settings.aiModel}
              onChange={(e) => setSettings((s) => ({ ...s, aiModel: e.target.value }))}
              aria-label="AI model"
            >
              {GEMINI_MODELS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
              {!GEMINI_MODELS.includes(settings.aiModel as (typeof GEMINI_MODELS)[number]) ? (
                <option value={settings.aiModel}>{settings.aiModel}</option>
              ) : null}
            </select>
          </label>
          <div className="settings-actions">
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Saving...' : 'Save model'}
            </button>
          </div>
        </form>
      </section>
    </div>
  )
}

function maskKey(key: string): string {
  if (key.length <= 8) return '••••••••'
  return `${key.slice(0, 4)}…${key.slice(-4)}`
}
