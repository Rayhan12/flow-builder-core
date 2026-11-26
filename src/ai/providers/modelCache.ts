import type { CachedModelStatus, ConnectionModelCache, PingReason } from './types'

const CACHE_PREFIX = 'fb:ai:'

function cacheKey(uid: string, connectionId: string): string {
  return `${CACHE_PREFIX}${uid}:models:${connectionId}`
}

export function getModelCache(uid: string, connectionId: string): ConnectionModelCache | null {
  try {
    const raw = localStorage.getItem(cacheKey(uid, connectionId))
    if (!raw) return null
    const parsed = JSON.parse(raw) as ConnectionModelCache
    if (!parsed || !Array.isArray(parsed.models)) return null
    return parsed
  } catch {
    return null
  }
}

export function saveModelCache(uid: string, cache: ConnectionModelCache): void {
  try {
    localStorage.setItem(cacheKey(uid, cache.connectionId), JSON.stringify(cache))
  } catch {
    // ignore quota errors
  }
}

export function clearModelCache(uid: string, connectionId: string): void {
  try {
    localStorage.removeItem(cacheKey(uid, connectionId))
  } catch {
    // ignore
  }
}

export function upsertCachedModel(
  uid: string,
  connectionId: string,
  model: CachedModelStatus,
): ConnectionModelCache {
  const existing = getModelCache(uid, connectionId) ?? {
    connectionId,
    checkedAt: Date.now(),
    models: [],
  }
  const idx = existing.models.findIndex((m) => m.id === model.id)
  if (idx >= 0) existing.models[idx] = model
  else existing.models.push(model)
  existing.checkedAt = Date.now()
  saveModelCache(uid, existing)
  return existing
}

export function reasonLabel(reason?: PingReason): string {
  switch (reason) {
    case 'no_access':
      return 'No access'
    case 'quota':
      return 'Quota exceeded'
    case 'rate_limit':
      return 'Rate limited'
    case 'needs_billing':
      return 'Needs billing'
    case 'unsupported':
      return 'Unsupported'
    case 'cors_blocked':
      return 'Blocked by CORS'
    case 'timeout':
      return 'Timed out'
    case 'error':
      return 'Error'
    default:
      return 'Unavailable'
  }
}
