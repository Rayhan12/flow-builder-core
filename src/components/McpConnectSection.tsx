import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import {
  createMcpToken,
  listMcpTokens,
  revokeMcpToken,
  type CreatedMcpToken,
  type McpTokenListItem,
} from '../data/mcpTokens'
import { formatRelative } from '../lib/format'

const DEFAULT_MCP_URL = 'https://flow-builder-core.vercel.app/api/mcp'

function mcpUrl(): string {
  const fromEnv = import.meta.env.VITE_MCP_URL
  return typeof fromEnv === 'string' && fromEnv.trim() ? fromEnv.trim() : DEFAULT_MCP_URL
}

function cursorSnippet(url: string, token: string): string {
  return JSON.stringify(
    {
      mcpServers: {
        'flow-builder': {
          url,
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      },
    },
    null,
    2,
  )
}

function claudeSnippet(url: string, token: string): string {
  return `npx mcp-remote ${url} --header "Authorization: Bearer ${token}"`
}

function genericSnippet(url: string, token: string): string {
  return `POST ${url}
Authorization: Bearer ${token}
Content-Type: application/json
Accept: application/json, text/event-stream`
}

type Props = {
  uid: string
}

export function McpConnectSection({ uid }: Props) {
  const url = useMemo(() => mcpUrl(), [])
  const [tokens, setTokens] = useState<McpTokenListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [name, setName] = useState('Cursor')
  const [created, setCreated] = useState<CreatedMcpToken | null>(null)
  const [copied, setCopied] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    const next = await listMcpTokens(uid)
    setTokens(next)
  }, [uid])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        await refresh()
        if (!cancelled) setLoading(false)
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Could not load tokens')
          setLoading(false)
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [refresh])

  async function onCreate(e: FormEvent) {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    setError(null)
    setCopied(null)
    try {
      const next = await createMcpToken(uid, name)
      setCreated(next)
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create token')
    } finally {
      setBusy(false)
    }
  }

  async function onRevoke(hash: string) {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      await revokeMcpToken(uid, hash)
      if (created?.hash === hash) setCreated(null)
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not revoke token')
    } finally {
      setBusy(false)
    }
  }

  async function copyText(label: string, text: string) {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(label)
      window.setTimeout(() => setCopied((c) => (c === label ? null : c)), 2000)
    } catch {
      setError('Could not copy to clipboard')
    }
  }

  const active = tokens.filter((t) => !t.revoked)
  const revoked = tokens.filter((t) => t.revoked)

  return (
    <section className="settings-card" data-testid="mcp-connect-section">
      <p className="section-eyebrow">Agents</p>
      <h2>Connect your AI agent</h2>
      <p className="settings-note">
        Create a personal token so Cursor, Claude Desktop or another MCP client can read and edit
        your projects. Tokens are shown once; only a hash is stored.
      </p>

      <div className="mcp-url-row">
        <label className="field">
          <span className="field-label">MCP URL</span>
          <input className="input" readOnly value={url} data-testid="mcp-url" />
        </label>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => void copyText('url', url)}
        >
          {copied === 'url' ? 'Copied' : 'Copy URL'}
        </button>
      </div>

      <form className="settings-form mcp-create-form" onSubmit={onCreate}>
        <label className="field">
          <span className="field-label">Token name</span>
          <input
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={80}
            placeholder="Cursor"
            data-testid="mcp-token-name"
          />
        </label>
        <div className="settings-actions">
          <button type="submit" className="btn btn-primary" disabled={busy} data-testid="mcp-create-token">
            Create token
          </button>
        </div>
      </form>

      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}

      {created ? (
        <div className="mcp-token-created" data-testid="mcp-token-created">
          <p className="form-success">Token created. Copy it now; you will not see it again.</p>
          <label className="field">
            <span className="field-label">{created.name}</span>
            <div className="mcp-copy-row">
              <input
                className="input input-mono"
                readOnly
                value={created.token}
                data-testid="mcp-token-value"
              />
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => void copyText('token', created.token)}
                data-testid="mcp-copy-token"
              >
                {copied === 'token' ? 'Copied' : 'Copy token'}
              </button>
            </div>
          </label>

          <details className="mcp-config-details" open>
            <summary>Client config snippets</summary>
            <div className="mcp-snippet">
              <div className="mcp-snippet-head">
                <strong>Cursor</strong>
                <span className="mcp-snippet-path">~/.cursor/mcp.json</span>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => void copyText('cursor', cursorSnippet(url, created.token))}
                >
                  {copied === 'cursor' ? 'Copied' : 'Copy'}
                </button>
              </div>
              <pre data-testid="mcp-cursor-snippet">{cursorSnippet(url, created.token)}</pre>
            </div>
            <div className="mcp-snippet">
              <div className="mcp-snippet-head">
                <strong>Claude Desktop</strong>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => void copyText('claude', claudeSnippet(url, created.token))}
                >
                  {copied === 'claude' ? 'Copied' : 'Copy'}
                </button>
              </div>
              <pre data-testid="mcp-claude-snippet">{claudeSnippet(url, created.token)}</pre>
            </div>
            <div className="mcp-snippet">
              <div className="mcp-snippet-head">
                <strong>Generic Streamable HTTP</strong>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => void copyText('generic', genericSnippet(url, created.token))}
                >
                  {copied === 'generic' ? 'Copied' : 'Copy'}
                </button>
              </div>
              <pre>{genericSnippet(url, created.token)}</pre>
            </div>
          </details>
        </div>
      ) : null}

      <div className="mcp-token-list" data-testid="mcp-token-list">
        <h3 className="side-section-label">Your tokens</h3>
        {loading ? (
          <p className="page-status">Loading tokens...</p>
        ) : active.length === 0 && revoked.length === 0 ? (
          <p className="settings-note">No tokens yet.</p>
        ) : (
          <ul className="mcp-token-ul">
            {active.map((t) => (
              <li key={t.hash} className="mcp-token-row" data-testid="mcp-token-row">
                <div>
                  <strong>{t.name}</strong>
                  <p className="mcp-token-meta">
                    Created {t.createdAt ? formatRelative(t.createdAt) : 'just now'}
                    {t.lastUsedAt ? ` · Last used ${formatRelative(t.lastUsedAt)}` : ' · Never used'}
                  </p>
                </div>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  disabled={busy}
                  onClick={() => void onRevoke(t.hash)}
                  data-testid="mcp-revoke-token"
                >
                  Revoke
                </button>
              </li>
            ))}
            {revoked.map((t) => (
              <li key={t.hash} className="mcp-token-row is-revoked">
                <div>
                  <strong>{t.name}</strong>
                  <p className="mcp-token-meta">Revoked</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}
