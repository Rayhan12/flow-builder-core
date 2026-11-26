import type { DataPort, ToolName, ToolResult } from '../../shared/tools'
import {
  runAgentLoop,
  type AgentLoopOptions,
  type AgentToolCall as LoopToolCall,
} from '../ai/providers/agentLoop'
import { toGeminiFunctionDeclarations } from '../ai/providers/toolSchema'
import type { AiConnection } from '../ai/providers/types'

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
  connection?: AiConnection
  supportsTools?: boolean
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

export function buildFunctionDeclarations(tools?: readonly ToolName[]) {
  return toGeminiFunctionDeclarations(tools)
}

/**
 * Function calling loop over the active LLM provider (defaults to Gemini when
 * only apiKey/model are passed). Same confirm + tool card behaviour as before.
 */
export async function generateWithTools(
  opts: GenerateWithToolsOptions,
): Promise<GenerateWithToolsResult> {
  const connection: AiConnection =
    opts.connection ??
    ({
      id: 'session-gemini',
      provider: 'gemini',
      label: 'Gemini',
      apiKey: opts.apiKey,
      createdAt: Date.now(),
    } satisfies AiConnection)

  const loopOpts: AgentLoopOptions = {
    connection,
    model: opts.model,
    system: opts.system,
    history: opts.history,
    userText: opts.userText,
    port: opts.port,
    tools: opts.tools,
    maxSteps: opts.maxSteps ?? 12,
    supportsTools: opts.supportsTools,
    confirmDestructive: opts.confirmDestructive,
    onToolCall: opts.onToolCall as ((call: LoopToolCall) => void) | undefined,
    signal: opts.signal,
    fetchImpl: opts.fetchImpl,
  }

  const result = await runAgentLoop(loopOpts)
  return {
    text: result.text,
    toolCalls: result.toolCalls,
    steps: result.steps,
  }
}
