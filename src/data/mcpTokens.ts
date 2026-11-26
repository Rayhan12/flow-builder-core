/**
 * Client-side MCP personal access tokens.
 * Raw token is shown once; only sha256 hex is stored at mcpTokens/{hash}.
 */
import {
  collection,
  doc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type Timestamp,
} from 'firebase/firestore'
import { db } from '../lib/firebase'

export type McpTokenListItem = {
  hash: string
  name: string
  createdAt: Date | null
  lastUsedAt: Date | null
  revoked: boolean
}

export type CreatedMcpToken = McpTokenListItem & {
  /** Raw token; only available at creation time. */
  token: string
}

function asDate(value: unknown): Date | null {
  if (!value) return null
  if (value instanceof Date) return value
  if (typeof value === 'object' && value !== null && 'toDate' in value) {
    try {
      return (value as Timestamp).toDate()
    } catch {
      return null
    }
  }
  return null
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!)
  const b64 = btoa(binary)
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

/** `fbmcp_` + 32 random bytes as base64url. */
export function generateMcpToken(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return `fbmcp_${bytesToBase64Url(bytes)}`
}

export async function sha256Hex(value: string): Promise<string> {
  const data = new TextEncoder().encode(value)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

export function mcpTokensCol() {
  return collection(db, 'mcpTokens')
}

export function mcpTokenRef(hash: string) {
  return doc(db, 'mcpTokens', hash)
}

export async function listMcpTokens(uid: string): Promise<McpTokenListItem[]> {
  const snap = await getDocs(query(mcpTokensCol(), where('uid', '==', uid)))
  const items = snap.docs.map((d) => {
    const data = d.data() as Record<string, unknown>
    return {
      hash: d.id,
      name: typeof data.name === 'string' ? data.name : 'Token',
      createdAt: asDate(data.createdAt),
      lastUsedAt: asDate(data.lastUsedAt),
      revoked: data.revoked === true,
    }
  })
  return items.sort((a, b) => {
    const at = a.createdAt?.getTime() ?? 0
    const bt = b.createdAt?.getTime() ?? 0
    return bt - at
  })
}

export async function createMcpToken(uid: string, name: string): Promise<CreatedMcpToken> {
  const trimmed = name.trim().slice(0, 80) || 'Agent token'
  const token = generateMcpToken()
  const hash = await sha256Hex(token)
  await setDoc(mcpTokenRef(hash), {
    uid,
    name: trimmed,
    createdAt: serverTimestamp(),
    lastUsedAt: null,
    revoked: false,
  })
  return {
    hash,
    name: trimmed,
    createdAt: new Date(),
    lastUsedAt: null,
    revoked: false,
    token,
  }
}

export async function revokeMcpToken(_uid: string, hash: string): Promise<void> {
  // Owner check is enforced by Firestore rules (resource.data.uid == auth.uid).
  await updateDoc(mcpTokenRef(hash), { revoked: true })
}
