import { afterEach, describe, expect, it, vi } from 'vitest'
import { anthropicProvider } from './anthropicProvider'
import {
  listConnections,
  removeConnection,
  saveConnections,
  upsertConnection,
} from './connections'
import { geminiProvider } from './geminiProvider'
import { mapStatusToReason, mapPool, ProviderCorsError } from './http'
import { parseJsonToolFallback } from './jsonFallback'
import {
  cacheStorageKey,
  computeKeyFingerprint,
  getModelCache,
  saveModelCache,
} from './modelCache'
import { isChatModel, openaiProvider, openAiStyleHeaders, customProvider } from './openaiCompatible'
import { listAndProbeModels } from './probe'
import { resolveActiveSelection, setSelectedModel } from './selectedModel'
import type { AiConnection } from './types'

function conn(partial: Partial<AiConnection> & Pick<AiConnection, 'provider'>): AiConnection {
  return {
    id: partial.id ?? 'c1',
    provider: partial.provider,
    label: partial.label ?? partial.provider,
    apiKey: partial.apiKey ?? 'test-key',
    baseUrl: partial.baseUrl,
    headers: partial.headers,
    preset: partial.preset,
    createdAt: partial.createdAt ?? 1,
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  localStorage.clear()
})

describe('mapStatusToReason', () => {
  it('maps auth and missing models to no_access', () => {
    expect(mapStatusToReason(401, '')).toBe('no_access')
    expect(mapStatusToReason(403, '')).toBe('no_access')
    expect(mapStatusToReason(404, '')).toBe('no_access')
  })

  it('maps billing and quota vs rate limit', () => {
    expect(mapStatusToReason(402, '')).toBe('needs_billing')
    expect(mapStatusToReason(429, 'quota exceeded')).toBe('quota')
    expect(mapStatusToReason(429, 'rate limit please retry')).toBe('rate_limit')
    expect(mapStatusToReason(400, 'bad request')).toBe('unsupported')
  })
})

describe('mapPool concurrency', () => {
  it('limits concurrent work', async () => {
    let active = 0
    let maxActive = 0
    const items = [1, 2, 3, 4, 5, 6]
    await mapPool(items, 3, async (n) => {
      active += 1
      maxActive = Math.max(maxActive, active)
      await new Promise((r) => setTimeout(r, 20))
      active -= 1
      return n * 2
    })
    expect(maxActive).toBeLessThanOrEqual(3)
  })
})

describe('Gemini listModels', () => {
  it('keeps generateContent models and strips models/ prefix', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          models: [
            { name: 'models/gemini-2.5-flash', supportedGenerationMethods: ['generateContent'] },
            { name: 'models/embedding-001', supportedGenerationMethods: ['embedContent'] },
          ],
        }),
      }),
    )
    const models = await geminiProvider.listModels(conn({ provider: 'gemini' }))
    expect(models.map((m) => m.id)).toEqual(['gemini-2.5-flash'])
  })
})

describe('OpenAI listModels filter', () => {
  it('keeps chat models only', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          data: [{ id: 'gpt-4o-mini' }, { id: 'text-embedding-3-small' }, { id: 'o3-mini' }],
        }),
      }),
    )
    const models = await openaiProvider.listModels(conn({ provider: 'openai' }))
    expect(models.map((m) => m.id).sort()).toEqual(['gpt-4o-mini', 'o3-mini'])
    expect(isChatModel('text-embedding-3-small')).toBe(false)
  })
})

describe('ping reason mapping', () => {
  it('maps status codes from Gemini ping', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        text: async () => JSON.stringify({ error: { message: 'bad key' } }),
      }),
    )
    const result = await geminiProvider.ping(conn({ provider: 'gemini' }), 'gemini-2.5-flash')
    expect(result).toMatchObject({ usable: false, reason: 'no_access' })
  })

  it('maps network TypeError to cors_blocked', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new TypeError('Failed to fetch')),
    )
    const result = await anthropicProvider.ping(conn({ provider: 'anthropic' }), 'claude-sonnet-4-5')
    expect(result).toMatchObject({ usable: false, reason: 'cors_blocked' })
  })

  it('marks usable on 2xx with body', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          candidates: [{ content: { parts: [{ text: 'yes' }] } }],
        }),
      }),
    )
    const result = await geminiProvider.ping(conn({ provider: 'gemini' }), 'gemini-2.5-flash')
    expect(result).toMatchObject({ usable: true })
  })
})

describe('Anthropic browser header', () => {
  it('sends anthropic-dangerous-direct-browser-access', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ content: [{ type: 'text', text: 'hi' }] }),
    })
    vi.stubGlobal('fetch', fetchMock)
    await anthropicProvider.chat(conn({ provider: 'anthropic' }), {
      model: 'claude-sonnet-4-5',
      system: 'sys',
      messages: [{ role: 'user', text: 'hi' }],
    })
    const init = fetchMock.mock.calls[0]![1] as RequestInit
    const headers = init.headers as Record<string, string>
    expect(headers['anthropic-dangerous-direct-browser-access']).toBe('true')
    expect(headers['anthropic-version']).toBe('2023-06-01')
  })
})

describe('Custom provider', () => {
  it('uses base URL and extra headers', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ id: 'local-model' }] }),
    })
    vi.stubGlobal('fetch', fetchMock)
    const c = conn({
      provider: 'custom',
      baseUrl: 'http://localhost:11434/v1',
      headers: { 'X-Custom': 'yes' },
      apiKey: '',
    })
    const models = await customProvider.listModels(c)
    expect(models.map((m) => m.id)).toEqual(['local-model'])
    expect(String(fetchMock.mock.calls[0]![0])).toBe('http://localhost:11434/v1/models')
    const headers = openAiStyleHeaders('custom', c)
    expect(headers['X-Custom']).toBe('yes')
  })
})

describe('tool call mapping round trips', () => {
  it('maps OpenAI tool_calls', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: null,
                tool_calls: [
                  {
                    id: 'call_1',
                    function: { name: 'list_projects', arguments: '{}' },
                  },
                ],
              },
            },
          ],
        }),
      }),
    )
    const result = await openaiProvider.chat(conn({ provider: 'openai' }), {
      model: 'gpt-4o-mini',
      system: 'sys',
      messages: [{ role: 'user', text: 'list' }],
      tools: [
        {
          name: 'list_projects',
          description: 'List projects',
          parameters: { type: 'object', properties: {} },
        },
      ],
    })
    expect(result.toolCalls).toEqual([{ id: 'call_1', name: 'list_projects', args: {} }])
  })

  it('maps Anthropic tool_use', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          content: [{ type: 'tool_use', id: 'tu1', name: 'list_projects', input: {} }],
        }),
      }),
    )
    const result = await anthropicProvider.chat(conn({ provider: 'anthropic' }), {
      model: 'claude-sonnet-4-5',
      system: 'sys',
      messages: [{ role: 'user', text: 'list' }],
      tools: [
        {
          name: 'list_projects',
          description: 'List projects',
          parameters: { type: 'object', properties: {} },
        },
      ],
    })
    expect(result.toolCalls).toEqual([{ id: 'tu1', name: 'list_projects', args: {} }])
  })

  it('maps Gemini functionCall', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          candidates: [
            {
              content: {
                role: 'model',
                parts: [{ functionCall: { name: 'list_projects', args: {} } }],
              },
            },
          ],
        }),
      }),
    )
    const result = await geminiProvider.chat(conn({ provider: 'gemini' }), {
      model: 'gemini-2.5-flash',
      system: 'sys',
      messages: [{ role: 'user', text: 'list' }],
      tools: [
        {
          name: 'list_projects',
          description: 'List projects',
          parameters: { type: 'object', properties: {} },
        },
      ],
    })
    expect(result.toolCalls?.[0]?.name).toBe('list_projects')
  })
})

describe('JSON tool fallback', () => {
  it('parses tool JSON and plain text', () => {
    expect(parseJsonToolFallback('{"tool":"list_projects","args":{}}')).toEqual({
      toolCalls: [{ id: 'json-fallback-list_projects', name: 'list_projects', args: {} }],
    })
    expect(parseJsonToolFallback('All done.')).toEqual({ text: 'All done.' })
  })
})

describe('connections + cache', () => {
  it('stores connections per uid and caches probe results with fingerprint key', async () => {
    upsertConnection('u1', { provider: 'gemini', label: 'G', apiKey: 'abc' })
    expect(listConnections('u1')).toHaveLength(1)
    expect(listConnections('u2')).toHaveLength(0)

    vi.stubGlobal(
      'fetch',
      vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            models: [
              {
                name: 'models/gemini-2.5-flash',
                supportedGenerationMethods: ['generateContent'],
              },
            ],
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            candidates: [{ content: { parts: [{ text: 'yes' }] } }],
          }),
        }),
    )

    const c = listConnections('u1')[0]!
    const fp = await computeKeyFingerprint(c)
    const cache = await listAndProbeModels('u1', { ...c, keyFingerprint: fp }, {
      concurrency: 1,
      delayMs: 0,
    })
    expect(cache.models[0]?.usable).toBe(true)
    expect(cache.keyFingerprint).toBe(fp)
    expect(cache.enabledModelIds).toContain('gemini-2.5-flash')
    expect(getModelCache('u1', { ...c, keyFingerprint: fp })?.models[0]?.usable).toBe(true)
    const stored = localStorage.getItem(cacheStorageKey('u1', c.id, fp))
    expect(stored).toBeTruthy()
    expect(stored).not.toContain('abc')
    expect(stored).not.toContain(c.apiKey)

    removeConnection('u1', c.id)
    expect(listConnections('u1')).toHaveLength(0)
  })

  it('re-check updates a single model in cache', async () => {
    const c = conn({ provider: 'openai', id: 'c1', apiKey: 'sk-test' })
    const fp = await computeKeyFingerprint(c)
    saveConnections('u1', [{ ...c, keyFingerprint: fp }])
    saveModelCache('u1', {
      connectionId: 'c1',
      keyFingerprint: fp,
      lastCheckedAt: 1,
      enabledModelIds: [],
      models: [
        {
          id: 'gpt-4o-mini',
          usable: false,
          reason: 'error',
          supportsTools: true,
          checkedAt: 1,
        },
      ],
    })
    expect(getModelCache('u1', { ...c, keyFingerprint: fp })?.models[0]?.usable).toBe(false)
  })

  it('throws on list failure instead of substituting FALLBACK_MODELS', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        text: async () => 'unauthorized',
      }),
    )
    const c = conn({ provider: 'openai', apiKey: 'bad' })
    const fp = await computeKeyFingerprint(c)
    await expect(
      listAndProbeModels('u1', { ...c, keyFingerprint: fp }, { concurrency: 1, delayMs: 0 }),
    ).rejects.toThrow()
  })

  it('paginates Anthropic listModels with after_id', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [{ id: 'claude-a' }],
          has_more: true,
          last_id: 'claude-a',
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [{ id: 'claude-b' }],
          has_more: false,
        }),
      })
    vi.stubGlobal('fetch', fetchMock)
    const models = await anthropicProvider.listModels(conn({ provider: 'anthropic' }))
    expect(models.map((m) => m.id)).toEqual(['claude-a', 'claude-b'])
    expect(String(fetchMock.mock.calls[1]![0])).toContain('after_id=claude-a')
  })

  it('paginates Gemini listModels with nextPageToken', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          models: [
            { name: 'models/gemini-a', supportedGenerationMethods: ['generateContent'] },
          ],
          nextPageToken: 'tok2',
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          models: [
            { name: 'models/gemini-b', supportedGenerationMethods: ['generateContent'] },
          ],
        }),
      })
    vi.stubGlobal('fetch', fetchMock)
    const models = await geminiProvider.listModels(conn({ provider: 'gemini' }))
    expect(models.map((m) => m.id)).toEqual(['gemini-a', 'gemini-b'])
    expect(String(fetchMock.mock.calls[1]![0])).toContain('pageToken=tok2')
  })

  it('defaults enabled to usable+tools and refresh preserves selection marking New', async () => {
    const c = conn({ provider: 'openai', id: 'c1', apiKey: 'sk-1' })
    const fp = await computeKeyFingerprint(c)
    const withFp = { ...c, keyFingerprint: fp }
    saveConnections('u1', [withFp])

    const pingOk = {
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'yes' } }] }),
    }
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            data: [{ id: 'gpt-4o-mini' }, { id: 'gpt-4o' }],
          }),
        })
        .mockResolvedValueOnce(pingOk)
        .mockResolvedValueOnce(pingOk),
    )
    const first = await listAndProbeModels('u1', withFp, {
      mode: 'initial',
      concurrency: 1,
      delayMs: 0,
    })
    expect(first.enabledModelIds.sort()).toEqual(['gpt-4o', 'gpt-4o-mini'])

    // Uncheck gpt-4o
    saveModelCache('u1', { ...first, enabledModelIds: ['gpt-4o-mini'] })

    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            data: [{ id: 'gpt-4o-mini' }, { id: 'gpt-4o' }, { id: 'gpt-4.1' }],
          }),
        })
        .mockResolvedValue(pingOk),
    )
    const refreshed = await listAndProbeModels('u1', withFp, {
      mode: 'refresh',
      concurrency: 1,
      delayMs: 0,
    })
    expect(refreshed.enabledModelIds).toEqual(['gpt-4o-mini'])
    expect(refreshed.models.find((m) => m.id === 'gpt-4.1')?.isNew).toBe(true)
    expect(refreshed.enabledModelIds).not.toContain('gpt-4.1')
  })

  it('resolveActiveSelection uses only enabled stored models', async () => {
    const c = conn({ provider: 'openai', id: 'c1', apiKey: 'sk-1' })
    const fp = await computeKeyFingerprint(c)
    const withFp = { ...c, keyFingerprint: fp }
    saveConnections('u1', [withFp])
    saveModelCache('u1', {
      connectionId: 'c1',
      keyFingerprint: fp,
      lastCheckedAt: Date.now(),
      enabledModelIds: ['gpt-4o-mini'],
      models: [
        { id: 'gpt-4o-mini', usable: true, supportsTools: true, checkedAt: 1 },
        { id: 'gpt-4o', usable: true, supportsTools: true, checkedAt: 1 },
      ],
    })
    setSelectedModel('u1', { connectionId: 'c1', provider: 'openai', model: 'gpt-4o' })
    expect(resolveActiveSelection('u1')).toEqual({
      connectionId: 'c1',
      provider: 'openai',
      model: 'gpt-4o-mini',
    })
  })

  it('key change invalidates cache for the new fingerprint', async () => {
    const c1 = conn({ provider: 'openai', id: 'c1', apiKey: 'sk-old' })
    const fp1 = await computeKeyFingerprint(c1)
    saveConnections('u1', [{ ...c1, keyFingerprint: fp1 }])
    saveModelCache('u1', {
      connectionId: 'c1',
      keyFingerprint: fp1,
      lastCheckedAt: 1,
      enabledModelIds: ['gpt-4o-mini'],
      models: [{ id: 'gpt-4o-mini', usable: true, supportsTools: true, checkedAt: 1 }],
    })
    const c2 = { ...c1, apiKey: 'sk-new' }
    const fp2 = await computeKeyFingerprint(c2)
    expect(fp1).not.toBe(fp2)
    expect(getModelCache('u1', { ...c2, keyFingerprint: fp2 })).toBeNull()
  })
})

describe('CORS error message', () => {
  it('suggests OpenRouter or a local proxy', () => {
    const err = new ProviderCorsError()
    expect(err.message).toMatch(/OpenRouter/)
    expect(err.message).toMatch(/local proxy/)
  })
})
