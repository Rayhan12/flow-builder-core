/**
 * Shared MCP HTTP handler used by the Vercel function and local tests.
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import type { Firestore } from 'firebase-admin/firestore'
import { createAdminDataPort } from '../adminDataPort.ts'
import { getAdminDb } from '../firebaseAdmin.ts'
import { authenticateMcpToken, extractBearerToken, McpAuthError } from './auth.ts'
import { MCP_SERVER_NAME, MCP_SERVER_VERSION, registerMcpTools } from './tools.ts'

export const MCP_CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers':
    'Authorization, Content-Type, Mcp-Session-Id, Mcp-Protocol-Version',
  'Access-Control-Max-Age': '86400',
} as const

export type McpRequest = IncomingMessage & {
  body?: unknown
  headers: IncomingMessage['headers']
}

function setCors(res: ServerResponse): void {
  for (const [key, value] of Object.entries(MCP_CORS_HEADERS)) {
    res.setHeader(key, value)
  }
}

function writeJsonRpcError(
  res: ServerResponse,
  status: number,
  code: number,
  message: string,
): void {
  if (res.headersSent) return
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  setCors(res)
  res.end(
    JSON.stringify({
      jsonrpc: '2.0',
      error: { code, message },
      id: null,
    }),
  )
}

async function readJsonBody(req: McpRequest): Promise<unknown> {
  if (req.body !== undefined) return req.body
  const chunks: Buffer[] = []
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
  }
  if (chunks.length === 0) return undefined
  const raw = Buffer.concat(chunks).toString('utf8')
  if (!raw.trim()) return undefined
  return JSON.parse(raw) as unknown
}

export type HandleMcpOptions = {
  db?: Firestore
}

/**
 * Handle one MCP HTTP request (OPTIONS / GET / DELETE / POST).
 * Stateless: new McpServer + transport per POST.
 */
export async function handleMcpRequest(
  req: McpRequest,
  res: ServerResponse,
  options: HandleMcpOptions = {},
): Promise<void> {
  setCors(res)

  if (req.method === 'OPTIONS') {
    res.statusCode = 204
    res.end()
    return
  }

  if (req.method === 'GET' || req.method === 'DELETE') {
    res.setHeader('Allow', 'POST, OPTIONS')
    writeJsonRpcError(
      res,
      405,
      -32000,
      'Method not allowed. This MCP endpoint is stateless and only accepts POST.',
    )
    return
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS')
    writeJsonRpcError(res, 405, -32000, 'Method not allowed.')
    return
  }

  const authHeader =
    typeof req.headers.authorization === 'string'
      ? req.headers.authorization
      : Array.isArray(req.headers.authorization)
        ? req.headers.authorization[0]
        : undefined

  let uid: string
  try {
    const db = options.db ?? getAdminDb()
    const token = await authenticateMcpToken(extractBearerToken(authHeader), db)
    uid = token.uid
  } catch (err) {
    const message = err instanceof McpAuthError ? err.message : 'Unauthorized'
    writeJsonRpcError(res, 401, -32001, message)
    return
  }

  const db = options.db ?? getAdminDb()
  const port = createAdminDataPort(uid, db)
  const server = new McpServer({ name: MCP_SERVER_NAME, version: MCP_SERVER_VERSION })
  registerMcpTools(server, port)

  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  })

  const cleanup = (): void => {
    void transport.close()
    void server.close()
  }
  res.on('close', cleanup)

  try {
    const body = await readJsonBody(req)
    await server.connect(transport)
    await transport.handleRequest(req, res, body)
  } catch (err) {
    console.error('MCP request error:', err)
    writeJsonRpcError(res, 500, -32603, 'Internal server error')
  }
}
