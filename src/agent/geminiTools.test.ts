import { describe, expect, it, vi } from 'vitest'
import { MCP_TOOL_NAMES } from '../../shared/tools'
import { createMemoryDataPort } from '../../shared/tools/memoryPort'
import { buildFunctionDeclarations, generateWithTools } from './geminiTools'

function reply(parts: unknown[]) {
  return new Response(JSON.stringify({ candidates: [{ content: { role: 'model', parts } }] }), {
    status: 200,
  })
}

function scripted(responses: Response[]) {
  const queue = [...responses]
  const calls: Array<{ url: string; body: any }> = []
  const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), body: JSON.parse(String(init?.body)) })
    const next = queue.shift()
    if (!next) throw new Error('No more scripted responses')
    return next
  }) as unknown as typeof fetch
  return { fetchImpl, calls }
}

const base = { apiKey: 'k', model: 'gemini-2.5-flash', system: 'sys', history: [] }

describe('buildFunctionDeclarations', () => {
  it('declares exactly the MCP tool names in order', () => {
    expect(buildFunctionDeclarations().map((d) => d.name)).toEqual([...MCP_TOOL_NAMES])
  })

  it('uses only the Gemini schema subset and encodes free-form JSON as strings', () => {
    const decls = buildFunctionDeclarations()
    const byName = Object.fromEntries(decls.map((d) => [d.name, d]))

    expect(byName.list_projects.parameters).toBeUndefined()
    expect(byName.get_diagram.parameters).toMatchObject({
      type: 'OBJECT',
      required: ['projectId', 'diagramId'],
      properties: { projectId: { type: 'STRING' }, diagramId: { type: 'STRING' } },
    })
    expect(byName.apply_diagram_edits.parameters?.properties?.ops.type).toBe('STRING')
    expect(byName.create_diagram.parameters?.properties?.diagram.type).toBe('STRING')
    expect(byName.create_diagram.parameters?.required).toEqual(['projectId', 'title'])
    expect(byName.delete_diagram.parameters?.properties?.confirm.type).toBe('BOOLEAN')

    const json = JSON.stringify(decls)
    for (const banned of ['$schema', 'additionalProperties', 'propertyNames', '"pattern"', 'minItems']) {
      expect(json).not.toContain(banned)
    }
  })

  it('can be limited to a subset of tools', () => {
    expect(buildFunctionDeclarations(['list_projects']).map((d) => d.name)).toEqual(['list_projects'])
  })
})

describe('generateWithTools', () => {
  it('runs function calls, feeds results back and returns the final text', async () => {
    const port = createMemoryDataPort()
    const { fetchImpl, calls } = scripted([
      reply([{ functionCall: { name: 'create_project', args: { name: 'Lending' } } }]),
      reply([{ functionCall: { name: 'list_projects', args: {} } }]),
      reply([{ text: 'Created Lending.' }]),
    ])
    const seen: string[] = []
    const result = await generateWithTools({
      ...base,
      history: [{ role: 'user', text: 'earlier' }],
      userText: 'make a project',
      port,
      fetchImpl,
      onToolCall: (c) => seen.push(`${c.name}:${c.status}`),
    })

    expect(result.text).toBe('Created Lending.')
    expect(result.steps).toBe(3)
    expect(result.toolCalls.map((c) => [c.name, c.status])).toEqual([
      ['create_project', 'done'],
      ['list_projects', 'done'],
    ])
    expect(result.toolCalls[0].openPath).toMatch(/^\/p\/p_/)
    expect(seen).toEqual([
      'create_project:running',
      'create_project:done',
      'list_projects:running',
      'list_projects:done',
    ])

    expect(calls).toHaveLength(3)
    expect(calls[0].url).toContain('gemini-2.5-flash:generateContent?key=k')
    expect(calls[0].body.tools[0].functionDeclarations).toHaveLength(MCP_TOOL_NAMES.length)
    expect(calls[0].body.systemInstruction.parts[0].text).toBe('sys')
    expect(calls[0].body.contents.map((c: { role: string }) => c.role)).toEqual(['user', 'user'])

    // Turn 2 echoes the model call and then sends the function response as the user.
    const second = calls[1].body.contents
    expect(second.at(-2).role).toBe('model')
    expect(second.at(-2).parts[0].functionCall.name).toBe('create_project')
    expect(second.at(-1).role).toBe('user')
    expect(second.at(-1).parts[0].functionResponse).toMatchObject({
      name: 'create_project',
      response: { ok: true },
    })
  })

  it('feeds tool errors back to the model so it can recover', async () => {
    const port = createMemoryDataPort()
    const { fetchImpl, calls } = scripted([
      reply([{ functionCall: { name: 'get_project', args: { projectId: 'nope' } } }]),
      reply([{ text: 'That project does not exist.' }]),
    ])
    const result = await generateWithTools({ ...base, userText: 'x', port, fetchImpl })
    expect(result.toolCalls[0]).toMatchObject({ status: 'error', result: { ok: false, code: 'not_found' } })
    expect(result.toolCalls[0].openPath).toBeUndefined()
    expect(calls[1].body.contents.at(-1).parts[0].functionResponse.response).toMatchObject({
      ok: false,
      code: 'not_found',
    })
  })

  it('stops after maxSteps', async () => {
    const port = createMemoryDataPort()
    const loop = () => reply([{ functionCall: { name: 'list_projects', args: {} } }])
    const { fetchImpl, calls } = scripted([loop(), loop(), loop(), loop()])
    const result = await generateWithTools({ ...base, userText: 'x', port, fetchImpl, maxSteps: 3 })
    expect(calls).toHaveLength(3)
    expect(result.steps).toBe(3)
    expect(result.text).toContain('stopped after 3 steps')
  })

  it('throws the API error message', async () => {
    const { fetchImpl } = scripted([
      new Response(JSON.stringify({ error: { message: 'API key not valid' } }), { status: 400 }),
    ])
    await expect(
      generateWithTools({ ...base, userText: 'x', port: createMemoryDataPort(), fetchImpl }),
    ).rejects.toThrow('API key not valid')
  })

  it('blocks tools outside the allowed list', async () => {
    const port = createMemoryDataPort()
    const { fetchImpl } = scripted([
      reply([{ functionCall: { name: 'create_project', args: { name: 'X' } } }]),
      reply([{ text: 'ok' }]),
    ])
    const result = await generateWithTools({
      ...base,
      userText: 'x',
      port,
      fetchImpl,
      tools: ['list_projects'],
    })
    expect(result.toolCalls[0].result).toMatchObject({ ok: false, code: 'not_allowed' })
    expect(await port.listProjects()).toEqual([])
  })

  describe('destructive confirm guard', () => {
    async function setup() {
      const port = createMemoryDataPort()
      const project = await port.createProject({ name: 'P' })
      const diagram = await port.createDiagram(project.id, 'Doomed')
      return { port, args: { projectId: project.id, diagramId: diagram.id } }
    }
    const deleteCall = (args: object) => reply([{ functionCall: { name: 'delete_diagram', args } }])

    it('does not ask the user or delete when the model omits confirm', async () => {
      const { port, args } = await setup()
      const confirmDestructive = vi.fn(async () => true)
      const { fetchImpl } = scripted([deleteCall(args), reply([{ text: 'ok' }])])
      const result = await generateWithTools({
        ...base, userText: 'x', port, fetchImpl, confirmDestructive,
      })
      expect(confirmDestructive).not.toHaveBeenCalled()
      expect(result.toolCalls[0].result).toMatchObject({ ok: false, code: 'invalid_args' })
      expect(await port.getDiagram(args.projectId, args.diagramId)).not.toBeNull()
    })

    it('declines when the user says no', async () => {
      const { port, args } = await setup()
      const confirmDestructive = vi.fn(async () => false)
      const { fetchImpl } = scripted([deleteCall({ ...args, confirm: true }), reply([{ text: 'ok' }])])
      const result = await generateWithTools({
        ...base, userText: 'x', port, fetchImpl, confirmDestructive,
      })
      expect(confirmDestructive).toHaveBeenCalledOnce()
      expect(result.toolCalls[0]).toMatchObject({ status: 'declined', result: { code: 'declined' } })
      expect(await port.getDiagram(args.projectId, args.diagramId)).not.toBeNull()
    })

    it('declines when there is no confirm handler at all', async () => {
      const { port, args } = await setup()
      const { fetchImpl } = scripted([deleteCall({ ...args, confirm: true }), reply([{ text: 'ok' }])])
      const result = await generateWithTools({ ...base, userText: 'x', port, fetchImpl })
      expect(result.toolCalls[0].status).toBe('declined')
      expect(await port.getDiagram(args.projectId, args.diagramId)).not.toBeNull()
    })

    it('deletes after the user approves', async () => {
      const { port, args } = await setup()
      const confirmDestructive = vi.fn(async () => true)
      const { fetchImpl } = scripted([deleteCall({ ...args, confirm: true }), reply([{ text: 'Deleted.' }])])
      const result = await generateWithTools({
        ...base, userText: 'x', port, fetchImpl, confirmDestructive,
      })
      expect(confirmDestructive).toHaveBeenCalledWith({
        name: 'delete_diagram',
        args: { ...args, confirm: true },
      })
      expect(result.toolCalls[0].status).toBe('done')
      expect(await port.getDiagram(args.projectId, args.diagramId)).toBeNull()
    })
  })
})
