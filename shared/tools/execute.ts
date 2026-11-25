import { ZodError } from 'zod'
import { TOOL_DEFINITIONS, isToolName } from './definitions.ts'
import {
  ToolError,
  type DataPort,
  type DiagramSummary,
  type ExecuteOptions,
  type ToolResult,
} from './types.ts'

function fail(code: Extract<ToolResult, { ok: false }>['code'], error: string): ToolResult {
  return { ok: false, code, error }
}

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`
}

function diagramPath(projectId: string, diagramId: string): string {
  return `/p/${projectId}/d/${diagramId}`
}

function projectPath(projectId: string): string {
  return `/p/${projectId}`
}

/** Decode free-form JSON args that a model API sent as strings. */
function coerceJsonArgs(jsonArgs: readonly string[], args: unknown): unknown {
  if (!args || typeof args !== 'object' || Array.isArray(args)) return args
  const record = { ...(args as Record<string, unknown>) }
  for (const key of jsonArgs) {
    const value = record[key]
    if (typeof value !== 'string') continue
    try {
      record[key] = JSON.parse(value)
    } catch {
      throw new ToolError('invalid_args', `${key} is not valid JSON`)
    }
  }
  return record
}

function describeZodError(err: ZodError): string {
  return err.issues
    .slice(0, 3)
    .map((i) => `${i.path.length ? i.path.join('.') : 'args'}: ${i.message}`)
    .join('; ')
}

function diagramResult(
  d: DiagramSummary,
  summary: string,
  mutated: boolean,
  data: unknown = d,
): ToolResult {
  return { ok: true, data, summary, openPath: diagramPath(d.projectId, d.id), mutated }
}

/**
 * Validate `args` with the tool's zod schema and run it against `port`.
 *
 * Never throws: every failure comes back as `{ ok: false, code, error }` so a
 * model can read it and recover.
 *
 * Destructive tools (`delete_diagram`) have two gates:
 *  1. `args.confirm === true`, set by the model or MCP client.
 *  2. `opts.allowDestructive === true`, set by the caller after its own
 *     approval step (the browser panel sets it after the confirm dialog).
 */
export async function executeTool(
  name: string,
  args: unknown,
  port: DataPort,
  opts: ExecuteOptions = {},
): Promise<ToolResult> {
  if (!isToolName(name)) return fail('unknown_tool', `Unknown tool: ${name}`)
  const def = TOOL_DEFINITIONS[name]

  try {
    const parsed = def.input.safeParse(coerceJsonArgs(def.jsonArgs, args ?? {}))
    if (!parsed.success) return fail('invalid_args', describeZodError(parsed.error))
    const input = parsed.data as Record<string, any>

    if (def.destructive) {
      if (input.confirm !== true) {
        return fail('confirm_required', `${name} is destructive. Call it again with confirm: true.`)
      }
      if (opts.allowDestructive !== true) {
        return fail('not_allowed', `${name} needs approval from the user and was not run.`)
      }
    }

    switch (def.name) {
      case 'list_projects': {
        const projects = await port.listProjects()
        return {
          ok: true,
          data: { projects },
          summary: `Found ${plural(projects.length, 'project')}`,
          mutated: false,
        }
      }
      case 'get_project': {
        const project = await port.getProject(input.projectId)
        if (!project) return fail('not_found', `Project not found: ${input.projectId}`)
        return {
          ok: true,
          data: project,
          summary: `Project "${project.name}"`,
          openPath: projectPath(project.id),
          mutated: false,
        }
      }
      case 'create_project': {
        const project = await port.createProject({ name: input.name })
        return {
          ok: true,
          data: project,
          summary: `Created project "${project.name}"`,
          openPath: projectPath(project.id),
          mutated: true,
        }
      }
      case 'list_diagrams': {
        const diagrams = await port.listDiagrams(input.projectId)
        return {
          ok: true,
          data: { diagrams },
          summary: `Found ${plural(diagrams.length, 'diagram')}`,
          openPath: projectPath(input.projectId),
          mutated: false,
        }
      }
      case 'get_diagram': {
        const found = await port.getDiagram(input.projectId, input.diagramId)
        if (!found) return fail('not_found', `Diagram not found: ${input.diagramId}`)
        return diagramResult(
          found,
          `Read "${found.title}" (${plural(found.nodeCount, 'node')})`,
          false,
          found,
        )
      }
      case 'create_diagram': {
        const created = await port.createDiagram(input.projectId, input.title, input.diagram)
        return diagramResult(created, `Created diagram "${created.title}"`, true)
      }
      case 'update_diagram': {
        const updated = await port.updateDiagram(input.projectId, input.diagramId, input.diagram)
        return diagramResult(
          updated,
          `Replaced "${updated.title}" (${plural(updated.nodeCount, 'node')})`,
          true,
        )
      }
      case 'apply_diagram_edits': {
        const edited = await port.applyDiagramEdits(input.projectId, input.diagramId, input.ops)
        return diagramResult(
          edited,
          `Edited "${edited.title}": ${edited.changeSummary}`,
          true,
          edited,
        )
      }
      case 'rename_diagram': {
        const renamed = await port.renameDiagram(input.projectId, input.diagramId, input.title)
        return diagramResult(renamed, `Renamed to "${renamed.title}"`, true)
      }
      case 'delete_diagram': {
        await port.deleteDiagram(input.projectId, input.diagramId)
        return {
          ok: true,
          data: { deleted: true, projectId: input.projectId, diagramId: input.diagramId },
          summary: 'Deleted diagram',
          openPath: projectPath(input.projectId),
          mutated: true,
        }
      }
      default: {
        const _never: never = def
        return fail('unknown_tool', `Unknown tool: ${String((_never as { name: string }).name)}`)
      }
    }
  } catch (err) {
    if (err instanceof ToolError) return fail(err.code, err.message)
    if (err instanceof ZodError) return fail('invalid_args', describeZodError(err))
    return fail('failed', err instanceof Error ? err.message : 'Tool failed')
  }
}
