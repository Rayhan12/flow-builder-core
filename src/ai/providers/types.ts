/** Multi-provider AI types modelled on Penny's assistant clients. */

export type ProviderId = 'gemini' | 'anthropic' | 'openai' | 'openrouter' | 'custom'

export type CustomPresetId =
  | 'groq'
  | 'together'
  | 'deepseek'
  | 'mistral'
  | 'ollama'
  | 'lmstudio'
  | 'custom'

export type AiConnection = {
  id: string
  provider: ProviderId
  label: string
  apiKey: string
  /** Required for custom; ignored for built-ins. */
  baseUrl?: string
  /** Extra request headers for custom (e.g. org id). */
  headers?: Record<string, string>
  preset?: CustomPresetId
  createdAt: number
  /**
   * First 16 hex chars of SHA-256(provider + baseUrl + apiKey).
   * Derived locally; never sent to our servers. Used to key the model cache.
   */
  keyFingerprint?: string
}

export type PingReason =
  | 'no_access'
  | 'quota'
  | 'rate_limit'
  | 'needs_billing'
  | 'unsupported'
  | 'cors_blocked'
  | 'timeout'
  | 'error'

export type PingResult =
  | { usable: true; supportsTools?: boolean }
  | { usable: false; reason: PingReason; detail?: string }

export type ModelInfo = {
  id: string
  displayName?: string
  /** Hint from catalog before ping; may be refined by probe. */
  supportsTools?: boolean
}

export type CachedModelStatus = {
  id: string
  displayName?: string
  usable: boolean
  reason?: PingReason
  detail?: string
  supportsTools: boolean
  checkedAt: number
  /** Set on refresh when the model was not in the prior list. */
  isNew?: boolean
}

export type ConnectionModelCache = {
  connectionId: string
  keyFingerprint: string
  /** Epoch ms of the last list+probe (or single re-check that touched the record). */
  lastCheckedAt: number
  models: CachedModelStatus[]
  /** User-enabled model ids (subset of usable models). */
  enabledModelIds: string[]
  /** Present when the last listModels call failed (no silent fallback). */
  listError?: string
  /**
   * @deprecated Prefer lastCheckedAt. Kept for one-release migration of old caches.
   */
  checkedAt?: number
  /** @deprecated Old caches may mark silent fallback lists; new code never sets this. */
  listFromFallback?: boolean
}

export type AgentMessageRole = 'user' | 'assistant' | 'tool'

export type AgentMessage = {
  role: AgentMessageRole
  text?: string
  /** Assistant tool calls in this turn. */
  toolCalls?: Array<{ id: string; name: string; args: unknown }>
  /** Tool result messages. */
  toolCallId?: string
  name?: string
  /** Structured tool result body. */
  content?: unknown
  /** Provider-specific payload (Gemini thought signatures / raw parts). */
  rawParts?: unknown
}

export type ToolDecl = {
  name: string
  description: string
  /** JSON Schema object for parameters. */
  parameters: Record<string, unknown>
}

export type ChatRequest = {
  model: string
  system: string
  messages: AgentMessage[]
  tools?: ToolDecl[]
  /** Force JSON object response (editor assistant). */
  jsonMode?: boolean
  maxTokens?: number
  temperature?: number
  signal?: AbortSignal
}

export type ChatResponse = {
  text?: string
  toolCalls?: Array<{ id: string; name: string; args: unknown }>
  /** Raw provider parts needed to continue a tool loop (Gemini thought signatures). */
  rawAssistant?: unknown
}

export type FetchImpl = typeof fetch

export interface LLMProvider {
  id: ProviderId
  listModels(conn: AiConnection, opts?: { fetchImpl?: FetchImpl; signal?: AbortSignal }): Promise<ModelInfo[]>
  ping(
    conn: AiConnection,
    model: string,
    opts?: { fetchImpl?: FetchImpl; signal?: AbortSignal },
  ): Promise<PingResult>
  chat(
    conn: AiConnection,
    req: ChatRequest,
    opts?: { fetchImpl?: FetchImpl },
  ): Promise<ChatResponse>
}

export const CORS_BLOCKED_MESSAGE =
  'This provider blocks calls from the browser. Try OpenRouter, or run a local proxy.'

export const PROVIDER_META: Record<
  Exclude<ProviderId, 'custom'>,
  { label: string; keyUrl: string; defaultModel: string }
> = {
  gemini: {
    label: 'Google Gemini',
    keyUrl: 'https://aistudio.google.com/app/apikey',
    defaultModel: 'gemini-2.5-flash',
  },
  anthropic: {
    label: 'Anthropic Claude',
    keyUrl: 'https://console.anthropic.com/settings/keys',
    defaultModel: 'claude-sonnet-4-5',
  },
  openai: {
    label: 'OpenAI',
    keyUrl: 'https://platform.openai.com/api-keys',
    defaultModel: 'gpt-4o-mini',
  },
  openrouter: {
    label: 'OpenRouter',
    keyUrl: 'https://openrouter.ai/keys',
    defaultModel: 'google/gemini-2.5-flash',
  },
}

export type CustomPreset = {
  id: CustomPresetId
  label: string
  baseUrl: string
  keyUrl?: string
  requiresKey: boolean
}

export const CUSTOM_PRESETS: CustomPreset[] = [
  {
    id: 'groq',
    label: 'Groq',
    baseUrl: 'https://api.groq.com/openai/v1',
    keyUrl: 'https://console.groq.com/keys',
    requiresKey: true,
  },
  {
    id: 'together',
    label: 'Together',
    baseUrl: 'https://api.together.xyz/v1',
    keyUrl: 'https://api.together.ai/settings/api-keys',
    requiresKey: true,
  },
  {
    id: 'deepseek',
    label: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1',
    keyUrl: 'https://platform.deepseek.com/api_keys',
    requiresKey: true,
  },
  {
    id: 'mistral',
    label: 'Mistral',
    baseUrl: 'https://api.mistral.ai/v1',
    keyUrl: 'https://console.mistral.ai/api-keys',
    requiresKey: true,
  },
  {
    id: 'ollama',
    label: 'Ollama',
    baseUrl: 'http://localhost:11434/v1',
    requiresKey: false,
  },
  {
    id: 'lmstudio',
    label: 'LM Studio',
    baseUrl: 'http://localhost:1234/v1',
    requiresKey: false,
  },
  {
    id: 'custom',
    label: 'Custom OpenAI-compatible',
    baseUrl: '',
    requiresKey: true,
  },
]

export const PING_PROMPT = 'Are you active? say yes or no'
export const PING_MAX_TOKENS = 16
export const PING_TIMEOUT_MS = 12_000
export const PING_CONCURRENCY = 3
