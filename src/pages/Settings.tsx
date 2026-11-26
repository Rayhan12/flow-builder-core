import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AiProvidersSection } from '../ai/components/AiProvidersSection'
import { ModelSwitcher } from '../ai/components/ModelSwitcher'
import { useAuth } from '../auth/useAuth'
import { McpConnectSection } from '../components/McpConnectSection'
import {
  DEFAULT_USER_SETTINGS,
  getUserSettings,
  type UserSettings,
} from '../data/settings'

export function SettingsPage() {
  const { user } = useAuth()
  const uid = user?.uid

  const [settings, setSettings] = useState<UserSettings>(DEFAULT_USER_SETTINGS)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [revision, setRevision] = useState(0)

  useEffect(() => {
    if (!uid) return
    let cancelled = false
    void (async () => {
      try {
        const next = await getUserSettings(uid)
        if (cancelled) return
        setSettings(next)
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

  if (loading) {
    return (
      <div className="page-loading" role="status">
        Loading...
      </div>
    )
  }

  return (
    <div className="settings-page">
      <div className="page-heading-row">
        <div>
          <p className="section-eyebrow">Account</p>
          <h1>Settings</h1>
          <p className="page-subtitle">AI providers, API keys and agent connections.</p>
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

      {uid ? (
        <>
          <AiProvidersSection uid={uid} onChange={() => setRevision((n) => n + 1)} />

          <McpConnectSection uid={uid} />

          <section className="settings-card">
            <p className="section-eyebrow">Default</p>
            <h2>Active model</h2>
            <p className="settings-note">
              Used by the dashboard AI panel, editor chat and AI Create. Remembered per user in this
              browser (model id only, never the key).
            </p>
            <p className="settings-key-status">
              Saved preference: {settings.aiProvider} / {settings.aiModel}
            </p>
            <ModelSwitcher
              uid={uid}
              revision={revision}
              onChange={(ref) =>
                setSettings((s) => ({
                  ...s,
                  aiProvider: ref.provider,
                  aiModel: ref.model,
                }))
              }
            />
          </section>
        </>
      ) : null}
    </div>
  )
}
