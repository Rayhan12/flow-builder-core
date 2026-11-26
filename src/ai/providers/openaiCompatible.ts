import { fallbackModelsFor } from './fallbacks'
import {
  assertOk,
  pingFromHttpError,
  providerFetch,
  withTimeoutSignal,
} from './http'
import { toOpenAiTools } from './toolSchema'
import {
  PING_MAX_TOKENS,
  PING_PROMPT,
  PING_TIMEOUT_MS,
  type AgentMessage,
  type AiConnection,
  type ChatRequest,
  type LLMProvider,
  type ModelInfo,
  type ProviderId,
} from './types'

function isChatModel(id: string): boolean {
  const lower = id.toLowerCase()
  return (
    lower.startsWith('gpt-') ||
    lower.startsWith('o1') ||
    lower.startsWith('o3') ||
    lower.startsWith('o4') ||
    lower.startsWith('chatgpt-') ||
    lower.includes('gpt')
  )
}

function openAiSupportsTools(modelId: string): boolean {
  const id = modelId.toLowerCase()
  return (
    /gpt-4o|gpt-4\.1|gpt-4-turbo|o[1-9]|chatgpt-4o/.test(id) ||
    (id.startsWith('gpt-') && !id.includes('instruct'))
  )
}

function baseUrlFor(provider: ProviderId, conn: AiConnection): string {
  if (provider === 'openai') return 'https://api.openai.com/v1'
  if (provider === 'openrouter') return 'https://openrouter.ai/api/v1'
  const base = (conn.baseUrl ?? '').replace(/\/+$/, '')
  if (!base) throw new Error('Custom provider needs a base URL')
  return base
}

function headersFor(provider: ProviderId, conn: AiConnection): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }
  if (conn.apiKey.trim()) {
    headers.Authorization = `Bearer ${conn.apiKey.trim()}`
  }
  if (provider === 'openrouter') {
    headers['HTTP-Referer'] =
      typeof window !== 'undefined' ? window.location.origin : 'https://flow-builder.local'
    headers['X-Title'] = 'Flow Builder'
  }
  if (conn.headers) {
    for (const [k, v] of Object.entries(conn.headers)) {
      if (k.trim() && v.trim()) headers[k.trim()] = v.trim()
    }
  }
  return headers
}

function toOpenAiMessages(
  system: string,
  messages: AgentMessage[],
): Array<Record<string, unknown>> {
  const out: Array<Record<string, unknown>> = [{ role: 'system', content: system }]
  for (const m of messages) {
    if (m.role === 'user') {
      out.push({ role: 'user', content: m.text ?? '' })
      continue
    }
    if (m.role === 'assistant') {
      const row: Record<string, unknown> = {
        role: 'assistant',
        content: m.text?.trim() ? m.text : null,
      }
      if (m.toolCalls && m.toolCalls.length > 0) {
        row.tool_calls = m.toolCalls.map((c) => ({
          id: c.id,
          type: 'function',
          function: {
            name: c.name,
            arguments: typeof c.args === 'string' ? c.args : JSON.stringify(c.args ?? {}),
          },
        }))
      }
      out.push(row)
      continue
    }
    if (m.role === 'tool') {
      out.push({
        role: 'tool',
        tool_call_id: m.toolCallId ?? '',
        content:
          typeof m.content === 'string' ? m.content : JSON.stringify(m.content ?? m.text ?? ''),
      })
    }
  }
  return out
}

function createOpenAiStyleProvider(id: ProviderId): LLMProvider {
  return {
    id,

    async listModels(conn, opts) {
      const doFetch = opts?.fetchImpl ?? fetch
      const base = baseUrlFor(id, conn)
      try {
        const res = await providerFetch(
          `${base}/models`,
          { method: 'GET', headers: headersFor(id, conn), signal: opts?.signal },
          doFetch,
        )
        await assertOk(res)
        const payload = (await res.json()) as {
          data?: Array<{
            id?: string
            supported_parameters?: string[]
          }>
        }
        const models: ModelInfo[] = []
        for (const entry of payload.data ?? []) {
          const modelId = entry.id?.trim()
          if (!modelId) continue
          if (id === 'openai' && !isChatModel(modelId)) continue
          let supportsTools: boolean | undefined
          if (id === 'openrouter') {
            supportsTools = (entry.supported_parameters ?? []).includes('tools')
          } else if (id === 'openai') {
            supportsTools = openAiSupportsTools(modelId)
          }
          models.push({ id: modelId, supportsTools })
        }
        if (models.length > 0) return models
        if (id === 'custom') return []
        return fallbackModelsFor(id).map((mid) => ({
          id: mid,
          supportsTools: id === 'openai' ? openAiSupportsTools(mid) : id === 'openrouter' ? true : undefined,
        }))
      } catch {
        if (id === 'custom') return []
        return fallbackModelsFor(id).map((mid) => ({
          id: mid,
          supportsTools: id === 'openai' ? openAiSupportsTools(mid) : true,
        }))
      }
    },

    async ping(conn, model, opts) {
      const doFetch = opts?.fetchImpl ?? fetch
      const { signal, clear } = withTimeoutSignal(PING_TIMEOUT_MS, opts?.signal)
      try {
        const res = await providerFetch(
          `${baseUrlFor(id, conn)}/chat/completions`,
          {
            method: 'POST',
            headers: headersFor(id, conn),
            signal,
            body: JSON.stringify({
              model,
              max_tokens: PING_MAX_TOKENS,
              messages: [{ role: 'user', content: PING_PROMPT }],
            }),
          },
          doFetch,
        )
        await assertOk(res)
        const payload = (await res.json()) as { choices?: unknown[] }
        if (!payload.choices || payload.choices.length === 0) {
          return { usable: false, reason: 'error', detail: 'Empty ping response' }
        }
        return {
          usable: true,
          supportsTools:
            id === 'openai'
              ? openAiSupportsTools(model)
              : id === 'openrouter'
                ? true
                : undefined,
        }
      } catch (err) {
        return pingFromHttpError(err)
      } finally {
        clear()
      }
    },

    async chat(conn, req: ChatRequest, opts) {
      const doFetch = opts?.fetchImpl ?? fetch
      const tools = req.tools ?? []
      const body: Record<string, unknown> = {
        model: req.model,
        messages: toOpenAiMessages(req.system, req.messages),
        temperature: req.temperature ?? 0.2,
      }
      if (req.maxTokens) body.max_tokens = req.maxTokens
      if (req.jsonMode) body.response_format = { type: 'json_object' }
      if (tools.length > 0) {
        body.tools = toOpenAiTools(tools)
        body.tool_choice = 'auto'
      }

      const res = await providerFetch(
        `${baseUrlFor(id, conn)}/chat/completions`,
        {
          method: 'POST',
          headers: headersFor(id, conn),
          signal: req.signal,
          body: JSON.stringify(body),
        },
        doFetch,
      )
      await assertOk(res)
      const payload = (await res.json()) as {
        choices?: Array<{
          message?: {
            content?: string | null
            tool_calls?: Array<{
              id: string
              function?: { name?: string; arguments?: string }
            }>
          }
        }>
        error?: { message?: string }
      }
      if (payload.error?.message) throw new Error(payload.error.message)
      const message = payload.choices?.[0]?.message
      if (!message) throw new Error('Empty chat response')

      const toolCalls = (message.tool_calls ?? [])
        .map((c) => {
          let args: unknown = {}
          try {
            args = c.function?.arguments ? JSON.parse(c.function.arguments) : {}
          } catch {
            args = { raw: c.function?.arguments }
          }
          return {
            id: c.id,
            name: c.function?.name ?? 'unknown',
            args,
          }
        })
        .filter((c) => c.name !== 'unknown')

      return {
        text: message.content?.trim() || undefined,
        toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      }
    },
  }
}

export const openaiProvider = createOpenAiStyleProvider('openai')
export const openrouterProvider = createOpenAiStyleProvider('openrouter')
export const customProvider = createOpenAiStyleProvider('custom')

export { isChatModel, openAiSupportsTools, headersFor as openAiStyleHeaders, baseUrlFor }
