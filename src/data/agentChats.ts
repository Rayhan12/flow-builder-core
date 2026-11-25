import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
  type Timestamp,
} from 'firebase/firestore'
import { db } from '../lib/firebase'

/**
 * AI agent panel history (docs/PLAN.md section 16).
 *
 *   users/{uid}/agentChats/{chatId}                 { title, createdAt, updatedAt, messageCount }
 *   users/{uid}/agentChats/{chatId}/messages/{mid}  { role, text, toolCalls?, createdAt }
 *
 * Tool calls are stored compactly (a short args preview and the result
 * summary), never full diagram JSON, so chats stay far below the 1 MiB limit.
 */

export type StoredToolCall = {
  id: string
  name: string
  /** Truncated JSON of the args, for display only. */
  argsPreview: string
  status: 'done' | 'error' | 'declined'
  summary: string
  /** Error text when status is error or declined. */
  error?: string
  openPath?: string
  /** True when the tool changed stored data. */
  mutated?: boolean
}

export type AgentChatRole = 'user' | 'assistant'

export type AgentChatMessage = {
  id: string
  role: AgentChatRole
  text: string
  toolCalls: StoredToolCall[]
  createdAt: Date | null
}

export type AgentChat = {
  id: string
  title: string
  messageCount: number
  createdAt: Date | null
  updatedAt: Date | null
}

const DELETE_BATCH_SIZE = 400
export const MAX_CHAT_TITLE = 80

function chatsCol(uid: string) {
  return collection(db, 'users', uid, 'agentChats')
}

function chatRef(uid: string, chatId: string) {
  return doc(db, 'users', uid, 'agentChats', chatId)
}

function messagesCol(uid: string, chatId: string) {
  return collection(db, 'users', uid, 'agentChats', chatId, 'messages')
}

function newId(prefix: string): string {
  const raw =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().replace(/-/g, '')
      : `${Date.now()}${Math.random().toString(16).slice(2)}`
  return `${prefix}_${raw.slice(0, 16)}`
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

export function titleFromText(text: string): string {
  const oneLine = text.replace(/\s+/g, ' ').trim()
  if (!oneLine) return 'New chat'
  return oneLine.length > MAX_CHAT_TITLE ? `${oneLine.slice(0, MAX_CHAT_TITLE - 3).trimEnd()}...` : oneLine
}

function toChat(id: string, data: Record<string, unknown>): AgentChat {
  return {
    id,
    title: typeof data.title === 'string' && data.title ? data.title : 'New chat',
    messageCount: typeof data.messageCount === 'number' ? data.messageCount : 0,
    createdAt: asDate(data.createdAt),
    updatedAt: asDate(data.updatedAt),
  }
}

function toStoredToolCall(raw: unknown): StoredToolCall | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  if (typeof r.id !== 'string' || typeof r.name !== 'string') return null
  const status = r.status === 'error' || r.status === 'declined' ? r.status : 'done'
  return {
    id: r.id,
    name: r.name,
    argsPreview: typeof r.argsPreview === 'string' ? r.argsPreview : '',
    status,
    summary: typeof r.summary === 'string' ? r.summary : '',
    error: typeof r.error === 'string' ? r.error : undefined,
    openPath: typeof r.openPath === 'string' ? r.openPath : undefined,
    mutated: r.mutated === true ? true : undefined,
  }
}

function toMessage(id: string, data: Record<string, unknown>): AgentChatMessage {
  const rawCalls = Array.isArray(data.toolCalls) ? data.toolCalls : []
  return {
    id,
    role: data.role === 'assistant' ? 'assistant' : 'user',
    text: typeof data.text === 'string' ? data.text : '',
    toolCalls: rawCalls.map(toStoredToolCall).filter((c): c is StoredToolCall => c !== null),
    createdAt: asDate(data.createdAt),
  }
}

/** Firestore rejects `undefined` field values. */
function clean<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as T
}

export async function createAgentChat(uid: string, title?: string): Promise<AgentChat> {
  const id = newId('c')
  const chatTitle = title ? titleFromText(title) : 'New chat'
  await setDoc(chatRef(uid, id), {
    title: chatTitle,
    messageCount: 0,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
  const now = new Date()
  return { id, title: chatTitle, messageCount: 0, createdAt: now, updatedAt: now }
}

/** Most recently updated chats first. */
export async function listAgentChats(uid: string, max = 20): Promise<AgentChat[]> {
  const snap = await getDocs(query(chatsCol(uid), orderBy('updatedAt', 'desc'), limit(max)))
  return snap.docs.map((d) => toChat(d.id, d.data() as Record<string, unknown>))
}

export async function getAgentChat(uid: string, chatId: string): Promise<AgentChat | null> {
  const snap = await getDoc(chatRef(uid, chatId))
  if (!snap.exists()) return null
  return toChat(snap.id, snap.data() as Record<string, unknown>)
}

export async function listAgentChatMessages(uid: string, chatId: string): Promise<AgentChatMessage[]> {
  const snap = await getDocs(query(messagesCol(uid, chatId), orderBy('createdAt', 'asc')))
  return snap.docs.map((d) => toMessage(d.id, d.data() as Record<string, unknown>))
}

/**
 * Append a message and touch the chat doc. The first user message also names
 * a chat that is still called "New chat".
 */
export async function addAgentChatMessage(
  uid: string,
  chatId: string,
  input: { role: AgentChatRole; text: string; toolCalls?: StoredToolCall[] },
  chat?: Pick<AgentChat, 'title' | 'messageCount'>,
): Promise<AgentChatMessage> {
  const id = newId('m')
  const toolCalls = input.toolCalls ?? []
  await setDoc(doc(messagesCol(uid, chatId), id), {
    role: input.role,
    text: input.text,
    ...(toolCalls.length > 0 ? { toolCalls: toolCalls.map((c) => clean({ ...c })) } : {}),
    createdAt: serverTimestamp(),
  })

  const patch: Record<string, unknown> = { updatedAt: serverTimestamp() }
  const current = chat ?? (await getAgentChat(uid, chatId))
  if (current) {
    patch.messageCount = current.messageCount + 1
    if (input.role === 'user' && current.title === 'New chat') {
      patch.title = titleFromText(input.text)
    }
  }
  await updateDoc(chatRef(uid, chatId), patch)

  return { id, role: input.role, text: input.text, toolCalls, createdAt: new Date() }
}

export async function deleteAgentChat(uid: string, chatId: string): Promise<void> {
  const snap = await getDocs(messagesCol(uid, chatId))
  let batch = writeBatch(db)
  let count = 0
  for (const d of snap.docs) {
    batch.delete(d.ref)
    count++
    if (count >= DELETE_BATCH_SIZE) {
      await batch.commit()
      batch = writeBatch(db)
      count = 0
    }
  }
  if (count > 0) await batch.commit()
  batch = writeBatch(db)
  batch.delete(chatRef(uid, chatId))
  await batch.commit()
}
