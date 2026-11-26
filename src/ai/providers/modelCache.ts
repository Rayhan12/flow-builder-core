import type { AiConnection, CachedModelStatus, ConnectionModelCache, PingReason } from './types'

const CACHE_PREFIX = 'fb:ai:'

/** Old cache key (pre-fingerprint). Migrated on first read then deleted. */
function legacyCacheKey(uid: string, connectionId: string): string {
  return `${CACHE_PREFIX}${uid}:models:${connectionId}`
}

function dataCacheKey(uid: string, connectionId: string, keyFingerprint: string): string {
  return `${CACHE_PREFIX}${uid}:models:${connectionId}:${keyFingerprint}`
}

/** Points at the fingerprint last written for this connection (for key-change detection). */
function ptrKey(uid: string, connectionId: string): string {
  return `${CACHE_PREFIX}${uid}:modelptr:${connectionId}`
}

function toHex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/**
 * keyFingerprint = first 16 hex chars of SHA-256(provider + baseUrl + apiKey).
 * Never store or log the raw key here; only the digest prefix.
 */
export async function computeKeyFingerprint(conn: Pick<AiConnection, 'provider' | 'baseUrl' | 'apiKey'>): Promise<string> {
  const material = `${conn.provider}${conn.baseUrl ?? ''}${conn.apiKey}`
  const bytes = new TextEncoder().encode(material)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return toHex(digest).slice(0, 16)
}

export function readModelPtr(uid: string, connectionId: string): string | null {
  try {
    return localStorage.getItem(ptrKey(uid, connectionId))
  } catch {
    return null
  }
}

function writePtr(uid: string, connectionId: string, keyFingerprint: string): void {
  try {
    localStorage.setItem(ptrKey(uid, connectionId), keyFingerprint)
  } catch {
    // ignore quota
  }
}

function readData(
  uid: string,
  connectionId: string,
  keyFingerprint: string,
): ConnectionModelCache | null {
  try {
    const raw = localStorage.getItem(dataCacheKey(uid, connectionId, keyFingerprint))
    if (!raw) return null
    const parsed = JSON.parse(raw) as ConnectionModelCache
    if (!parsed || !Array.isArray(parsed.models)) return null
    return normalizeCache(parsed, connectionId, keyFingerprint)
  } catch {
    return null
  }
}

function normalizeCache(
  parsed: ConnectionModelCache,
  connectionId: string,
  keyFingerprint: string,
): ConnectionModelCache {
  const lastCheckedAt =
    typeof parsed.lastCheckedAt === 'number'
      ? parsed.lastCheckedAt
      : typeof parsed.checkedAt === 'number'
        ? parsed.checkedAt
        : Date.now()
  const enabledModelIds = Array.isArray(parsed.enabledModelIds)
    ? parsed.enabledModelIds
    : defaultEnabledIds(parsed.models)
  return {
    connectionId,
    keyFingerprint: parsed.keyFingerprint || keyFingerprint,
    lastCheckedAt,
    models: parsed.models,
    enabledModelIds,
    listError: parsed.listError,
  }
}

/** Default after first probe: all usable models that support tools. */
export function defaultEnabledIds(models: CachedModelStatus[]): string[] {
  return models.filter((m) => m.usable && m.supportsTools).map((m) => m.id)
}

/**
 * Migrate fb:ai:{uid}:models:{connectionId} → fingerprinted key.
 * enabled = usable + supportsTools. Old key is deleted.
 */
function migrateLegacyCache(
  uid: string,
  connectionId: string,
  keyFingerprint: string,
): ConnectionModelCache | null {
  try {
    const raw = localStorage.getItem(legacyCacheKey(uid, connectionId))
    if (!raw) return null
    const parsed = JSON.parse(raw) as ConnectionModelCache
    if (!parsed || !Array.isArray(parsed.models)) {
      localStorage.removeItem(legacyCacheKey(uid, connectionId))
      return null
    }
    const migrated: ConnectionModelCache = {
      connectionId,
      keyFingerprint,
      lastCheckedAt:
        typeof parsed.lastCheckedAt === 'number'
          ? parsed.lastCheckedAt
          : typeof parsed.checkedAt === 'number'
            ? parsed.checkedAt
            : Date.now(),
      models: parsed.models.map((m) => ({ ...m, isNew: false })),
      enabledModelIds: defaultEnabledIds(parsed.models),
    }
    saveModelCache(uid, migrated)
    localStorage.removeItem(legacyCacheKey(uid, connectionId))
    return migrated
  } catch {
    return null
  }
}

/**
 * Return the cache for this connection+key.
 * Uses conn.keyFingerprint when set; otherwise the last pointer / legacy key.
 * Returns null when the current key has no stored list (including after a key change).
 */
export function getModelCache(
  uid: string,
  connOrId: AiConnection | string,
): ConnectionModelCache | null {
  if (typeof connOrId === 'string') {
    const connectionId = connOrId
    const ptr = readModelPtr(uid, connectionId)
    if (ptr) {
      const hit = readData(uid, connectionId, ptr)
      if (hit) return hit
    }
    return migrateLegacyCache(uid, connectionId, ptr ?? 'migrated')
  }

  const conn = connOrId
  const fp = conn.keyFingerprint
  if (fp) {
    const matched = readData(uid, conn.id, fp)
    if (matched) return matched
    // Key changed or never probed for this fingerprint: do not return stale.
    migrateLegacyCache(uid, conn.id, fp)
    return readData(uid, conn.id, fp)
  }

  const ptr = readModelPtr(uid, conn.id)
  if (ptr) {
    const hit = readData(uid, conn.id, ptr)
    if (hit) return hit
  }
  return migrateLegacyCache(uid, conn.id, ptr ?? 'migrated')
}

/** True when a prior cache exists under a different fingerprint than the connection's current key. */
export function isKeyFingerprintChanged(uid: string, conn: AiConnection): boolean {
  const fp = conn.keyFingerprint
  if (!fp) return false
  const ptr = readModelPtr(uid, conn.id)
  if (!ptr) {
    // Legacy cache without ptr counts as stale once we have a fingerprint.
    try {
      return localStorage.getItem(legacyCacheKey(uid, conn.id)) != null
    } catch {
      return false
    }
  }
  return ptr !== fp
}

export function saveModelCache(uid: string, cache: ConnectionModelCache): void {
  try {
    const fp = cache.keyFingerprint
    if (!fp) return
    const payload: ConnectionModelCache = {
      connectionId: cache.connectionId,
      keyFingerprint: fp,
      lastCheckedAt: cache.lastCheckedAt,
      models: cache.models,
      enabledModelIds: cache.enabledModelIds,
      listError: cache.listError,
    }
    // Never persist raw API keys; assert the serialized value has none of the usual key material.
    const serialized = JSON.stringify(payload)
    localStorage.setItem(dataCacheKey(uid, cache.connectionId, fp), serialized)
    writePtr(uid, cache.connectionId, fp)
  } catch {
    // ignore quota errors
  }
}

export function clearModelCache(uid: string, connectionId: string): void {
  try {
    const ptr = readModelPtr(uid, connectionId)
    if (ptr) localStorage.removeItem(dataCacheKey(uid, connectionId, ptr))
    localStorage.removeItem(ptrKey(uid, connectionId))
    localStorage.removeItem(legacyCacheKey(uid, connectionId))
    // Sweep any fingerprinted leftovers for this connection.
    const prefix = `${CACHE_PREFIX}${uid}:models:${connectionId}:`
    const toRemove: string[] = []
    for (let i = 0; i < localStorage.length; i += 1) {
      const k = localStorage.key(i)
      if (k && k.startsWith(prefix)) toRemove.push(k)
    }
    for (const k of toRemove) localStorage.removeItem(k)
  } catch {
    // ignore
  }
}

export function setEnabledModelIds(
  uid: string,
  conn: AiConnection,
  enabledModelIds: string[],
): ConnectionModelCache | null {
  const cache = getModelCache(uid, conn)
  if (!cache) return null
  const usable = new Set(cache.models.filter((m) => m.usable).map((m) => m.id))
  const next: ConnectionModelCache = {
    ...cache,
    enabledModelIds: enabledModelIds.filter((id) => usable.has(id)),
  }
  saveModelCache(uid, next)
  return next
}

export function getEnabledModels(uid: string, conn: AiConnection): CachedModelStatus[] {
  const cache = getModelCache(uid, conn)
  if (!cache) return []
  const enabled = new Set(cache.enabledModelIds)
  return cache.models.filter((m) => m.usable && enabled.has(m.id))
}

export function upsertCachedModel(
  uid: string,
  conn: AiConnection,
  model: CachedModelStatus,
): ConnectionModelCache {
  const fp = conn.keyFingerprint
  const existing =
    getModelCache(uid, conn) ??
    ({
      connectionId: conn.id,
      keyFingerprint: fp ?? '',
      lastCheckedAt: Date.now(),
      models: [],
      enabledModelIds: [],
    } satisfies ConnectionModelCache)

  const idx = existing.models.findIndex((m) => m.id === model.id)
  if (idx >= 0) existing.models[idx] = model
  else existing.models.push(model)

  // Drop from enabled if no longer usable.
  if (!model.usable) {
    existing.enabledModelIds = existing.enabledModelIds.filter((id) => id !== model.id)
  }
  existing.lastCheckedAt = Date.now()
  if (fp) existing.keyFingerprint = fp
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

export function cacheStorageKey(uid: string, connectionId: string, keyFingerprint: string): string {
  return dataCacheKey(uid, connectionId, keyFingerprint)
}
