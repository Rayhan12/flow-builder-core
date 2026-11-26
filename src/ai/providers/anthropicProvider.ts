import {
  assertOk,
  pingFromHttpError,
  providerFetch,
  withTimeoutSignal,
} from './http'
import { toAnthropicTools } from './toolSchema'
import {
  PING_MAX_TOKENS,
  PING_PROMPT,
  PING_TIMEOUT_MS,
  type AgentMessage,
  type AiConnection,
  type ChatRequest,
  type LLMProvider,
  type ModelInfo,
} from './types'

const ANTHROPIC_BASE = 'https://api.anthropic.com/v1'
const ANTHROPIC_VERSION = '2023-06-01'

function headers(conn: AiConnection): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'x-api-key': conn.apiKey,
    'anthropic-version': ANTHROPIC_VERSION,
    'anthropic-dangerous-direct-browser-access': 'true',
  }
}

type AnthropicBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: unknown }
  | { type: 'tool_result'; tool_use_id: string; content: string }

function toAnthropicMessages(messages: AgentMessage[]): Array<{ role: 'user' | 'assistant'; content: unknown }> {
  const out: Array<{ role: 'user' | 'assistant'; content: unknown }> = []
  let pendingToolResults: AnthropicBlock[] = []

  const flushTools = () => {
    if (pendingToolResults.length === 0) return
    out.push({ role: 'user', content: pendingToolResults })
    pendingToolResults = []
  }

  for (const m of messages) {
    if (m.role === 'tool') {
      pendingToolResults.push({
        type: 'tool_result',
        tool_use_id: m.toolCallId ?? '',
        content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content ?? m.text ?? ''),
      })
      continue
    }
    flushTools()
    if (m.role === 'user') {
      out.push({ role: 'user', content: m.text ?? '' })
      continue
    }
    if (m.role === 'assistant') {
      if (m.toolCalls && m.toolCalls.length > 0) {
        const blocks: AnthropicBlock[] = []
        if (m.text) blocks.push({ type: 'text', text: m.text })
        for (const c of m.toolCalls) {
          blocks.push({ type: 'tool_use', id: c.id, name: c.name, input: c.args ?? {} })
        }
        out.push({ role: 'assistant', content: blocks })
      } else {
        out.push({ role: 'assistant', content: m.text ?? '' })
      }
    }
  }
  flushTools()
  return out
}

export const anthropicProvider: LLMProvider = {
  id: 'anthropic',

  async listModels(conn, opts) {
    const doFetch = opts?.fetchImpl ?? fetch
    const models: ModelInfo[] = []
    let afterId: string | undefined
    // Anthropic pages with has_more / last_id (after_id query).
    for (;;) {
      const url = new URL(`${ANTHROPIC_BASE}/models`)
      url.searchParams.set('limit', '100')
      if (afterId) url.searchParams.set('after_id', afterId)
      const res = await providerFetch(
        url.toString(),
        { method: 'GET', headers: headers(conn), signal: opts?.signal },
        doFetch,
      )
      await assertOk(res)
      const payload = (await res.json()) as {
        data?: Array<{ id?: string; display_name?: string }>
        has_more?: boolean
        last_id?: string
      }
      for (const entry of payload.data ?? []) {
        const id = entry.id?.trim()
        if (!id) continue
        models.push({
          id,
          displayName: entry.display_name,
          supportsTools: /claude-3|claude-sonnet|claude-opus|claude-haiku/i.test(id),
        })
      }
      if (!payload.has_more || !payload.last_id) break
      afterId = payload.last_id
    }
    return models
  },

  async ping(conn, model, opts) {
    const doFetch = opts?.fetchImpl ?? fetch
    const { signal, clear } = withTimeoutSignal(PING_TIMEOUT_MS, opts?.signal)
    try {
      const res = await providerFetch(
        `${ANTHROPIC_BASE}/messages`,
        {
          method: 'POST',
          headers: headers(conn),
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
      const payload = (await res.json()) as { content?: unknown[] }
      if (!payload.content || payload.content.length === 0) {
        return { usable: false, reason: 'error', detail: 'Empty ping response' }
      }
      return { usable: true, supportsTools: true }
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
      max_tokens: req.maxTokens ?? (req.jsonMode ? 8192 : 4096),
      system: req.system,
      messages: toAnthropicMessages(req.messages),
      temperature: req.temperature ?? 0.2,
    }
    if (tools.length > 0) {
      body.tools = toAnthropicTools(tools)
    }

    const res = await providerFetch(
      `${ANTHROPIC_BASE}/messages`,
      {
        method: 'POST',
        headers: headers(conn),
        signal: req.signal,
        body: JSON.stringify(body),
      },
      doFetch,
    )
    await assertOk(res)
    const payload = (await res.json()) as {
      content?: Array<{ type: string; text?: string; id?: string; name?: string; input?: unknown }>
      error?: { message?: string }
    }
    if (payload.error?.message) throw new Error(payload.error.message)
    const blocks = payload.content ?? []
    const toolCalls = blocks
      .filter((b) => b.type === 'tool_use' && b.id && b.name)
      .map((b) => ({ id: b.id!, name: b.name!, args: b.input ?? {} }))
    const text = blocks
      .filter((b) => b.type === 'text')
      .map((b) => b.text ?? '')
      .join('')
      .trim()
    return {
      text: text || undefined,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
    }
  },
}

export { headers as anthropicHeaders }
