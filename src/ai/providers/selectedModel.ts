import { listConnections, primaryConnection } from './connections'
import { getModelCache } from './modelCache'
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

export function resolveActiveSelection(uid: string): SelectedModelRef | null {
  const saved = getSelectedModel(uid)
  const connections = listConnections(uid)
  if (saved) {
    const conn = connections.find((c) => c.id === saved.connectionId)
    if (conn) return saved
  }
  const primary = primaryConnection(uid)
  if (!primary) return null
  const cache = getModelCache(uid, primary.id)
  const usable = cache?.models.find((m) => m.usable)
  return {
    connectionId: primary.id,
    provider: primary.provider,
    model: usable?.id ?? defaultModelFor(primary.provider),
  }
}

function defaultModelFor(provider: ProviderId): string {
  switch (provider) {
    case 'gemini':
      return 'gemini-2.5-flash'
    case 'anthropic':
      return 'claude-sonnet-4-5'
    case 'openai':
      return 'gpt-4o-mini'
    case 'openrouter':
      return 'google/gemini-2.5-flash'
    case 'custom':
      return ''
  }
}
