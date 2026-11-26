/**
 * MCP auth, scoping and tool behaviour against the Firestore emulator.
 * Run via: firebase emulators:exec --only auth,firestore --project flow-builder-core "npx vitest run"
 *
 * @vitest-environment node
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createAdminDataPort } from '../adminDataPort.ts'
import { getAdminDb, resetFirebaseAdminForTests } from '../firebaseAdmin.ts'
import { hashMcpToken } from './auth.ts'
import { handleMcpRequest } from './handler.ts'
import { executeTool } from '../../shared/tools/index.ts'
import { CURRENT_SCHEMA_VERSION } from '../../src/schema/index.ts'

const run = Boolean(process.env.FIRESTORE_EMULATOR_HOST)

const USER_A = 'mcp-user-a'
const USER_B = 'mcp-user-b'
const TOKEN_A = 'fbmcp_test_token_user_a_aaaaaaaaaaaaaaaa'
const TOKEN_B = 'fbmcp_test_token_user_b_bbbbbbbbbbbbbbbb'
const TOKEN_REVOKED = 'fbmcp_test_token_revoked_cccccccccccccccc'

async function seedToken(
  raw: string,
  uid: string,
  opts: { revoked?: boolean; name?: string } = {},
): Promise<void> {
  const db = getAdminDb()
  await db.doc(`mcpTokens/${hashMcpToken(raw)}`).set({
    uid,
    name: opts.name ?? 'Test',
    createdAt: new Date(),
    lastUsedAt: null,
    revoked: opts.revoked === true,
  })
}

function listen(handler: (req: IncomingMessage, res: ServerResponse) => void): Promise<{
  server: Server
  url: string
  port: number
}> {
  return new Promise((resolve, reject) => {
    const server = createServer(handler)
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address() as AddressInfo
      resolve({
        server,
        port: addr.port,
        url: `http://127.0.0.1:${addr.port}/mcp`,
      })
    })
    server.on('error', reject)
  })
}

async function postJson(
  url: string,
  body: unknown,
  headers: Record<string, string> = {},
): Promise<{ status: number; json: unknown }> {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      ...headers,
    },
    body: JSON.stringify(body),
  })
  const text = await res.text()
  let json: unknown = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    json = { raw: text }
  }
  return { status: res.status, json }
}

describe.skipIf(!run)('MCP server (emulator)', () => {
  let server: Server
  let baseUrl: string

  beforeAll(async () => {
    resetFirebaseAdminForTests()
    process.env.FIREBASE_PROJECT_ID = 'flow-builder-core'
    const listened = await listen((req, res) => {
      void handleMcpRequest(req, res)
    })
    server = listened.server
    baseUrl = listened.url
  })

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()))
    })
    resetFirebaseAdminForTests()
  })

  beforeEach(async () => {
    const db = getAdminDb()
    // Clear MCP tokens used by these tests.
    for (const raw of [TOKEN_A, TOKEN_B, TOKEN_REVOKED]) {
      await db.doc(`mcpTokens/${hashMcpToken(raw)}`).delete().catch(() => undefined)
    }
    await seedToken(TOKEN_A, USER_A, { name: 'A' })
    await seedToken(TOKEN_B, USER_B, { name: 'B' })
    await seedToken(TOKEN_REVOKED, USER_A, { name: 'Revoked', revoked: true })
  })

  it('returns 401 for missing, unknown and revoked tokens', async () => {
    const probe = { jsonrpc: '2.0', id: 1, method: 'initialize', params: {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'test', version: '1.0.0' },
    }}

    const missing = await postJson(baseUrl, probe)
    expect(missing.status).toBe(401)

    const unknown = await postJson(baseUrl, probe, {
      Authorization: 'Bearer fbmcp_does_not_exist',
    })
    expect(unknown.status).toBe(401)

    const revoked = await postJson(baseUrl, probe, {
      Authorization: `Bearer ${TOKEN_REVOKED}`,
    })
    expect(revoked.status).toBe(401)
  })

  it('scopes tools to the token uid (A cannot see B)', async () => {
    const portA = createAdminDataPort(USER_A)
    const portB = createAdminDataPort(USER_B)
    const projectB = await portB.createProject({ name: 'B only' })
    const diagramB = await portB.createDiagram(projectB.id, 'Secret flow')

    const listed = await executeTool('list_projects', {}, portA)
    expect(listed.ok).toBe(true)
    if (listed.ok) {
      const projects = (listed.data as { projects: { id: string }[] }).projects
      expect(projects.some((p) => p.id === projectB.id)).toBe(false)
    }

    const stolen = await executeTool(
      'get_diagram',
      { projectId: projectB.id, diagramId: diagramB.id },
      portA,
    )
    expect(stolen).toMatchObject({ ok: false, code: 'not_found' })

    const hijack = await executeTool(
      'update_diagram',
      {
        projectId: projectB.id,
        diagramId: diagramB.id,
        diagram: { title: 'Hijacked', nodes: [], edges: [] },
      },
      portA,
    )
    expect(hijack).toMatchObject({ ok: false, code: 'not_found' })
  })

  it('apply_diagram_edits adding nodes produces a non-overlapping layout', async () => {
    const { hasOverlappingNodes } = await import('../../shared/layout/index.ts')
    const port = createAdminDataPort(USER_A)
    const project = await port.createProject({ name: 'Layout' })
    const diagram = await port.createDiagram(project.id, 'Seed', {
      title: 'Seed',
      schemaVersion: CURRENT_SCHEMA_VERSION,
      nodes: [
        { id: 'n1', kind: 'start', label: 'Start', position: { x: 0, y: 0 } },
        { id: 'n2', kind: 'step', label: 'One', position: { x: 0, y: 120 } },
      ],
      edges: [{ id: 'e1', source: 'n1', target: 'n2' }],
    })

    const applied = await executeTool(
      'apply_diagram_edits',
      {
        projectId: project.id,
        diagramId: diagram.id,
        ops: [
          { op: 'addNode', node: { id: 'n3', kind: 'step', label: 'Two', position: { x: 0, y: 0 } } },
          { op: 'addNode', node: { id: 'n4', kind: 'end', label: 'End', position: { x: 0, y: 0 } } },
          { op: 'addEdge', edge: { id: 'e2', source: 'n2', target: 'n3' } },
          { op: 'addEdge', edge: { id: 'e3', source: 'n3', target: 'n4' } },
        ],
      },
      port,
    )
    expect(applied.ok).toBe(true)
    const got = await port.getDiagram(project.id, diagram.id)
    expect(got).not.toBeNull()
    if (!got) return
    const nodes = (got.diagram as { nodes: Array<{ id: string; position: { x: number; y: number }; kind: string }> }).nodes
    expect(nodes.length).toBe(4)
    expect(hasOverlappingNodes(nodes)).toBe(false)
    expect((got.diagram as { fitPending?: boolean }).fitPending).toBe(true)
  })

  it('rejects invalid update_diagram JSON and applies edits; delete needs confirm', async () => {
    const port = createAdminDataPort(USER_A)
    const project = await port.createProject({ name: 'Edits' })
    const diagram = await port.createDiagram(project.id, 'Draft')

    const bad = await executeTool(
      'update_diagram',
      { projectId: project.id, diagramId: diagram.id, diagram: 'not-json-object' },
      port,
    )
    expect(bad).toMatchObject({ ok: false, code: 'invalid_args' })

    const invalidShape = await executeTool(
      'update_diagram',
      {
        projectId: project.id,
        diagramId: diagram.id,
        diagram: { title: 'x', nodes: [{ id: 1 }], edges: [] },
      },
      port,
    )
    expect(invalidShape).toMatchObject({ ok: false, code: 'invalid_args' })

    const applied = await executeTool(
      'apply_diagram_edits',
      {
        projectId: project.id,
        diagramId: diagram.id,
        ops: [{ op: 'setTitle', title: 'Edited via MCP' }],
      },
      port,
      { allowDestructive: true },
    )
    expect(applied.ok).toBe(true)

    const got = await port.getDiagram(project.id, diagram.id)
    expect(got).not.toBeNull()
    if (!got) return
    expect(got.diagram.title).toBe('Edited via MCP')
    expect((got.diagram as { schemaVersion: number }).schemaVersion).toBe(CURRENT_SCHEMA_VERSION)

    const refused = await executeTool(
      'delete_diagram',
      { projectId: project.id, diagramId: diagram.id },
      port,
      { allowDestructive: true },
    )
    expect(refused).toMatchObject({ ok: false })
    expect(await port.getDiagram(project.id, diagram.id)).not.toBeNull()
  })

  it('talks end-to-end with the real MCP Client over Streamable HTTP', async () => {
    const transport = new StreamableHTTPClientTransport(new URL(baseUrl), {
      requestInit: {
        headers: {
          Authorization: `Bearer ${TOKEN_A}`,
        },
      },
    })
    const client = new Client({ name: 'mcp-e2e-test', version: '1.0.0' })
    await client.connect(transport)

    try {
      const listed = await client.listTools()
      const names = listed.tools.map((t) => t.name).sort()
      expect(names).toEqual(
        [
          'apply_diagram_edits',
          'create_diagram',
          'create_project',
          'delete_diagram',
          'get_diagram',
          'get_project',
          'list_diagrams',
          'list_projects',
          'rename_diagram',
          'update_diagram',
        ].sort(),
      )

      const created = await client.callTool({
        name: 'create_project',
        arguments: { name: 'From MCP client' },
      })
      expect(created.isError).not.toBe(true)
      const text = (created.content as { type: string; text?: string }[])[0]?.text ?? ''
      const parsed = JSON.parse(text) as { ok: boolean; data?: { id: string; name: string } }
      expect(parsed.ok).toBe(true)
      expect(parsed.data?.name).toBe('From MCP client')
    } finally {
      await client.close()
      await transport.close()
    }
  })
})
