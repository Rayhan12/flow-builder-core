/**
 * MCP bearer-token auth against top-level mcpTokens/{sha256}.
 */
import { createHash } from 'node:crypto'
import { FieldValue, type Firestore } from 'firebase-admin/firestore'
import { getAdminDb } from '../firebaseAdmin.ts'

export type McpTokenRecord = {
  hash: string
  uid: string
  name: string
  revoked: boolean
  createdAt: Date | null
  lastUsedAt: Date | null
}

export class McpAuthError extends Error {
  readonly status = 401
  constructor(message: string) {
    super(message)
    this.name = 'McpAuthError'
  }
}

export function hashMcpToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex')
}

export function extractBearerToken(authorization: string | undefined | null): string | null {
  if (!authorization) return null
  const match = /^Bearer\s+(\S+)$/i.exec(authorization.trim())
  return match?.[1] ?? null
}

function asDate(value: unknown): Date | null {
  if (!value) return null
  if (value instanceof Date) return value
  if (typeof value === 'object' && value !== null && 'toDate' in value) {
    try {
      return (value as { toDate: () => Date }).toDate()
    } catch {
      return null
    }
  }
  return null
}

/**
 * Resolve a raw MCP token to its owner uid.
 * Throws McpAuthError (401) for missing, unknown or revoked tokens.
 */
export async function authenticateMcpToken(
  rawToken: string | null,
  db: Firestore = getAdminDb(),
): Promise<McpTokenRecord> {
  if (!rawToken) throw new McpAuthError('Missing Authorization bearer token')

  const hash = hashMcpToken(rawToken)
  const snap = await db.doc(`mcpTokens/${hash}`).get()
  if (!snap.exists) throw new McpAuthError('Unknown MCP token')

  const data = snap.data() as Record<string, unknown>
  const uid = typeof data.uid === 'string' ? data.uid : ''
  if (!uid) throw new McpAuthError('Unknown MCP token')
  if (data.revoked === true) throw new McpAuthError('MCP token has been revoked')

  // Best effort last-used stamp; ignore failures.
  try {
    await snap.ref.update({ lastUsedAt: FieldValue.serverTimestamp() })
  } catch {
    // ignore
  }

  return {
    hash,
    uid,
    name: typeof data.name === 'string' ? data.name : 'Token',
    revoked: false,
    createdAt: asDate(data.createdAt),
    lastUsedAt: asDate(data.lastUsedAt),
  }
}
