import { GEMINI_MODELS } from '../data/settings'
import type { CreateProviderOptions, GenerateRequest, LLMProvider } from './provider'

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta'

type GeminiPart = { text?: string }
type GeminiContent = { role: string; parts: GeminiPart[] }

function toGeminiContents(messages: GenerateRequest['messages']): GeminiContent[] {
  return messages.map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.text }],
  }))
}

function extractText(payload: unknown): string {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Empty response from Gemini')
  }
  const data = payload as {
    candidates?: Array<{ content?: { parts?: GeminiPart[] }; finishReason?: string }>
    error?: { message?: string }
  }
  if (data.error?.message) {
    throw new Error(data.error.message)
  }
  const parts = data.candidates?.[0]?.content?.parts
  if (!parts || parts.length === 0) {
    throw new Error('Gemini returned no content')
  }
  const text = parts
    .map((p) => p.text ?? '')
    .join('')
    .trim()
  if (!text) {
    throw new Error('Gemini returned empty text')
  }
  return text
}

export function createGeminiProvider(options: CreateProviderOptions): LLMProvider {
  const apiKey = options.apiKey.trim()
  const model = options.model.trim() || 'gemini-2.5-flash'

  if (!apiKey) {
    throw new Error('Gemini API key is required')
  }

  return {
    id: 'gemini',

    async listModels() {
      return [...GEMINI_MODELS]
    },

    async generate(req: GenerateRequest) {
      const url = `${GEMINI_BASE}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`

      const body: Record<string, unknown> = {
        systemInstruction: {
          parts: [{ text: req.system }],
        },
        contents: toGeminiContents(req.messages),
        generationConfig: {
          temperature: 0.2,
          responseMimeType: 'application/json',
        },
      }

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      const payload: unknown = await res.json().catch(() => null)

      if (!res.ok) {
        const message =
          payload &&
          typeof payload === 'object' &&
          'error' in payload &&
          payload.error &&
          typeof payload.error === 'object' &&
          'message' in payload.error &&
          typeof (payload.error as { message: unknown }).message === 'string'
            ? (payload.error as { message: string }).message
            : `Gemini request failed (${res.status})`
        throw new Error(message)
      }

      return extractText(payload)
    },
  }
}
