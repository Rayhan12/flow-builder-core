import { z } from 'zod'
import {
  TOOL_LIST,
  type ToolDefinition,
  type ToolName,
} from '../../../shared/tools'
import type { ToolDecl } from './types'

const JSON_ARG_NOTE = ' Send this value as a JSON encoded string.'

/** Strip JSON Schema keys that many providers reject. */
export function cleanJsonSchema(node: unknown): Record<string, unknown> {
  if (!node || typeof node !== 'object') return { type: 'object', properties: {} }
  const s = node as Record<string, unknown>
  const out: Record<string, unknown> = {}
  if (typeof s.type === 'string') out.type = s.type
  if (typeof s.description === 'string') out.description = s.description
  if (Array.isArray(s.enum)) out.enum = s.enum
  if (Array.isArray(s.required)) out.required = s.required
  if (s.items) out.items = cleanJsonSchema(s.items)
  if (s.properties && typeof s.properties === 'object') {
    const props: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(s.properties as Record<string, unknown>)) {
      props[k] = cleanJsonSchema(v)
    }
    out.properties = props
  }
  if (!out.type) out.type = 'object'
  if (out.type === 'object' && !out.properties) out.properties = {}
  return out
}

type GeminiSchema = {
  type: 'STRING' | 'NUMBER' | 'INTEGER' | 'BOOLEAN' | 'ARRAY' | 'OBJECT'
  description?: string
  enum?: string[]
  properties?: Record<string, GeminiSchema>
  required?: string[]
  items?: GeminiSchema
}

export function toGeminiSchema(node: unknown): GeminiSchema {
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
      return withDesc({ type: 'ARRAY', items: toGeminiSchema(s.items) })
    case 'object': {
      const props = (s.properties ?? {}) as Record<string, unknown>
      const entries = Object.entries(props)
      if (entries.length === 0) {
        return {
          type: 'STRING',
          description: `${description ?? 'JSON value'}${JSON_ARG_NOTE}`,
        }
      }
      const out: GeminiSchema = {
        type: 'OBJECT',
        properties: Object.fromEntries(entries.map(([k, v]) => [k, toGeminiSchema(v)])),
      }
      if (Array.isArray(s.required)) out.required = s.required as string[]
      return withDesc(out)
    }
    default:
      return withDesc({ type: 'STRING' })
  }
}

export function toolDeclFromDefinition(def: ToolDefinition): ToolDecl {
  const json = z.toJSONSchema(def.input, { io: 'input' }) as {
    type?: string
    properties?: Record<string, unknown>
    required?: string[]
    description?: string
  }
  const properties: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(json.properties ?? {})) {
    if (def.jsonArgs.includes(key)) {
      const desc = (value as { description?: string }).description ?? 'JSON value'
      properties[key] = {
        type: 'string',
        description: `${desc}${JSON_ARG_NOTE}`,
      }
    } else {
      properties[key] = cleanJsonSchema(value)
    }
  }
  return {
    name: def.name,
    description: def.description,
    parameters: cleanJsonSchema({
      type: 'object',
      properties,
      ...(json.required && json.required.length > 0 ? { required: json.required } : {}),
    }),
  }
}

export function buildToolDecls(tools?: readonly ToolName[]): ToolDecl[] {
  const list = tools
    ? TOOL_LIST.filter((d) => (tools as readonly string[]).includes(d.name))
    : TOOL_LIST
  return list.map(toolDeclFromDefinition)
}

/** Map shared tools to Gemini function declarations (jsonArgs become STRING). */
export function toGeminiFunctionDeclarations(tools?: readonly ToolName[]) {
  const list = tools
    ? TOOL_LIST.filter((d) => (tools as readonly string[]).includes(d.name))
    : TOOL_LIST
  return list.map(toGeminiFunctionDeclaration)
}

function toGeminiFunctionDeclaration(def: ToolDefinition): {
  name: string
  description: string
  parameters?: GeminiSchema
} {
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
      properties[key] = toGeminiSchema(value)
    }
  }
  const decl: { name: string; description: string; parameters?: GeminiSchema } = {
    name: def.name,
    description: def.description,
  }
  if (Object.keys(properties).length > 0) {
    decl.parameters = {
      type: 'OBJECT',
      properties,
      ...(json.required && json.required.length > 0 ? { required: json.required } : {}),
    }
  }
  return decl
}

export function toOpenAiTools(tools: ToolDecl[]) {
  return tools.map((t) => ({
    type: 'function' as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    },
  }))
}

export function toAnthropicTools(tools: ToolDecl[]) {
  return tools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.parameters,
  }))
}
