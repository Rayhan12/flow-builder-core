import { listConnections, primaryConnection } from './connections'
import { getEnabledModels, getModelCache } from './modelCache'
import type { ProviderId } from './types'

const SELECTED_PREFIX = 'fb:ai:'

export type SelectedModelRef = {
  connectionId: string
  provider: ProviderId
  model: string
}

function selectedKey(uid: string): string {
  return `${SELECTED_PREFIX}${uid}:selectedModel`
}

export function getSelectedModel(uid: string): SelectedModelRef | null {
  try {
    const raw = localStorage.getItem(selectedKey(uid))
    if (!raw) return null
    const parsed = JSON.parse(raw) as SelectedModelRef
    if (!parsed?.connectionId || !parsed?.model || !parsed?.provider) return null
    return parsed
  } catch {
    return null
  }
}

export function setSelectedModel(uid: string, ref: SelectedModelRef): void {
  try {
    localStorage.setItem(selectedKey(uid), JSON.stringify(ref))
  } catch {
    throw new Error('Could not save selected model in this browser')
  }
  // Firestore write is best-effort; localStorage holds the key-free preference.
  void import('../../data/settings')
    .then(({ updateUserSettings }) =>
      updateUserSettings(uid, {
        aiProvider: ref.provider,
        aiModel: ref.model,
      }),
    )
    .catch(() => undefined)
}

/**
 * Pick only from stored enabled models. No invented placeholders.
 * If the saved selection is no longer enabled, fall back to the first enabled
 * model on that connection, then any connection; else null.
 */
export function resolveActiveSelection(uid: string): SelectedModelRef | null {
  const connections = listConnections(uid)
  if (connections.length === 0) return null

  const saved = getSelectedModel(uid)
  if (saved) {
    const conn = connections.find((c) => c.id === saved.connectionId)
    if (conn) {
      const enabled = getEnabledModels(uid, conn)
      if (enabled.some((m) => m.id === saved.model)) return saved
      const first = enabled[0]
      if (first) {
        return { connectionId: conn.id, provider: conn.provider, model: first.id }
      }
    }
  }

  const primary = primaryConnection(uid)
  const ordered = primary
    ? [primary, ...connections.filter((c) => c.id !== primary.id)]
    : connections

  for (const conn of ordered) {
    const enabled = getEnabledModels(uid, conn)
    const first = enabled[0]
    if (first) {
      return { connectionId: conn.id, provider: conn.provider, model: first.id }
    }
  }
  return null
}

/** True when the user has a connection but no enabled models stored yet. */
export function needsModelSetup(uid: string): boolean {
  const connections = listConnections(uid)
  if (connections.length === 0) return false
  for (const conn of connections) {
    const cache = getModelCache(uid, conn)
    if (cache && cache.enabledModelIds.length > 0) return false
  }
  return connections.some((c) => Boolean(c.apiKey.trim() || c.baseUrl?.trim()))
}
