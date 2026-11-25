import { afterEach, describe, expect, it, vi } from 'vitest'
import { createGeminiProvider } from './gemini'

describe('createGeminiProvider', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('requires an API key', () => {
    expect(() => createGeminiProvider({ apiKey: '', model: 'gemini-2.5-flash' })).toThrow(
      /required/i,
    )
  })

  it('lists known models', async () => {
    const provider = createGeminiProvider({ apiKey: 'test-key', model: 'gemini-2.5-flash' })
    const models = await provider.listModels()
    expect(models).toContain('gemini-2.5-flash')
  })

  it('posts generateContent and returns text', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [{ text: '{"type":"message","text":"Hello"}' }],
            },
          },
        ],
      }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const provider = createGeminiProvider({ apiKey: 'test-key', model: 'gemini-2.5-flash' })
    const text = await provider.generate({
      system: 'sys',
      messages: [{ role: 'user', text: 'hi' }],
    })

    expect(text).toContain('Hello')
    expect(fetchMock).toHaveBeenCalledOnce()
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toContain('gemini-2.5-flash')
    expect(url).toContain('key=test-key')
    expect(init.method).toBe('POST')
    const body = JSON.parse(String(init.body)) as {
      generationConfig: { responseMimeType: string }
    }
    expect(body.generationConfig.responseMimeType).toBe('application/json')
  })

  it('surfaces API errors', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({ error: { message: 'API key not valid' } }),
      }),
    )

    const provider = createGeminiProvider({ apiKey: 'bad', model: 'gemini-2.5-flash' })
    await expect(
      provider.generate({ system: 'sys', messages: [{ role: 'user', text: 'hi' }] }),
    ).rejects.toThrow(/not valid/i)
  })
})
