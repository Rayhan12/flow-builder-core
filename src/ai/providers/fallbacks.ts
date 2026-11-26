import type { ProviderId } from './types'

export const FALLBACK_MODELS: Record<Exclude<ProviderId, 'custom'>, string[]> = {
  gemini: [
    'gemini-2.5-flash',
    'gemini-2.5-pro',
    'gemini-2.0-flash',
    'gemini-flash-latest',
  ],
  anthropic: [
    'claude-sonnet-4-5',
    'claude-sonnet-4-0',
    'claude-opus-4-1',
    'claude-3-5-haiku-latest',
  ],
  openai: ['gpt-4o', 'gpt-4o-mini', 'gpt-4.1', 'o3-mini', 'o4-mini'],
  openrouter: [
    'google/gemini-2.5-flash',
    'anthropic/claude-sonnet-4.5',
    'openai/gpt-4o-mini',
    'openai/gpt-4o',
  ],
}

export function fallbackModelsFor(provider: ProviderId): string[] {
  if (provider === 'custom') return []
  return FALLBACK_MODELS[provider]
}
