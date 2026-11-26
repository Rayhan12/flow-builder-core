import { anthropicProvider } from './anthropicProvider'
import { geminiProvider } from './geminiProvider'
import { customProvider, openaiProvider, openrouterProvider } from './openaiCompatible'
import type { LLMProvider, ProviderId } from './types'

const PROVIDERS: Record<ProviderId, LLMProvider> = {
  gemini: geminiProvider,
  anthropic: anthropicProvider,
  openai: openaiProvider,
  openrouter: openrouterProvider,
  custom: customProvider,
}

export function getProvider(id: ProviderId): LLMProvider {
  return PROVIDERS[id]
}

export function allProviders(): LLMProvider[] {
  return Object.values(PROVIDERS)
}
