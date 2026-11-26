import {
  assertOk,
  pingFromHttpError,
  providerFetch,
  withTimeoutSignal,
} from './http'
import { toGeminiSchema } from './toolSchema'
import {
  PING_MAX_TOKENS,
  PING_PROMPT,
  PING_TIMEOUT_MS,
  type AgentMessage,
  type AiConnection,
  type ChatRequest,
  type ChatResponse,
  type LLMProvider,
  type ModelInfo,
  type ToolDecl,
} from './types'

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta'

type GeminiPart = {
  text?: string
  thought?: boolean
  functionCall?: { name: string; args?: unknown }
  functionResponse?: { name: string; response: unknown }
  [key: string]: unknown
}

type GeminiContent = { role: 'user' | 'model'; parts: GeminiPart[] }

function geminiSupportsTools(modelId: string): boolean {
  const id = modelId.toLowerCase()
  return /gemini-1\.5|gemini-2|gemini-flash|gemini-pro|gemini-exp/.test(id)
}

function headers(conn: AiConnection): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'x-goog-api-key': conn.apiKey,
  }
}

function toContents(messages: AgentMessage[]): GeminiContent[] {
  const contents: GeminiContent[] = []
  let pendingToolParts: GeminiPart[] = []

  const flushTools = () => {
    if (pendingToolParts.length === 0) return
    contents.push({ role: 'user', parts: pendingToolParts })
    pendingToolParts = []
  }

  for (const m of messages) {
    if (m.role === 'tool') {
      pendingToolParts.push({
        functionResponse: {
          name: m.name ?? 'tool',
          response: m.content ?? { result: m.text ?? '' },
        },
      })
      continue
    }
    flushTools()
    if (m.role === 'user') {
      contents.push({ role: 'user', parts: [{ text: m.text ?? '' }] })
      continue
    }
    if (m.role === 'assistant') {
      if (Array.isArray(m.rawParts) && m.rawParts.length > 0) {
        contents.push({
          role: 'model',
          parts: m.rawParts as GeminiPart[],
        })
        continue
      }
      if (m.toolCalls && m.toolCalls.length > 0) {
        contents.push({
          role: 'model',
          parts: m.toolCalls.map((c) => ({
            functionCall: { name: c.name, args: c.args ?? {} },
          })),
        })
        continue
      }
      contents.push({ role: 'model', parts: [{ text: m.text ?? '' }] })
    }
  }
  flushTools()
  return contents
}

function declsFromTools(tools: ToolDecl[]) {
  return tools.map((t) => {
    const rawProps =
      t.parameters && typeof t.parameters === 'object'
        ? ((t.parameters as { properties?: Record<string, unknown> }).properties ?? {})
        : {}
    const decl: { name: string; description: string; parameters?: ReturnType<typeof toGeminiSchema> } = {
      name: t.name,
      description: t.description,
    }
    if (Object.keys(rawProps).length === 0) return decl
    decl.parameters = toGeminiSchema(t.parameters)
    return decl
  })
}

export const geminiProvider: LLMProvider = {
  id: 'gemini',

  async listModels(conn, opts) {
    const doFetch = opts?.fetchImpl ?? fetch
    const models: ModelInfo[] = []
    let pageToken: string | undefined
    for (;;) {
      const url = new URL(`${GEMINI_BASE}/models`)
      url.searchParams.set('pageSize', '100')
      if (pageToken) url.searchParams.set('pageToken', pageToken)
      const res = await providerFetch(
        url.toString(),
        { method: 'GET', headers: headers(conn), signal: opts?.signal },
        doFetch,
      )
      await assertOk(res)
      const payload = (await res.json()) as {
        models?: Array<{ name?: string; supportedGenerationMethods?: string[] }>
        nextPageToken?: string
      }
      for (const entry of payload.models ?? []) {
        const methods = entry.supportedGenerationMethods ?? []
        if (!methods.includes('generateContent')) continue
        let id = entry.name ?? ''
        if (id.startsWith('models/')) id = id.slice('models/'.length)
        if (!id) continue
        models.push({ id, supportsTools: geminiSupportsTools(id) })
      }
      if (!payload.nextPageToken) break
      pageToken = payload.nextPageToken
    }
    return models
  },

  async ping(conn, model, opts) {
    const doFetch = opts?.fetchImpl ?? fetch
    const { signal, clear } = withTimeoutSignal(PING_TIMEOUT_MS, opts?.signal)
    try {
      const res = await providerFetch(
        `${GEMINI_BASE}/models/${encodeURIComponent(model)}:generateContent`,
        {
          method: 'POST',
          headers: headers(conn),
          signal,
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: PING_PROMPT }] }],
            generationConfig: { maxOutputTokens: PING_MAX_TOKENS },
          }),
        },
        doFetch,
      )
      await assertOk(res)
      const payload = (await res.json()) as {
        candidates?: Array<{ content?: { parts?: GeminiPart[] } }>
      }
      const parts = payload.candidates?.[0]?.content?.parts
      if (!parts || parts.length === 0) {
        return { usable: false, reason: 'error', detail: 'Empty ping response' }
      }
      return { usable: true, supportsTools: geminiSupportsTools(model) }
    } catch (err) {
      return pingFromHttpError(err)
    } finally {
      clear()
    }
  },

  async chat(conn, req, opts) {
    const doFetch = opts?.fetchImpl ?? fetch
    const tools = req.tools ?? []
    const body: Record<string, unknown> = {
      systemInstruction: { parts: [{ text: req.system }] },
      contents: toContents(req.messages),
      generationConfig: {
        temperature: req.temperature ?? 0.2,
        ...(req.maxTokens ? { maxOutputTokens: req.maxTokens } : {}),
        ...(req.jsonMode ? { responseMimeType: 'application/json' } : {}),
      },
    }
    if (tools.length > 0) {
      body.tools = [{ functionDeclarations: declsFromTools(tools) }]
      body.toolConfig = { functionCallingConfig: { mode: 'AUTO' } }
    }

    const res = await providerFetch(
      `${GEMINI_BASE}/models/${encodeURIComponent(req.model)}:generateContent`,
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
      candidates?: Array<{ content?: GeminiContent }>
      promptFeedback?: { blockReason?: string }
      error?: { message?: string }
    }
    if (payload.error?.message) throw new Error(payload.error.message)
    const content = payload.candidates?.[0]?.content
    if (!content?.parts?.length) {
      const blocked = payload.promptFeedback?.blockReason
      if (blocked) throw new Error(`Gemini blocked the request (${blocked})`)
      throw new Error('Gemini returned no content')
    }

    const calls = content.parts.filter((p) => p.functionCall)
    if (calls.length > 0) {
      return {
        toolCalls: calls.map((p, i) => {
          const fc = p.functionCall as { name: string; args?: unknown }
          return {
            id: `gemini-${i}-${fc.name}`,
            name: fc.name,
            args: fc.args ?? {},
          }
        }),
        rawAssistant: content.parts,
        text: content.parts
          .filter((p) => p.text && !p.thought)
          .map((p) => p.text ?? '')
          .join('')
          .trim() || undefined,
      }
    }

    const text = content.parts
      .filter((p) => !p.thought)
      .map((p) => p.text ?? '')
      .join('')
      .trim()
    return { text }
  },
}

/** Attach Gemini raw parts onto an assistant message for the next tool turn. */
export function withGeminiRawParts(
  message: AgentMessage,
  rawParts: unknown,
): AgentMessage & { rawParts: GeminiPart[] } {
  return { ...message, rawParts: rawParts as GeminiPart[] }
}

export type { ChatRequest, ChatResponse }
