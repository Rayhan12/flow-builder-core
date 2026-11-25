import {
  collection,
  deleteDoc,
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

const DELETE_BATCH_SIZE = 400

async function adjustProjectDiagramCount(uid: string, projectId: string, delta: number): Promise<void> {
  const pref = doc(db, 'users', uid, 'projects', projectId)
  const snap = await getDoc(pref)
  if (!snap.exists()) return
  const data = snap.data() as Record<string, unknown>
  const current = typeof data.diagramCount === 'number' ? data.diagramCount : 0
  await updateDoc(pref, {
    diagramCount: Math.max(0, current + delta),
    updatedAt: serverTimestamp(),
  })
}

export function diagramsCol(uid: string, projectId: string) {
  return collection(db, 'users', uid, 'projects', projectId, 'diagrams')
}

export function diagramRef(uid: string, projectId: string, diagramId: string) {
  return doc(db, 'users', uid, 'projects', projectId, 'diagrams', diagramId)
}

export function legacyDiagramsCol(uid: string) {
  return collection(db, 'users', uid, 'diagrams')
}

export function legacyDiagramRef(uid: string, diagramId: string) {
  return doc(db, 'users', uid, 'diagrams', diagramId)
}

function legacyMessagesCol(uid: string, diagramId: string) {
  return collection(db, 'users', uid, 'diagrams', diagramId, 'messages')
}

function legacyVersionsCol(uid: string, diagramId: string) {
  return collection(db, 'users', uid, 'diagrams', diagramId, 'versions')
}

function projectMessagesCol(uid: string, projectId: string, diagramId: string) {
  return collection(db, 'users', uid, 'projects', projectId, 'diagrams', diagramId, 'messages')
}

function projectVersionsCol(uid: string, projectId: string, diagramId: string) {
  return collection(db, 'users', uid, 'projects', projectId, 'diagrams', diagramId, 'versions')
}

export function newDiagramId(): string {
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

export async function listDiagrams(uid: string, projectId: string): Promise<DiagramListItem[]> {
  const snap = await getDocs(query(diagramsCol(uid, projectId), orderBy('updatedAt', 'desc')))
  return snap.docs.map((d) => toListItem(d.id, d.data() as Record<string, unknown>))
}

export type RecentDiagramItem = DiagramListItem & {
  projectId: string
  projectName: string
}

/**
 * Most recently updated diagrams across all projects. Lightweight approach: one
 * query per project (capped at `max`), merged and sorted client side. Fine for
 * the small project counts this app targets.
 */
export async function listRecentDiagrams(
  uid: string,
  max = 8,
  knownProjects?: { id: string; name: string }[],
): Promise<RecentDiagramItem[]> {
  let projects = knownProjects
  if (!projects) {
    const snap = await getDocs(collection(db, 'users', uid, 'projects'))
    projects = snap.docs.map((d) => {
      const data = d.data() as Record<string, unknown>
      return { id: d.id, name: typeof data.name === 'string' ? data.name : 'Untitled project' }
    })
  }
  const groups = await Promise.all(
    projects.map(async (project) => {
      const snap = await getDocs(
        query(diagramsCol(uid, project.id), orderBy('updatedAt', 'desc'), limit(max)),
      )
      return snap.docs.map((d) => ({
        ...toListItem(d.id, d.data() as Record<string, unknown>),
        projectId: project.id,
        projectName: project.name,
      }))
    }),
  )
  return groups
    .flat()
    .sort((a, b) => (b.updatedAt?.getTime() ?? Infinity) - (a.updatedAt?.getTime() ?? Infinity))
    .slice(0, max)
}

export async function getDiagram(
  uid: string,
  projectId: string,
  diagramId: string,
): Promise<DiagramRecord | null> {
  const snap = await getDoc(diagramRef(uid, projectId, diagramId))
  if (!snap.exists()) return null
  return toRecord(snap.id, snap.data() as Record<string, unknown>)
}

export async function createDiagram(
  uid: string,
  projectId: string,
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
  await setDoc(diagramRef(uid, projectId, id), payload)
  await adjustProjectDiagramCount(uid, projectId, 1)
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
  projectId: string,
  diagramId: string,
  title: string,
): Promise<void> {
  const trimmed = title.trim().slice(0, 200)
  if (!trimmed) {
    throw new Error('Title cannot be empty')
  }
  const existing = await getDiagram(uid, projectId, diagramId)
  if (!existing) {
    throw new Error('Diagram not found')
  }
  const nextDoc: DiagramDoc = { ...existing.doc, title: trimmed }
  await updateDoc(diagramRef(uid, projectId, diagramId), {
    title: trimmed,
    doc: nextDoc,
    updatedAt: serverTimestamp(),
    revision: existing.revision + 1,
  })
}

export async function duplicateDiagram(
  uid: string,
  projectId: string,
  diagramId: string,
): Promise<DiagramRecord> {
  const existing = await getDiagram(uid, projectId, diagramId)
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
  await setDoc(diagramRef(uid, projectId, id), payload)
  await adjustProjectDiagramCount(uid, projectId, 1)
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

export async function deleteDiagramSubcollections(
  uid: string,
  projectId: string,
  diagramId: string,
): Promise<void> {
  const roots = [
    projectMessagesCol(uid, projectId, diagramId),
    projectVersionsCol(uid, projectId, diagramId),
  ]
  for (const col of roots) {
    const snap = await getDocs(col)
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
  }
}

export async function deleteLegacyDiagramSubcollections(
  uid: string,
  diagramId: string,
): Promise<void> {
  const roots = [legacyMessagesCol(uid, diagramId), legacyVersionsCol(uid, diagramId)]
  for (const col of roots) {
    const snap = await getDocs(col)
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
  }
}

export async function deleteDiagram(
  uid: string,
  projectId: string,
  diagramId: string,
): Promise<void> {
  await deleteDiagramSubcollections(uid, projectId, diagramId)
  await deleteDoc(diagramRef(uid, projectId, diagramId))
  await adjustProjectDiagramCount(uid, projectId, -1)
}

/** Persist a full diagram body (used by the editor in later milestones). */
export async function saveDiagram(
  uid: string,
  projectId: string,
  diagramId: string,
  diagram: Diagram,
  expectedRevision: number,
): Promise<number> {
  const existing = await getDiagram(uid, projectId, diagramId)
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
  await updateDoc(diagramRef(uid, projectId, diagramId), {
    title: nextDoc.title,
    schemaVersion: nextDoc.schemaVersion,
    doc: nextDoc,
    nodeCount: nextDoc.nodes.length,
    revision: nextRevision,
    updatedAt: serverTimestamp(),
  })
  return nextRevision
}

// --- Legacy path (migration) ---

export async function listLegacyDiagrams(uid: string): Promise<DiagramListItem[]> {
  const snap = await getDocs(query(legacyDiagramsCol(uid), orderBy('updatedAt', 'desc')))
  return snap.docs.map((d) => toListItem(d.id, d.data() as Record<string, unknown>))
}

export async function getLegacyDiagram(
  uid: string,
  diagramId: string,
): Promise<DiagramRecord | null> {
  const snap = await getDoc(legacyDiagramRef(uid, diagramId))
  if (!snap.exists()) return null
  return toRecord(snap.id, snap.data() as Record<string, unknown>)
}

export async function deleteLegacyDiagram(uid: string, diagramId: string): Promise<void> {
  await deleteLegacyDiagramSubcollections(uid, diagramId)
  await deleteDoc(legacyDiagramRef(uid, diagramId))
}

/** Copy diagram doc and subcollections into a project (preserves diagram id). */
export async function copyLegacyDiagramToProject(
  uid: string,
  projectId: string,
  diagramId: string,
): Promise<boolean> {
  const legacyRef = legacyDiagramRef(uid, diagramId)
  const legacySnap = await getDoc(legacyRef)
  if (!legacySnap.exists()) return false

  const targetRef = diagramRef(uid, projectId, diagramId)
  const targetSnap = await getDoc(targetRef)
  if (targetSnap.exists()) return true

  await setDoc(targetRef, legacySnap.data())

  for (const col of [legacyMessagesCol(uid, diagramId), legacyVersionsCol(uid, diagramId)]) {
    const snap = await getDocs(col)
    for (const d of snap.docs) {
      const dest = doc(
        db,
        'users',
        uid,
        'projects',
        projectId,
        'diagrams',
        diagramId,
        col.id,
        d.id,
      )
      await setDoc(dest, d.data())
    }
  }
  return true
}