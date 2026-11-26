import {
  executeTool,
  getToolDefinition,
  type DataPort,
  type ToolName,
  type ToolResult,
} from '../../../shared/tools'
import { getProvider } from './factory'
import { jsonToolFallbackSystem, parseJsonToolFallback } from './jsonFallback'
import { buildToolDecls } from './toolSchema'
import type {
  AgentMessage,
  AiConnection,
  ChatResponse,
  FetchImpl,
  LLMProvider,
} from './types'

const DEFAULT_MAX_STEPS = 12
const MAX_RESULT_CHARS = 48_000

export type AgentChatTurn = { role: 'user' | 'assistant'; text: string }

export type AgentToolCall = {
  id: string
  name: string
  args: unknown
  status: 'running' | 'done' | 'error' | 'declined'
  result?: ToolResult
  openPath?: string
}

export type AgentLoopOptions = {
  connection: AiConnection
  model: string
  system: string
  history: AgentChatTurn[]
  userText: string
  port: DataPort
  tools?: readonly ToolName[]
  maxSteps?: number
  supportsTools?: boolean
  confirmDestructive?: (call: { name: string; args: unknown }) => Promise<boolean>
  onToolCall?: (call: AgentToolCall) => void
  signal?: AbortSignal
  fetchImpl?: FetchImpl
  provider?: LLMProvider
}

export type AgentLoopResult = {
  text: string
  toolCalls: AgentToolCall[]
  steps: number
}

let callSeq = 0
function newCallId(): string {
  callSeq += 1
  return `call-${Date.now().toString(36)}-${callSeq}`
}

function toolResponseBody(result: ToolResult): Record<string, unknown> {
  if (!result.ok) return { ok: false, code: result.code, error: result.error }
  let data: unknown = result.data
  if (JSON.stringify(data ?? null).length > MAX_RESULT_CHARS) {
    data = { truncated: true, note: 'Result was too large to show. Use a narrower call.' }
  }
  return { ok: true, summary: result.summary, data }
}

async function runOne(
  name: string,
  args: unknown,
  opts: AgentLoopOptions,
): Promise<ToolResult> {
  const def = getToolDefinition(name)
  if (def && opts.tools && !(opts.tools as readonly string[]).includes(name)) {
    return { ok: false, code: 'not_allowed', error: `${name} is not available in this chat.` }
  }
  if (!def?.destructive) return executeTool(name, args, opts.port)

  const pre = await executeTool(name, args, opts.port)
  if (pre.ok || pre.code !== 'not_allowed') return pre
  const approved = opts.confirmDestructive ? await opts.confirmDestructive({ name, args }) : false
  if (!approved) {
    return {
      ok: false,
      code: 'declined',
      error: 'The user declined this action. Nothing was changed.',
    }
  }
  return executeTool(name, args, opts.port, { allowDestructive: true })
}

function fallbackText(toolCalls: AgentToolCall[]): string {
  const last = [...toolCalls].reverse().find((c) => c.result?.ok)
  return last?.result?.ok
    ? `Done. ${last.result.summary}.`
    : 'I could not produce a reply. Try rephrasing.'
}

/**
 * Shared agent loop: works with any LLMProvider. Uses native tool calling when
 * supportsTools is true; otherwise JSON-mode tool fallback.
 */
export async function runAgentLoop(opts: AgentLoopOptions): Promise<AgentLoopResult> {
  const maxSteps = opts.maxSteps ?? DEFAULT_MAX_STEPS
  const provider = opts.provider ?? getProvider(opts.connection.provider)
  const decls = buildToolDecls(opts.tools)
  const useNativeTools = opts.supportsTools !== false && decls.length > 0
  const system = useNativeTools
    ? opts.system
    : `${opts.system}\n\n${jsonToolFallbackSystem(decls)}`

  const messages: AgentMessage[] = [
    ...opts.history.map<AgentMessage>((m) => ({
      role: m.role,
      text: m.text,
    })),
    { role: 'user', text: opts.userText },
  ]
  const toolCalls: AgentToolCall[] = []

  for (let step = 1; step <= maxSteps; step++) {
    let response: ChatResponse = await provider.chat(
      opts.connection,
      {
        model: opts.model,
        system,
        messages,
        tools: useNativeTools ? decls : undefined,
        jsonMode: !useNativeTools,
        temperature: 0.2,
        signal: opts.signal,
      },
      { fetchImpl: opts.fetchImpl },
    )

    if (!useNativeTools && response.text && !response.toolCalls) {
      response = parseJsonToolFallback(response.text)
    }

    if (!response.toolCalls || response.toolCalls.length === 0) {
      const text = (response.text ?? '').trim()
      return { text: text || fallbackText(toolCalls), toolCalls, steps: step }
    }

    messages.push({
      role: 'assistant',
      text: response.text,
      toolCalls: response.toolCalls,
      rawParts: response.rawAssistant,
    })

    for (const tc of response.toolCalls) {
      const call: AgentToolCall = {
        id: tc.id || newCallId(),
        name: tc.name,
        args: tc.args ?? {},
        status: 'running',
      }
      toolCalls.push(call)
      opts.onToolCall?.({ ...call })

      const result = await runOne(tc.name, tc.args ?? {}, opts)
      call.result = result
      call.status = result.ok ? 'done' : result.code === 'declined' ? 'declined' : 'error'
      if (result.ok && result.openPath) call.openPath = result.openPath
      opts.onToolCall?.({ ...call })

      messages.push({
        role: 'tool',
        toolCallId: call.id,
        name: call.name,
        content: toolResponseBody(result),
        text: JSON.stringify(toolResponseBody(result)),
      })
    }
  }

  return {
    text: `I stopped after ${maxSteps} steps. Ask me to continue if the task is not finished.`,
    toolCalls,
    steps: maxSteps,
  }
}
