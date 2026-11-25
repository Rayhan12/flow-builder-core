import {
  collection,
  doc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  type Timestamp,
} from 'firebase/firestore'
import { db } from '../lib/firebase'
import type { EditOp } from '../ai/ops'

export type MessageRole = 'user' | 'assistant'

export type DiagramMessage = {
  id: string
  role: MessageRole
  text: string
  ops?: EditOp[]
  createdAt: Date | null
  applied: boolean
}

function messagesCol(uid: string, diagramId: string) {
  return collection(db, 'users', uid, 'diagrams', diagramId, 'messages')
}

function messageRef(uid: string, diagramId: string, messageId: string) {
  return doc(db, 'users', uid, 'diagrams', diagramId, 'messages', messageId)
}

function newMessageId(): string {
  const raw =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().replace(/-/g, '')
      : `${Date.now()}${Math.random().toString(16).slice(2)}`
  return `m_${raw.slice(0, 16)}`
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

function toMessage(id: string, data: Record<string, unknown>): DiagramMessage {
  return {
    id,
    role: data.role === 'assistant' ? 'assistant' : 'user',
    text: typeof data.text === 'string' ? data.text : '',
    ops: Array.isArray(data.ops) ? (data.ops as EditOp[]) : undefined,
    createdAt: asDate(data.createdAt),
    applied: data.applied === true,
  }
}

export async function listMessages(
  uid: string,
  diagramId: string,
): Promise<DiagramMessage[]> {
  const snap = await getDocs(query(messagesCol(uid, diagramId), orderBy('createdAt', 'asc')))
  return snap.docs.map((d) => toMessage(d.id, d.data() as Record<string, unknown>))
}

export async function addMessage(
  uid: string,
  diagramId: string,
  input: {
    role: MessageRole
    text: string
    ops?: EditOp[]
    applied?: boolean
  },
): Promise<DiagramMessage> {
  const id = newMessageId()
  const payload: Record<string, unknown> = {
    role: input.role,
    text: input.text,
    createdAt: serverTimestamp(),
    applied: input.applied === true,
  }
  if (input.ops) payload.ops = input.ops

  await setDoc(messageRef(uid, diagramId, id), payload)
  return {
    id,
    role: input.role,
    text: input.text,
    ops: input.ops,
    createdAt: new Date(),
    applied: input.applied === true,
  }
}

export async function markMessageApplied(
  uid: string,
  diagramId: string,
  messageId: string,
  applied = true,
): Promise<void> {
  await updateDoc(messageRef(uid, diagramId, messageId), { applied })
}
