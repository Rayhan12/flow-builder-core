import { getProvider } from './factory'
import { mapPool } from './http'
import {
  computeKeyFingerprint,
  defaultEnabledIds,
  getModelCache,
  saveModelCache,
  upsertCachedModel,
} from './modelCache'
import {
  PING_CONCURRENCY,
  type AiConnection,
  type CachedModelStatus,
  type ConnectionModelCache,
  type FetchImpl,
  type ModelInfo,
} from './types'

export type ProbeOptions = {
  fetchImpl?: FetchImpl
  concurrency?: number
  delayMs?: number
  onProgress?: (done: number, total: number, model: CachedModelStatus) => void
  signal?: AbortSignal
  /**
   * 'initial' (default): enable all usable+tools models.
   * 'refresh': preserve prior enabled for models that still exist and are usable;
   * newly found usable models are listed but not auto-enabled (isNew).
   */
  mode?: 'initial' | 'refresh'
}

/**
 * List models for a connection, then ping each with the Penny probe
 * (tiny prompt, max 16 tokens, 12s timeout) at concurrency 3.
 * Throws if listing fails (no silent FALLBACK_MODELS).
 */
export async function listAndProbeModels(
  uid: string,
  conn: AiConnection,
  opts: ProbeOptions = {},
): Promise<ConnectionModelCache> {
  const keyFingerprint = conn.keyFingerprint ?? (await computeKeyFingerprint(conn))
  const connWithFp: AiConnection = { ...conn, keyFingerprint }
  const previous =
    opts.mode === 'refresh' ? getModelCache(uid, connWithFp) ?? getModelCache(uid, conn.id) : null
  const mode = opts.mode ?? (previous && previous.enabledModelIds.length > 0 ? 'refresh' : 'initial')

  const provider = getProvider(conn.provider)
  let listed: ModelInfo[]
  try {
    listed = await provider.listModels(connWithFp, {
      fetchImpl: opts.fetchImpl,
      signal: opts.signal,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not list models'
    const failed: ConnectionModelCache = {
      connectionId: conn.id,
      keyFingerprint,
      lastCheckedAt: Date.now(),
      models: previous?.models ?? [],
      enabledModelIds: previous?.enabledModelIds ?? [],
      listError: message,
    }
    saveModelCache(uid, failed)
    throw err instanceof Error ? err : new Error(message)
  }

  const concurrency = opts.concurrency ?? PING_CONCURRENCY
  const delayMs = opts.delayMs ?? 50
  const priorById = new Map((previous?.models ?? []).map((m) => [m.id, m]))
  const priorEnabled = new Set(previous?.enabledModelIds ?? [])

  let completed = 0
  const statuses = await mapPool(listed, concurrency, async (info: ModelInfo) => {
    const status = await pingOne(connWithFp, info, opts)
    if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs))
    completed += 1
    const withNew: CachedModelStatus = {
      ...status,
      isNew: mode === 'refresh' && !priorById.has(info.id),
    }
    opts.onProgress?.(completed, listed.length, withNew)
    return withNew
  })

  let enabledModelIds: string[]
  if (mode === 'refresh' && previous) {
    enabledModelIds = statuses
      .filter((m) => m.usable && priorEnabled.has(m.id))
      .map((m) => m.id)
  } else {
    enabledModelIds = defaultEnabledIds(statuses)
  }

  const cache: ConnectionModelCache = {
    connectionId: conn.id,
    keyFingerprint,
    lastCheckedAt: Date.now(),
    models: statuses,
    enabledModelIds,
  }
  saveModelCache(uid, cache)
  return cache
}

async function pingOne(
  conn: AiConnection,
  info: ModelInfo,
  opts: ProbeOptions,
): Promise<CachedModelStatus> {
  if (opts.signal?.aborted) {
    return {
      id: info.id,
      displayName: info.displayName,
      usable: false,
      reason: 'timeout',
      supportsTools: Boolean(info.supportsTools),
      checkedAt: Date.now(),
    }
  }
  const provider = getProvider(conn.provider)
  const ping = await provider.ping(conn, info.id, {
    fetchImpl: opts.fetchImpl,
    signal: opts.signal,
  })

  let supportsTools = Boolean(info.supportsTools)
  if (ping.usable && typeof ping.supportsTools === 'boolean') {
    supportsTools = ping.supportsTools
  }
  if (ping.usable && conn.provider === 'custom' && info.supportsTools === undefined) {
    supportsTools = await probeToolSupport(conn, info.id, opts.fetchImpl)
  }

  return ping.usable
    ? {
        id: info.id,
        displayName: info.displayName,
        usable: true,
        supportsTools,
        checkedAt: Date.now(),
      }
    : {
        id: info.id,
        displayName: info.displayName,
        usable: false,
        reason: ping.reason,
        detail: ping.detail,
        supportsTools,
        checkedAt: Date.now(),
      }
}

async function probeToolSupport(
  conn: AiConnection,
  model: string,
  fetchImpl?: FetchImpl,
): Promise<boolean> {
  try {
    const provider = getProvider(conn.provider)
    const result = await provider.chat(
      conn,
      {
        model,
        system: 'You are a ping. Call the tool.',
        messages: [{ role: 'user', text: 'Call echo_ping once.' }],
        tools: [
          {
            name: 'echo_ping',
            description: 'Confirm tool support',
            parameters: {
              type: 'object',
              properties: { ok: { type: 'boolean' } },
              required: ['ok'],
            },
          },
        ],
        maxTokens: 64,
      },
      { fetchImpl },
    )
    return Boolean(result.toolCalls && result.toolCalls.length > 0)
  } catch {
    return false
  }
}

export async function recheckModel(
  uid: string,
  conn: AiConnection,
  modelId: string,
  opts: ProbeOptions = {},
): Promise<CachedModelStatus> {
  const status = await pingOne(conn, { id: modelId }, opts)
  upsertCachedModel(uid, conn, status)
  return status
}
