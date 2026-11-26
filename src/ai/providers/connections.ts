import { computeKeyFingerprint } from './modelCache'
import type { AiConnection, ProviderId } from './types'

const CONNECTIONS_PREFIX = 'fb:ai:'
const LEGACY_KEY_PREFIX = 'flow-builder:ai-key:'

function connectionsKey(uid: string): string {
  return `${CONNECTIONS_PREFIX}${uid}:connections`
}

function legacyKey(uid: string): string {
  return `${LEGACY_KEY_PREFIX}${uid}`
}

function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `conn-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function parseConnections(raw: string | null): AiConnection[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((item): item is AiConnection => {
        if (!item || typeof item !== 'object') return false
        const c = item as AiConnection
        return (
          typeof c.id === 'string' &&
          typeof c.provider === 'string' &&
          typeof c.label === 'string' &&
          typeof c.apiKey === 'string'
        )
      })
      .map((c) => ({
        ...c,
        apiKey: c.apiKey,
        createdAt: typeof c.createdAt === 'number' ? c.createdAt : Date.now(),
        keyFingerprint:
          typeof c.keyFingerprint === 'string' && c.keyFingerprint.length > 0
            ? c.keyFingerprint
            : undefined,
      }))
  } catch {
    return []
  }
}

function migrateLegacyKey(uid: string): AiConnection | null {
  try {
    const legacy = localStorage.getItem(legacyKey(uid))
    if (!legacy || !legacy.trim()) return null
    const conn: AiConnection = {
      id: newId(),
      provider: 'gemini',
      label: 'Gemini',
      apiKey: legacy.trim(),
      createdAt: Date.now(),
    }
    localStorage.removeItem(legacyKey(uid))
    return conn
  } catch {
    return null
  }
}

export function listConnections(uid: string): AiConnection[] {
  try {
    let list = parseConnections(localStorage.getItem(connectionsKey(uid)))
    if (list.length === 0) {
      const migrated = migrateLegacyKey(uid)
      if (migrated) {
        list = [migrated]
        saveConnections(uid, list)
      }
    }
    return list
  } catch {
    return []
  }
}

export function saveConnections(uid: string, connections: AiConnection[]): void {
  try {
    localStorage.setItem(connectionsKey(uid), JSON.stringify(connections))
  } catch {
    throw new Error('Could not save AI connections in this browser')
  }
}

export function getConnection(uid: string, connectionId: string): AiConnection | null {
  return listConnections(uid).find((c) => c.id === connectionId) ?? null
}

export function upsertConnection(
  uid: string,
  input: Omit<AiConnection, 'id' | 'createdAt'> & { id?: string; createdAt?: number },
): AiConnection {
  const list = listConnections(uid)
  const id = input.id ?? newId()
  const next: AiConnection = {
    id,
    provider: input.provider,
    label: input.label.trim() || defaultLabel(input.provider),
    apiKey: input.apiKey.trim(),
    baseUrl: input.baseUrl?.trim() || undefined,
    headers: input.headers,
    preset: input.preset,
    createdAt: input.createdAt ?? Date.now(),
    keyFingerprint: input.keyFingerprint,
  }
  const idx = list.findIndex((c) => c.id === id)
  if (idx >= 0) list[idx] = next
  else list.push(next)
  saveConnections(uid, list)
  return next
}

/**
 * Save a connection and attach keyFingerprint = SHA-256(provider+baseUrl+apiKey)[:16].
 * Prefer this over upsertConnection when the API key (or base URL) may have changed.
 */
export async function saveConnectionWithFingerprint(
  uid: string,
  input: Omit<AiConnection, 'id' | 'createdAt' | 'keyFingerprint'> & {
    id?: string
    createdAt?: number
  },
): Promise<AiConnection> {
  const draft = upsertConnection(uid, input)
  const keyFingerprint = await computeKeyFingerprint(draft)
  return upsertConnection(uid, { ...draft, keyFingerprint })
}

/** Backfill keyFingerprint on connections that predate this field. */
export async function ensureConnectionFingerprints(uid: string): Promise<AiConnection[]> {
  const list = listConnections(uid)
  let changed = false
  const next: AiConnection[] = []
  for (const conn of list) {
    if (conn.keyFingerprint) {
      next.push(conn)
      continue
    }
    const keyFingerprint = await computeKeyFingerprint(conn)
    next.push({ ...conn, keyFingerprint })
    changed = true
  }
  if (changed) saveConnections(uid, next)
  return next
}

export function removeConnection(uid: string, connectionId: string): void {
  const list = listConnections(uid).filter((c) => c.id !== connectionId)
  saveConnections(uid, list)
}

export function hasAnyConnectionKey(uid: string): boolean {
  return listConnections(uid).some((c) => {
    if (c.provider === 'custom' && (c.preset === 'ollama' || c.preset === 'lmstudio')) {
      return Boolean(c.baseUrl?.trim())
    }
    return Boolean(c.apiKey.trim()) || (c.provider === 'custom' && Boolean(c.baseUrl?.trim()))
  })
}

export function primaryConnection(uid: string): AiConnection | null {
  const list = listConnections(uid)
  return list.find((c) => c.apiKey.trim() || c.baseUrl?.trim()) ?? list[0] ?? null
}

function defaultLabel(provider: ProviderId): string {
  switch (provider) {
    case 'gemini':
      return 'Gemini'
    case 'anthropic':
      return 'Claude'
    case 'openai':
      return 'OpenAI'
    case 'openrouter':
      return 'OpenRouter'
    case 'custom':
      return 'Custom'
  }
}

/** Backward-compatible helpers used by older call sites and tests. */
export function getLegacyApiKey(uid: string): string | null {
  const primary = primaryConnection(uid)
  if (primary?.apiKey.trim()) return primary.apiKey.trim()
  try {
    const legacy = localStorage.getItem(legacyKey(uid))
    return legacy && legacy.trim() ? legacy.trim() : null
  } catch {
    return null
  }
}

export function setLegacyApiKey(uid: string, key: string): void {
  const trimmed = key.trim()
  if (!trimmed) {
    forgetLegacyApiKey(uid)
    return
  }
  const list = listConnections(uid)
  const existing = list.find((c) => c.provider === 'gemini')
  if (existing) {
    upsertConnection(uid, { ...existing, apiKey: trimmed })
  } else {
    upsertConnection(uid, {
      provider: 'gemini',
      label: 'Gemini',
      apiKey: trimmed,
    })
  }
  try {
    localStorage.removeItem(legacyKey(uid))
  } catch {
    // ignore
  }
}

export function forgetLegacyApiKey(uid: string): void {
  const list = listConnections(uid).filter((c) => c.provider !== 'gemini')
  saveConnections(uid, list)
  try {
    localStorage.removeItem(legacyKey(uid))
  } catch {
    // ignore
  }
}
