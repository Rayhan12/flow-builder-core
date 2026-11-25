/**
 * Runs only when the Auth and Firestore emulators are up.
 * Drives the shared tools through the browser DataPort against real Firestore.
 */
import { createUserWithEmailAndPassword, signOut } from 'firebase/auth'
import { getDocs } from 'firebase/firestore'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { executeTool, type DataPort, type ToolResult } from '../../shared/tools'
import { versionsCollection } from '../data/versions'
import { auth } from '../lib/firebase'
import { createBrowserDataPort } from './browserDataPort'

const run = Boolean(process.env.FIRESTORE_EMULATOR_HOST && process.env.FIREBASE_AUTH_EMULATOR_HOST)

function must<T = Record<string, any>>(res: ToolResult): { data: T; openPath?: string; summary: string } {
  if (!res.ok) throw new Error(`${res.code}: ${res.error}`)
  return res as unknown as { data: T; openPath?: string; summary: string }
}

const flow = {
  title: 'ignored, the tool title wins',
  nodes: [
    { id: 'n1', kind: 'start', label: 'Customer applies', position: { x: 0, y: 0 } },
    {
      id: 'n2',
      kind: 'decision',
      label: 'Credit ok?',
      position: { x: 0, y: 140 },
      data: { branches: [{ id: 'yes', label: 'Yes' }, { id: 'no', label: 'No' }] },
    },
    { id: 'n3', kind: 'end', label: 'Approved', position: { x: 0, y: 280 } },
  ],
  edges: [
    { id: 'e1', source: 'n1', target: 'n2' },
    { id: 'e2', source: 'n2', target: 'n3', sourceHandle: 'yes', label: 'Yes' },
  ],
}

describe.skipIf(!run)('Agent tools through the browser DataPort (emulator)', () => {
  let uid: string
  let port: DataPort

  beforeAll(async () => {
    const cred = await createUserWithEmailAndPassword(
      auth,
      `agent-tools-${Date.now()}@example.com`,
      'test-pass-123',
    )
    uid = cred.user.uid
    port = createBrowserDataPort(uid)
  })

  afterAll(async () => {
    await signOut(auth)
  })

  it('creates and lists projects and diagrams, with Open paths', async () => {
    const created = must(await executeTool('create_project', { name: 'Agent project' }, port))
    const projectId = created.data.id as string
    expect(created.openPath).toBe(`/p/${projectId}`)

    const projects = must(await executeTool('list_projects', {}, port))
    expect(projects.data.projects.some((p: { id: string }) => p.id === projectId)).toBe(true)

    const got = must(await executeTool('get_project', { projectId }, port))
    expect(got.data.name).toBe('Agent project')

    const diagram = must(
      await executeTool('create_diagram', { projectId, title: 'Empty one' }, port),
    )
    expect(diagram.openPath).toBe(`/p/${projectId}/d/${diagram.data.id}`)

    const listed = must(await executeTool('list_diagrams', { projectId }, port))
    expect(listed.data.diagrams.map((d: { title: string }) => d.title)).toEqual(['Empty one'])
    expect((await port.getProject(projectId))?.diagramCount).toBe(1)
  })

  it('creates a filled diagram, edits it, replaces it and records agent versions', async () => {
    const { data: project } = must(await executeTool('create_project', { name: 'Flows' }, port))
    const projectId = project.id as string

    const created = must(
      await executeTool(
        'create_diagram',
        // Gemini sends free-form JSON as a string; both forms must work.
        { projectId, title: 'Credit flow', diagram: JSON.stringify(flow) },
        port,
      ),
    )
    const diagramId = created.data.id as string
    expect(created.data.title).toBe('Credit flow')
    expect(created.data.nodeCount).toBe(3)

    const read = must(await executeTool('get_diagram', { projectId, diagramId }, port))
    expect(read.data.diagram.nodes).toHaveLength(3)
    expect(read.data.diagram.title).toBe('Credit flow')

    const edited = must(
      await executeTool(
        'apply_diagram_edits',
        {
          projectId,
          diagramId,
          ops: [
            { op: 'addNode', node: { id: 'n4', kind: 'step', label: 'Manual review' } },
            { op: 'addEdge', edge: { source: 'n2', target: 'n4', sourceHandle: 'no', label: 'No' } },
          ],
        },
        port,
      ),
    )
    expect(edited.data.nodeCount).toBe(4)
    expect(edited.summary).toContain('2 changes')

    const replaced = must(
      await executeTool(
        'update_diagram',
        { projectId, diagramId, diagram: { ...flow, title: 'Credit flow v2', nodes: flow.nodes.slice(0, 1), edges: [] } },
        port,
      ),
    )
    expect(replaced.data.nodeCount).toBe(1)

    const renamed = must(
      await executeTool('rename_diagram', { projectId, diagramId, title: 'Credit flow final' }, port),
    )
    expect(renamed.data.title).toBe('Credit flow final')

    const versions = await getDocs(versionsCollection(uid, projectId, diagramId))
    const reasons = versions.docs.map((d) => d.data().reason)
    expect(reasons.length).toBeGreaterThanOrEqual(3)
    expect(new Set(reasons)).toEqual(new Set(['agent']))
  })

  it('rejects invalid diagrams and ops without saving anything', async () => {
    const { data: project } = must(await executeTool('create_project', { name: 'Strict' }, port))
    const projectId = project.id as string
    const { data: d } = must(
      await executeTool('create_diagram', { projectId, title: 'Keep me', diagram: flow }, port),
    )
    const diagramId = d.id as string

    const badDiagram = await executeTool(
      'update_diagram',
      {
        projectId,
        diagramId,
        diagram: { nodes: [{ id: 'x', kind: 'start', label: 'a', position: { x: 0, y: 0 } }], edges: [{ id: 'e', source: 'x', target: 'ghost' }] },
      },
      port,
    )
    expect(badDiagram).toMatchObject({ ok: false, code: 'invalid_args' })

    const badOps = await executeTool(
      'apply_diagram_edits',
      { projectId, diagramId, ops: [{ op: 'removeNode', id: 'does-not-exist' }] },
      port,
    )
    expect(badOps).toMatchObject({ ok: false, code: 'invalid_args' })

    const unknownOp = await executeTool(
      'apply_diagram_edits',
      { projectId, diagramId, ops: [{ op: 'explode' }] },
      port,
    )
    expect(unknownOp).toMatchObject({ ok: false, code: 'invalid_args' })

    const after = must(await executeTool('get_diagram', { projectId, diagramId }, port))
    expect(after.data.diagram.nodes).toHaveLength(3)
    expect(after.data.revision).toBeLessThanOrEqual(1)

    // A bad diagram on create must not leave an empty diagram behind.
    const badCreate = await executeTool(
      'create_diagram',
      { projectId, title: 'Nope', diagram: { nodes: [{ id: 'a' }], edges: [] } },
      port,
    )
    expect(badCreate).toMatchObject({ ok: false, code: 'invalid_args' })
    const listed = must(await executeTool('list_diagrams', { projectId }, port))
    expect(listed.data.diagrams).toHaveLength(1)
  })

  it('returns not_found for missing records', async () => {
    expect(await executeTool('get_project', { projectId: 'p_missing' }, port)).toMatchObject({
      ok: false,
      code: 'not_found',
    })
    expect(await executeTool('list_diagrams', { projectId: 'p_missing' }, port)).toMatchObject({
      ok: false,
      code: 'not_found',
    })
    expect(
      await executeTool('rename_diagram', { projectId: 'p_missing', diagramId: 'd_x', title: 'x' }, port),
    ).toMatchObject({ ok: false, code: 'not_found' })
  })

  it('deletes a diagram only with confirm and allowDestructive', async () => {
    const { data: project } = must(await executeTool('create_project', { name: 'Doomed' }, port))
    const projectId = project.id as string
    const { data: d } = must(await executeTool('create_diagram', { projectId, title: 'Bye' }, port))
    const args = { projectId, diagramId: d.id as string }

    expect(await executeTool('delete_diagram', { ...args, confirm: true }, port)).toMatchObject({
      ok: false,
      code: 'not_allowed',
    })
    expect(
      await executeTool('delete_diagram', { ...args, confirm: false }, port, { allowDestructive: true }),
    ).toMatchObject({ ok: false, code: 'confirm_required' })
    expect(await port.getDiagram(projectId, args.diagramId)).not.toBeNull()

    must(await executeTool('delete_diagram', { ...args, confirm: true }, port, { allowDestructive: true }))
    expect(await port.getDiagram(projectId, args.diagramId)).toBeNull()
    expect((await port.getProject(projectId))?.diagramCount).toBe(0)
  })

  it('is scoped to the signed-in user', async () => {
    const { data: project } = must(await executeTool('create_project', { name: 'Mine' }, port))
    // The port builds every path from its own uid, and the rules deny other users.
    const otherPort = createBrowserDataPort('someone-else-uid')
    const res = await executeTool('get_project', { projectId: project.id as string }, otherPort)
    expect(res.ok).toBe(false)
  })
})
