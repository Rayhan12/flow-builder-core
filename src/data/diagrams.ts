import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  type Timestamp,
} from 'firebase/firestore'
import { db } from '../lib/firebase'
import {
  CURRENT_SCHEMA_VERSION,
  createEmptyDiagramDoc,
  migrateDiagramDoc,
  type Diagram,
  type DiagramDoc,
} from '../schema'

export type DiagramListItem = {
  id: string
  title: string
  nodeCount: number
  schemaVersion: number
  updatedAt: Date | null
  createdAt: Date | null
  revision: number
}

export type DiagramRecord = {
  id: string
  ownerId: string
  title: string
  schemaVersion: number
  doc: DiagramDoc
  nodeCount: number
  revision: number
  createdAt: Date | null
  updatedAt: Date | null
}

function diagramsCol(uid: string) {
  return collection(db, 'users', uid, 'diagrams')
}

function diagramRef(uid: string, diagramId: string) {
  return doc(db, 'users', uid, 'diagrams', diagramId)
}

function newDiagramId(): string {
  const raw =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().replace(/-/g, '')
      : `${Date.now()}${Math.random().toString(16).slice(2)}`
  return `d_${raw.slice(0, 16)}`
}

/** Firestore rejects `undefined` field values; strip them before writes. */
function stripUndefined<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => stripUndefined(item)) as T
  }
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    const out: Record<string, unknown> = {}
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      if (nested === undefined) continue
      out[key] = stripUndefined(nested)
    }
    return out as T
  }
  return value
}

function asDate(value: unknown): Date | null {
  if (!value) return null
  if (value instanceof Date) return value
  if (typeof value === 'object' && value !== null && 'toDate' in value) {
    return (value as Timestamp).toDate()
  }
  return null
}

function toListItem(id: string, data: Record<string, unknown>): DiagramListItem {
  return {
    id,
    title: typeof data.title === 'string' ? data.title : 'Untitled diagram',
    nodeCount: typeof data.nodeCount === 'number' ? data.nodeCount : 0,
    schemaVersion:
      typeof data.schemaVersion === 'number' ? data.schemaVersion : CURRENT_SCHEMA_VERSION,
    revision: typeof data.revision === 'number' ? data.revision : 0,
    createdAt: asDate(data.createdAt),
    updatedAt: asDate(data.updatedAt),
  }
}

function toRecord(id: string, data: Record<string, unknown>): DiagramRecord {
  const migrated = migrateDiagramDoc(data.doc)
  return {
    id,
    ownerId: String(data.ownerId ?? ''),
    title: typeof data.title === 'string' ? data.title : migrated.title,
    schemaVersion: migrated.schemaVersion,
    doc: migrated,
    nodeCount: typeof data.nodeCount === 'number' ? data.nodeCount : migrated.nodes.length,
    revision: typeof data.revision === 'number' ? data.revision : 0,
    createdAt: asDate(data.createdAt),
    updatedAt: asDate(data.updatedAt),
  }
}

export async function listDiagrams(uid: string): Promise<DiagramListItem[]> {
  const snap = await getDocs(query(diagramsCol(uid), orderBy('updatedAt', 'desc')))
  return snap.docs.map((d) => toListItem(d.id, d.data() as Record<string, unknown>))
}

export async function getDiagram(uid: string, diagramId: string): Promise<DiagramRecord | null> {
  const snap = await getDoc(diagramRef(uid, diagramId))
  if (!snap.exists()) return null
  return toRecord(snap.id, snap.data() as Record<string, unknown>)
}

export async function createDiagram(
  uid: string,
  title = 'Untitled diagram',
): Promise<DiagramRecord> {
  const id = newDiagramId()
  const diagramDoc = createEmptyDiagramDoc(title)
  const payload = {
    ownerId: uid,
    title: diagramDoc.title,
    schemaVersion: diagramDoc.schemaVersion,
    doc: diagramDoc,
    nodeCount: 0,
    revision: 0,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }
  await setDoc(diagramRef(uid, id), payload)
  return {
    id,
    ownerId: uid,
    title: diagramDoc.title,
    schemaVersion: diagramDoc.schemaVersion,
    doc: diagramDoc,
    nodeCount: 0,
    revision: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  }
}

export async function renameDiagram(
  uid: string,
  diagramId: string,
  title: string,
): Promise<void> {
  const trimmed = title.trim().slice(0, 200)
  if (!trimmed) {
    throw new Error('Title cannot be empty')
  }
  const existing = await getDiagram(uid, diagramId)
  if (!existing) {
    throw new Error('Diagram not found')
  }
  const nextDoc: DiagramDoc = { ...existing.doc, title: trimmed }
  await updateDoc(diagramRef(uid, diagramId), {
    title: trimmed,
    doc: nextDoc,
    updatedAt: serverTimestamp(),
    revision: existing.revision + 1,
  })
}

export async function duplicateDiagram(
  uid: string,
  diagramId: string,
): Promise<DiagramRecord> {
  const existing = await getDiagram(uid, diagramId)
  if (!existing) {
    throw new Error('Diagram not found')
  }
  const id = newDiagramId()
  const titleBase = existing.title.startsWith('Copy of ')
    ? existing.title
    : `Copy of ${existing.title}`
  const title = titleBase.slice(0, 200)
  const diagramDoc: DiagramDoc = { ...existing.doc, title }
  const payload = {
    ownerId: uid,
    title,
    schemaVersion: diagramDoc.schemaVersion,
    doc: diagramDoc,
    nodeCount: diagramDoc.nodes.length,
    revision: 0,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }
  await setDoc(diagramRef(uid, id), payload)
  return {
    id,
    ownerId: uid,
    title,
    schemaVersion: diagramDoc.schemaVersion,
    doc: diagramDoc,
    nodeCount: diagramDoc.nodes.length,
    revision: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  }
}

export async function deleteDiagram(uid: string, diagramId: string): Promise<void> {
  await deleteDoc(diagramRef(uid, diagramId))
}

/** Persist a full diagram body (used by the editor in later milestones). */
export async function saveDiagram(
  uid: string,
  diagramId: string,
  diagram: Diagram,
  expectedRevision: number,
): Promise<number> {
  const existing = await getDiagram(uid, diagramId)
  if (!existing) {
    throw new Error('Diagram not found')
  }
  if (existing.revision !== expectedRevision) {
    throw new Error('Diagram was updated elsewhere. Reload and try again.')
  }
  const nextDoc = stripUndefined(
    migrateDiagramDoc({
      schemaVersion: diagram.schemaVersion,
      title: diagram.title,
      description: diagram.description,
      nodes: diagram.nodes,
      edges: diagram.edges,
      groups: diagram.groups,
      viewport: diagram.viewport,
      theme: diagram.theme,
    }),
  )
  const nextRevision = expectedRevision + 1
  await updateDoc(diagramRef(uid, diagramId), {
    title: nextDoc.title,
    schemaVersion: nextDoc.schemaVersion,
    doc: nextDoc,
    nodeCount: nextDoc.nodes.length,
    revision: nextRevision,
    updatedAt: serverTimestamp(),
  })
  return nextRevision
}
