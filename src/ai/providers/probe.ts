import { getProvider } from './factory'
import { mapPool } from './http'
import { saveModelCache, upsertCachedModel } from './modelCache'
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
}

/**
 * List models for a connection, then ping each with the Penny probe
 * (tiny prompt, max 16 tokens, 12s timeout) at concurrency 3.
 */
export async function listAndProbeModels(
  uid: string,
  conn: AiConnection,
  opts: ProbeOptions = {},
): Promise<ConnectionModelCache> {
  const provider = getProvider(conn.provider)
  const listed = await provider.listModels(conn, {
    fetchImpl: opts.fetchImpl,
    signal: opts.signal,
  })
  const concurrency = opts.concurrency ?? PING_CONCURRENCY
  const delayMs = opts.delayMs ?? 50

  let completed = 0
  const statuses = await mapPool(listed, concurrency, async (info: ModelInfo) => {
    const status = await pingOne(conn, info, opts)
    if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs))
    completed += 1
    opts.onProgress?.(completed, listed.length, status)
    return status
  })

  const cache: ConnectionModelCache = {
    connectionId: conn.id,
    checkedAt: Date.now(),
    models: statuses,
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
  upsertCachedModel(uid, conn.id, status)
  return status
}
