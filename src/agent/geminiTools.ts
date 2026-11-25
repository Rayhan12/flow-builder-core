import { z } from 'zod'
import {
  TOOL_LIST,
  executeTool,
  getToolDefinition,
  type DataPort,
  type ToolDefinition,
  type ToolName,
  type ToolResult,
} from '../../shared/tools'

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta'
const DEFAULT_MAX_STEPS = 8
/** Keep tool results small enough for the model context. */
const MAX_RESULT_CHARS = 48_000

export type AgentChatTurn = { role: 'user' | 'assistant'; text: string }

export type AgentToolCall = {
  id: string
  name: string
  args: unknown
  status: 'running' | 'done' | 'error' | 'declined'
  result?: ToolResult
  /** App route for the Open link, copied from the result. */
  openPath?: string
}

export type GenerateWithToolsOptions = {
  apiKey: string
  model: string
  system: string
  /** Earlier turns of this chat (text only). */
  history: AgentChatTurn[]
  userText: string
  port: DataPort
  /** Restrict which tools the model may use. Defaults to all. */
  tools?: readonly ToolName[]
  maxSteps?: number
  /**
   * Called before a destructive tool runs, after the model already set
   * `confirm: true`. Return true only when the user approved. Without it,
   * destructive tools are always declined.
   */
  confirmDestructive?: (call: { name: string; args: unknown }) => Promise<boolean>
  /** Called when a tool call starts (status running) and again when it ends. */
  onToolCall?: (call: AgentToolCall) => void
  signal?: AbortSignal
  fetchImpl?: typeof fetch
}

export type GenerateWithToolsResult = {
  text: string
  toolCalls: AgentToolCall[]
  steps: number
}

// --- JSON Schema mapping ---

type GeminiSchema = {
  type: 'STRING' | 'NUMBER' | 'INTEGER' | 'BOOLEAN' | 'ARRAY' | 'OBJECT'
  description?: string
  enum?: string[]
  properties?: Record<string, GeminiSchema>
  required?: string[]
  items?: GeminiSchema
}

const JSON_ARG_NOTE = ' Send this value as a JSON encoded string.'

function mapSchema(node: unknown): GeminiSchema {
  const s = (node && typeof node === 'object' ? node : {}) as Record<string, unknown>
  const description = typeof s.description === 'string' ? s.description : undefined
  const withDesc = <T extends GeminiSchema>(out: T): T =>
    description ? { ...out, description } : out

  if (Array.isArray(s.enum) && s.enum.every((v) => typeof v === 'string')) {
    return withDesc({ type: 'STRING', enum: s.enum as string[] })
  }
  switch (s.type) {
    case 'string':
      return withDesc({ type: 'STRING' })
    case 'number':
      return withDesc({ type: 'NUMBER' })
    case 'integer':
      return withDesc({ type: 'INTEGER' })
    case 'boolean':
      return withDesc({ type: 'BOOLEAN' })
    case 'array':
      return withDesc({ type: 'ARRAY', items: mapSchema(s.items) })
    case 'object': {
      const props = (s.properties ?? {}) as Record<string, unknown>
      const entries = Object.entries(props)
      // Gemini rejects OBJECT schemas without properties, so free-form objects
      // become JSON encoded strings.
      if (entries.length === 0) {
        return { type: 'STRING', description: `${description ?? 'JSON value'}${JSON_ARG_NOTE}` }
      }
      const out: GeminiSchema = {
        type: 'OBJECT',
        properties: Object.fromEntries(entries.map(([k, v]) => [k, mapSchema(v)])),
      }
      if (Array.isArray(s.required) && s.required.length > 0) {
        out.required = s.required.filter((r): r is string => typeof r === 'string')
      }
      return withDesc(out)
    }
    default:
      return withDesc({ type: 'STRING' })
  }
}

export type FunctionDeclaration = {
  name: string
  description: string
  parameters?: GeminiSchema
}

/** Map one shared tool definition to a Gemini function declaration. */
export function toFunctionDeclaration(def: ToolDefinition): FunctionDeclaration {
  const json = z.toJSONSchema(def.input, { io: 'input' }) as {
    properties?: Record<string, unknown>
    required?: string[]
  }
  const properties: Record<string, GeminiSchema> = {}
  for (const [key, value] of Object.entries(json.properties ?? {})) {
    if (def.jsonArgs.includes(key)) {
      const desc = (value as { description?: string }).description ?? 'JSON value'
      properties[key] = { type: 'STRING', description: `${desc}${JSON_ARG_NOTE}` }
    } else {
      properties[key] = mapSchema(value)
    }
  }
  const decl: FunctionDeclaration = { name: def.name, description: def.description }
  if (Object.keys(properties).length > 0) {
    decl.parameters = {
      type: 'OBJECT',
      properties,
      ...(json.required && json.required.length > 0 ? { required: json.required } : {}),
    }
  }
  return decl
}

export function buildFunctionDeclarations(tools?: readonly ToolName[]): FunctionDeclaration[] {
  const list = tools ? TOOL_LIST.filter((t) => (tools as readonly string[]).includes(t.name)) : TOOL_LIST
  return list.map(toFunctionDeclaration)
}

// --- Gemini REST ---

type GeminiPart = {
  text?: string
  thought?: boolean
  functionCall?: { name: string; args?: unknown }
  functionResponse?: { name: string; response: unknown }
  [key: string]: unknown
}
type GeminiContent = { role: 'user' | 'model'; parts: GeminiPart[] }

type GeminiResponse = {
  candidates?: Array<{ content?: GeminiContent; finishReason?: string }>
  promptFeedback?: { blockReason?: string }
  error?: { message?: string }
}

async function callGemini(
  opts: GenerateWithToolsOptions,
  contents: GeminiContent[],
  declarations: FunctionDeclaration[],
): Promise<GeminiResponse> {
  const doFetch = opts.fetchImpl ?? fetch
  const url = `${GEMINI_BASE}/models/${encodeURIComponent(opts.model)}:generateContent?key=${encodeURIComponent(opts.apiKey)}`
  const res = await doFetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: opts.signal,
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: opts.system }] },
      contents,
      tools: [{ functionDeclarations: declarations }],
      toolConfig: { functionCallingConfig: { mode: 'AUTO' } },
      generationConfig: { temperature: 0.2 },
    }),
  })
  const payload = (await res.json().catch(() => null)) as GeminiResponse | null
  if (!res.ok) {
    throw new Error(payload?.error?.message ?? `Gemini request failed (${res.status})`)
  }
  if (!payload) throw new Error('Empty response from Gemini')
  if (payload.error?.message) throw new Error(payload.error.message)
  return payload
}

function toolResponseBody(result: ToolResult): Record<string, unknown> {
  if (!result.ok) return { ok: false, code: result.code, error: result.error }
  let data: unknown = result.data
  if (JSON.stringify(data ?? null).length > MAX_RESULT_CHARS) {
    data = { truncated: true, note: 'Result was too large to show. Use a narrower call.' }
  }
  return { ok: true, summary: result.summary, data }
}

let callSeq = 0
function newCallId(): string {
  callSeq += 1
  return `call-${Date.now().toString(36)}-${callSeq}`
}

async function runOne(
  name: string,
  args: unknown,
  opts: GenerateWithToolsOptions,
): Promise<ToolResult> {
  const def = getToolDefinition(name)
  if (def && opts.tools && !(opts.tools as readonly string[]).includes(name)) {
    return { ok: false, code: 'not_allowed', error: `${name} is not available in this chat.` }
  }
  if (!def?.destructive) return executeTool(name, args, opts.port)

  // Destructive: a dry run first. It reports bad args or a missing `confirm`
  // without side effects, and reports `not_allowed` once args are fine and
  // only the human approval is left.
  const pre = await executeTool(name, args, opts.port)
  if (pre.ok || pre.code !== 'not_allowed') return pre
  const approved = opts.confirmDestructive ? await opts.confirmDestructive({ name, args }) : false
  if (!approved) {
    return { ok: false, code: 'declined', error: 'The user declined this action. Nothing was changed.' }
  }
  return executeTool(name, args, opts.port, { allowDestructive: true })
}

/**
 * Function calling loop: send the chat plus tool declarations, run every
 * functionCall the model returns, send the functionResponses back, and repeat
 * until the model answers with text or `maxSteps` model calls were used.
 */
export async function generateWithTools(
  opts: GenerateWithToolsOptions,
): Promise<GenerateWithToolsResult> {
  const maxSteps = opts.maxSteps ?? DEFAULT_MAX_STEPS
  const declarations = buildFunctionDeclarations(opts.tools)
  const contents: GeminiContent[] = [
    ...opts.history.map<GeminiContent>((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.text }],
    })),
    { role: 'user', parts: [{ text: opts.userText }] },
  ]
  const toolCalls: AgentToolCall[] = []

  for (let step = 1; step <= maxSteps; step++) {
    const payload = await callGemini(opts, contents, declarations)
    const content = payload.candidates?.[0]?.content
    if (!content || !content.parts || content.parts.length === 0) {
      const blocked = payload.promptFeedback?.blockReason
      if (blocked) throw new Error(`Gemini blocked the request (${blocked})`)
      throw new Error('Gemini returned no content')
    }

    const calls = content.parts.filter((p) => p.functionCall)
    if (calls.length === 0) {
      const text = content.parts
        .filter((p) => !p.thought)
        .map((p) => p.text ?? '')
        .join('')
        .trim()
      return { text: text || fallbackText(toolCalls), toolCalls, steps: step }
    }

    // Echo the model turn unchanged (keeps thought signatures intact).
    contents.push({ role: 'model', parts: content.parts })

    const responses: GeminiPart[] = []
    for (const part of calls) {
      const fc = part.functionCall as { name: string; args?: unknown }
      const call: AgentToolCall = {
        id: newCallId(),
        name: fc.name,
        args: fc.args ?? {},
        status: 'running',
      }
      toolCalls.push(call)
      opts.onToolCall?.({ ...call })

      const result = await runOne(fc.name, fc.args ?? {}, opts)
      call.result = result
      call.status = result.ok ? 'done' : result.code === 'declined' ? 'declined' : 'error'
      if (result.ok && result.openPath) call.openPath = result.openPath
      opts.onToolCall?.({ ...call })

      responses.push({ functionResponse: { name: fc.name, response: toolResponseBody(result) } })
    }
    contents.push({ role: 'user', parts: responses })
  }

  return {
    text: `I stopped after ${maxSteps} steps. Ask me to continue if the task is not finished.`,
    toolCalls,
    steps: maxSteps,
  }
}

function fallbackText(toolCalls: AgentToolCall[]): string {
  const last = [...toolCalls].reverse().find((c) => c.result?.ok)
  return last?.result?.ok ? `Done. ${last.result.summary}.` : 'I could not produce a reply. Try rephrasing.'
}
