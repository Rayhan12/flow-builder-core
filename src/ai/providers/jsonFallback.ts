import { z } from 'zod'
import type { ChatResponse, ToolDecl } from './types'

const ToolJsonSchema = z.object({
  tool: z.string().min(1),
  args: z.unknown().optional(),
})

/**
 * Prompt appendix for models that cannot call tools natively.
 * The model must reply with JSON: { "tool": name, "args": {...} } or a plain message.
 */
export function jsonToolFallbackSystem(tools: ToolDecl[]): string {
  const catalog = tools
    .map((t) => `- ${t.name}: ${t.description}`)
    .join('\n')
  return `You cannot call tools directly. When you need a tool, reply with ONLY JSON of the form {"tool":"<name>","args":{...}} using one of these tools:\n${catalog}\nWhen you are done and have no more tools to call, reply with plain text (not JSON).`
}

export function parseJsonToolFallback(text: string): ChatResponse {
  const trimmed = text.trim()
  if (!trimmed) return { text: '' }
  const fence = trimmed.match(/^```(?:json)?\s*([\s\S]*?)```$/i)
  const body = fence ? fence[1]!.trim() : trimmed
  try {
    const parsed = JSON.parse(body) as unknown
    const tool = ToolJsonSchema.safeParse(parsed)
    if (tool.success) {
      return {
        toolCalls: [
          {
            id: `json-fallback-${tool.data.tool}`,
            name: tool.data.tool,
            args: tool.data.args ?? {},
          },
        ],
      }
    }
  } catch {
    // not JSON; treat as plain text
  }
  return { text: trimmed }
}
