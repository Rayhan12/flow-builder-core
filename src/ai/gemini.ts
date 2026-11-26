import { GEMINI_MODELS } from '../data/settings'
import { geminiProvider } from './providers/geminiProvider'
import type { AiConnection } from './providers/types'
import type { CreateProviderOptions, GenerateRequest, LLMProvider } from './provider'

/**
 * Legacy factory for the in-editor assistant. Wraps the multi-provider Gemini
 * client so existing generate() callers keep working.
 */
export function createGeminiProvider(options: CreateProviderOptions): LLMProvider {
  const apiKey = options.apiKey.trim()
  const model = options.model.trim() || 'gemini-2.5-flash'

  if (!apiKey) {
    throw new Error('Gemini API key is required')
  }

  const conn: AiConnection = {
    id: 'legacy-gemini',
    provider: 'gemini',
    label: 'Gemini',
    apiKey,
    createdAt: Date.now(),
  }

  return {
    id: 'gemini',

    async listModels() {
      const models = await geminiProvider.listModels(conn)
      return models.length > 0 ? models.map((m) => m.id) : [...GEMINI_MODELS]
    },

    async generate(req: GenerateRequest) {
      const result = await geminiProvider.chat(conn, {
        model,
        system: req.system,
        messages: req.messages.map((m) => ({ role: m.role, text: m.text })),
        jsonMode: true,
        temperature: 0.2,
      })
      const text = (result.text ?? '').trim()
      if (!text) throw new Error('Gemini returned empty text')
      return text
    },
  }
}
