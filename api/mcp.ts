/**
 * Vercel Node function: Streamable HTTP MCP endpoint at /api/mcp.
 * Stateless mode (sessionIdGenerator: undefined). New server per request.
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import { handleMcpRequest } from '../server/mcp/handler.ts'

export const config = {
  maxDuration: 30,
  api: {
    bodyParser: true,
  },
}

type VercelRequest = IncomingMessage & { body?: unknown }

export default async function handler(req: VercelRequest, res: ServerResponse): Promise<void> {
  await handleMcpRequest(req, res)
}
