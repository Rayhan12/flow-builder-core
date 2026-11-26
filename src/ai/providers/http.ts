import {
  CORS_BLOCKED_MESSAGE,
  type PingReason,
  type PingResult,
} from './types'

export class ProviderHttpError extends Error {
  status: number
  bodyText: string
  reason: PingReason

  constructor(status: number, bodyText: string, reason: PingReason, message?: string) {
    super(message ?? `Provider request failed (${status})`)
    this.name = 'ProviderHttpError'
    this.status = status
    this.bodyText = bodyText
    this.reason = reason
  }
}

export class ProviderCorsError extends Error {
  constructor(message = CORS_BLOCKED_MESSAGE) {
    super(message)
    this.name = 'ProviderCorsError'
  }
}

export class ProviderTimeoutError extends Error {
  constructor(message = 'Request timed out') {
    super(message)
    this.name = 'ProviderTimeoutError'
  }
}

export function mapStatusToReason(status: number, bodyText: string): PingReason {
  const lower = bodyText.toLowerCase()
  if (status === 401 || status === 403 || status === 404) return 'no_access'
  if (status === 402 || /billing|payment|credit|upgrade your plan/.test(lower)) {
    return 'needs_billing'
  }
  if (status === 429) {
    if (/quota|insufficient|exceeded your current quota|resource_exhausted/.test(lower)) {
      return 'quota'
    }
    return 'rate_limit'
  }
  if (status === 400) return 'unsupported'
  return 'error'
}

export function pingFromHttpError(err: unknown): PingResult {
  if (err instanceof ProviderCorsError) {
    return { usable: false, reason: 'cors_blocked', detail: err.message }
  }
  if (err instanceof ProviderTimeoutError) {
    return { usable: false, reason: 'timeout', detail: err.message }
  }
  if (err instanceof ProviderHttpError) {
    return { usable: false, reason: err.reason, detail: err.message }
  }
  if (err instanceof DOMException && err.name === 'AbortError') {
    return { usable: false, reason: 'timeout' }
  }
  if (err instanceof TypeError) {
    return { usable: false, reason: 'cors_blocked', detail: CORS_BLOCKED_MESSAGE }
  }
  const message = err instanceof Error ? err.message : String(err)
  return { usable: false, reason: 'error', detail: message }
}

export async function providerFetch(
  input: string,
  init: RequestInit,
  fetchImpl: typeof fetch = fetch,
): Promise<Response> {
  try {
    return await fetchImpl(input, init)
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new ProviderTimeoutError()
    }
    if (err instanceof TypeError) {
      throw new ProviderCorsError()
    }
    throw err
  }
}

export async function readErrorBody(res: Response): Promise<string> {
  try {
    return await res.text()
  } catch {
    return ''
  }
}

export function extractErrorMessage(bodyText: string, status: number): string {
  if (!bodyText) return `Request failed (${status})`
  try {
    const parsed = JSON.parse(bodyText) as {
      error?: { message?: string } | string
      message?: string
    }
    if (typeof parsed.error === 'string' && parsed.error.trim()) return parsed.error
    if (
      parsed.error &&
      typeof parsed.error === 'object' &&
      typeof parsed.error.message === 'string' &&
      parsed.error.message.trim()
    ) {
      return parsed.error.message
    }
    if (typeof parsed.message === 'string' && parsed.message.trim()) return parsed.message
  } catch {
    // plain text
  }
  return bodyText.slice(0, 400)
}

export async function assertOk(res: Response): Promise<void> {
  if (res.ok) return
  const bodyText = await readErrorBody(res)
  const reason = mapStatusToReason(res.status, bodyText)
  throw new ProviderHttpError(res.status, bodyText, reason, extractErrorMessage(bodyText, res.status))
}

export function withTimeoutSignal(
  timeoutMs: number,
  outer?: AbortSignal,
): { signal: AbortSignal; clear: () => void } {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  const onOuter = () => controller.abort()
  if (outer) {
    if (outer.aborted) controller.abort()
    else outer.addEventListener('abort', onOuter, { once: true })
  }
  return {
    signal: controller.signal,
    clear: () => {
      clearTimeout(timer)
      if (outer) outer.removeEventListener('abort', onOuter)
    },
  }
}

/** Run async work over items with a fixed concurrency. */
export async function mapPool<T, R>(
  items: readonly T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let next = 0
  const workers = Array.from({ length: Math.max(1, Math.min(concurrency, items.length)) }, async () => {
    while (true) {
      const i = next
      next += 1
      if (i >= items.length) return
      results[i] = await fn(items[i]!, i)
    }
  })
  await Promise.all(workers)
  return results
}
