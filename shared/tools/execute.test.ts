import { describe, expect, it } from 'vitest'
import { executeTool } from './execute.ts'
import { createMemoryDataPort } from './memoryPort.ts'
import { ToolError, type DataPort } from './types.ts'

async function seeded() {
  const port = createMemoryDataPort()
  const project = await port.createProject({ name: 'Lending' })
  const diagram = await port.createDiagram(project.id, 'Approval flow')
  port.calls.length = 0
  return { port, project, diagram }
}

describe('executeTool', () => {
  it('rejects unknown tools', async () => {
    const { port } = await seeded()
    const res = await executeTool('drop_database', {}, port)
    expect(res).toMatchObject({ ok: false, code: 'unknown_tool' })
  })

  it('validates args with zod before touching the port', async () => {
    const { port } = await seeded()
    const res = await executeTool('create_project', { name: '   ' }, port)
    expect(res).toMatchObject({ ok: false, code: 'invalid_args' })
    const bad = await executeTool('get_project', { projectId: '../etc/passwd' }, port)
    expect(bad).toMatchObject({ ok: false, code: 'invalid_args' })
    expect(port.calls).toEqual([])
  })

  it('lists and creates projects', async () => {
    const { port } = await seeded()
    const created = await executeTool('create_project', { name: 'Payments' }, port)
    expect(created.ok && created.mutated).toBe(true)
    expect(created.ok && created.openPath).toMatch(/^\/p\/p_/)

    const listed = await executeTool('list_projects', {}, port)
    expect(listed.ok).toBe(true)
    if (listed.ok) {
      expect((listed.data as { projects: unknown[] }).projects).toHaveLength(2)
      expect(listed.mutated).toBe(false)
    }
  })

  it('returns not_found for a missing project or diagram', async () => {
    const { port, project } = await seeded()
    expect(await executeTool('get_project', { projectId: 'nope' }, port)).toMatchObject({
      ok: false,
      code: 'not_found',
    })
    expect(await executeTool('list_diagrams', { projectId: 'nope' }, port)).toMatchObject({
      ok: false,
      code: 'not_found',
    })
    expect(
      await executeTool('get_diagram', { projectId: project.id, diagramId: 'nope' }, port),
    ).toMatchObject({ ok: false, code: 'not_found' })
  })

  it('creates, reads, renames and edits diagrams with open links', async () => {
    const { port, project } = await seeded()
    const created = await executeTool(
      'create_diagram',
      { projectId: project.id, title: 'Fraud check', diagram: { title: 'x', nodes: [{}], edges: [] } },
      port,
    )
    expect(created.ok).toBe(true)
    if (!created.ok) return
    expect(created.openPath).toMatch(new RegExp(`^/p/${project.id}/d/d_`))
    const diagramId = (created.data as { id: string }).id

    const read = await executeTool('get_diagram', { projectId: project.id, diagramId }, port)
    expect(read.ok && read.summary).toContain('1 node')

    const renamed = await executeTool(
      'rename_diagram',
      { projectId: project.id, diagramId, title: 'Fraud v2' },
      port,
    )
    expect(renamed.ok && renamed.summary).toContain('Fraud v2')

    const edited = await executeTool(
      'apply_diagram_edits',
      { projectId: project.id, diagramId, ops: [{ op: 'setTitle', title: 'Fraud v3' }] },
      port,
    )
    expect(edited.ok && edited.summary).toContain('1 change')

    const replaced = await executeTool(
      'update_diagram',
      { projectId: project.id, diagramId, diagram: { title: 'Fraud v4', nodes: [], edges: [] } },
      port,
    )
    expect(replaced.ok && replaced.mutated).toBe(true)
  })

  it('rejects empty ops and non-object diagrams', async () => {
    const { port, project, diagram } = await seeded()
    const args = { projectId: project.id, diagramId: diagram.id }
    expect(await executeTool('apply_diagram_edits', { ...args, ops: [] }, port)).toMatchObject({
      ok: false,
      code: 'invalid_args',
    })
    expect(await executeTool('update_diagram', { ...args, diagram: 'nope' }, port)).toMatchObject({
      ok: false,
      code: 'invalid_args',
    })
  })

  it('decodes JSON encoded string args (Gemini sends free-form JSON as strings)', async () => {
    const { port, project, diagram } = await seeded()
    const res = await executeTool(
      'apply_diagram_edits',
      {
        projectId: project.id,
        diagramId: diagram.id,
        ops: JSON.stringify([{ op: 'setTitle', title: 'Encoded' }]),
      },
      port,
    )
    expect(res.ok).toBe(true)
    const call = port.calls.find((c) => c.method === 'applyDiagramEdits')
    expect(call?.args[2]).toEqual([{ op: 'setTitle', title: 'Encoded' }])

    const broken = await executeTool(
      'apply_diagram_edits',
      { projectId: project.id, diagramId: diagram.id, ops: '{not json' },
      port,
    )
    expect(broken).toMatchObject({ ok: false, code: 'invalid_args' })
  })

  describe('delete_diagram guard', () => {
    it('refuses without confirm: true', async () => {
      const { port, project, diagram } = await seeded()
      const args = { projectId: project.id, diagramId: diagram.id }

      expect(await executeTool('delete_diagram', args, port, { allowDestructive: true })).toMatchObject({
        ok: false,
        code: 'invalid_args',
      })
      expect(
        await executeTool('delete_diagram', { ...args, confirm: false }, port, {
          allowDestructive: true,
        }),
      ).toMatchObject({ ok: false, code: 'confirm_required' })
      expect(port.calls.some((c) => c.method === 'deleteDiagram')).toBe(false)
    })

    it('refuses without allowDestructive even when confirm is true', async () => {
      const { port, project, diagram } = await seeded()
      const args = { projectId: project.id, diagramId: diagram.id, confirm: true }

      expect(await executeTool('delete_diagram', args, port)).toMatchObject({
        ok: false,
        code: 'not_allowed',
      })
      expect(
        await executeTool('delete_diagram', args, port, { allowDestructive: false }),
      ).toMatchObject({ ok: false, code: 'not_allowed' })
      expect(port.calls.some((c) => c.method === 'deleteDiagram')).toBe(false)
    })

    it('deletes only when both gates pass', async () => {
      const { port, project, diagram } = await seeded()
      const res = await executeTool(
        'delete_diagram',
        { projectId: project.id, diagramId: diagram.id, confirm: true },
        port,
        { allowDestructive: true },
      )
      expect(res.ok && res.mutated).toBe(true)
      expect(port.calls.filter((c) => c.method === 'deleteDiagram')).toHaveLength(1)
      expect(await port.getDiagram(project.id, diagram.id)).toBeNull()
    })
  })

  it('maps port errors to result codes and never throws', async () => {
    const { port } = await seeded()
    const boom: DataPort = {
      ...port,
      listProjects: async () => {
        throw new ToolError('invalid_args', 'bad diagram')
      },
      getProject: async () => {
        throw new Error('network down')
      },
    }
    expect(await executeTool('list_projects', {}, boom)).toEqual({
      ok: false,
      code: 'invalid_args',
      error: 'bad diagram',
    })
    expect(await executeTool('get_project', { projectId: 'p_1' }, boom)).toEqual({
      ok: false,
      code: 'failed',
      error: 'network down',
    })
  })
})
