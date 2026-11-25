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
import { deleteDiagramSubcollections, diagramsCol, legacyDiagramsCol } from './diagrams'

export const DEFAULT_PROJECT_NAME = 'My first project'

export const DEFAULT_PROJECT_COLORS = [
  'teal',
  'blue',
  'violet',
  'amber',
  'rose',
  'slate',
] as const

export type ProjectColor = (typeof DEFAULT_PROJECT_COLORS)[number]

export const DEFAULT_PROJECT_ICONS = [
  'folder',
  'workflow',
  'layers',
  'briefcase',
  'rocket',
  'star',
] as const

export type ProjectIcon = (typeof DEFAULT_PROJECT_ICONS)[number]

export type Project = {
  id: string
  name: string
  color: string
  icon: string
  createdAt: Date | null
  updatedAt: Date | null
  diagramCount: number
}

export type ProjectListItem = {
  id: string
  name: string
  color: string
  icon: string
  diagramCount: number
  updatedAt: Date | null
  createdAt: Date | null
}

export function projectsCol(uid: string) {
  return collection(db, 'users', uid, 'projects')
}

export function projectRef(uid: string, projectId: string) {
  return doc(db, 'users', uid, 'projects', projectId)
}

export function newProjectId(): string {
  const raw =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().replace(/-/g, '')
      : `${Date.now()}${Math.random().toString(16).slice(2)}`
  return `p_${raw.slice(0, 16)}`
}

function asDate(value: unknown): Date | null {
  if (!value) return null
  if (value instanceof Date) return value
  if (typeof value === 'object' && value !== null && 'toDate' in value) {
    return (value as Timestamp).toDate()
  }
  return null
}

export function defaultProjectColor(seed: string): string {
  let hash = 0
  for (let i = 0; i < seed.length; i++) hash = (hash + seed.charCodeAt(i)) % DEFAULT_PROJECT_COLORS.length
  return DEFAULT_PROJECT_COLORS[hash] ?? DEFAULT_PROJECT_COLORS[0]
}

export function defaultProjectIcon(seed: string): string {
  let hash = 0
  for (let i = 0; i < seed.length; i++) hash = (hash + seed.charCodeAt(i)) % DEFAULT_PROJECT_ICONS.length
  return DEFAULT_PROJECT_ICONS[hash] ?? DEFAULT_PROJECT_ICONS[0]
}

function toProject(id: string, data: Record<string, unknown>): Project {
  return {
    id,
    name: typeof data.name === 'string' ? data.name : DEFAULT_PROJECT_NAME,
    color: typeof data.color === 'string' ? data.color : 'teal',
    icon: typeof data.icon === 'string' ? data.icon : 'folder',
    diagramCount: typeof data.diagramCount === 'number' ? data.diagramCount : 0,
    createdAt: asDate(data.createdAt),
    updatedAt: asDate(data.updatedAt),
  }
}

function toListItem(id: string, data: Record<string, unknown>): ProjectListItem {
  const full = toProject(id, data)
  return {
    id: full.id,
    name: full.name,
    color: full.color,
    icon: full.icon,
    diagramCount: full.diagramCount,
    createdAt: full.createdAt,
    updatedAt: full.updatedAt,
  }
}

export async function listProjects(uid: string): Promise<ProjectListItem[]> {
  const snap = await getDocs(query(projectsCol(uid), orderBy('updatedAt', 'desc')))
  return snap.docs.map((d) => toListItem(d.id, d.data() as Record<string, unknown>))
}

export async function getProject(uid: string, projectId: string): Promise<Project | null> {
  const snap = await getDoc(projectRef(uid, projectId))
  if (!snap.exists()) return null
  return toProject(snap.id, snap.data() as Record<string, unknown>)
}

export async function createProject(
  uid: string,
  input: { name: string; color?: string; icon?: string },
): Promise<Project> {
  const id = newProjectId()
  const name = input.name.trim().slice(0, 200) || DEFAULT_PROJECT_NAME
  const color = input.color?.trim() || defaultProjectColor(id)
  const icon = input.icon?.trim() || defaultProjectIcon(id)
  const payload = {
    name,
    color,
    icon,
    diagramCount: 0,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }
  await setDoc(projectRef(uid, id), payload)
  return {
    id,
    name,
    color,
    icon,
    diagramCount: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  }
}

export async function renameProject(uid: string, projectId: string, name: string): Promise<void> {
  const trimmed = name.trim().slice(0, 200)
  if (!trimmed) throw new Error('Project name cannot be empty')
  const existing = await getProject(uid, projectId)
  if (!existing) throw new Error('Project not found')
  await updateDoc(projectRef(uid, projectId), {
    name: trimmed,
    updatedAt: serverTimestamp(),
  })
}

export async function recolourProject(
  uid: string,
  projectId: string,
  color: string,
  icon?: string,
): Promise<void> {
  const existing = await getProject(uid, projectId)
  if (!existing) throw new Error('Project not found')
  const patch: Record<string, unknown> = {
    color: color.trim() || existing.color,
    updatedAt: serverTimestamp(),
  }
  if (icon !== undefined) patch.icon = icon.trim() || existing.icon
  await updateDoc(projectRef(uid, projectId), patch)
}

export async function updateProject(
  uid: string,
  projectId: string,
  patch: { name?: string; color?: string; icon?: string },
): Promise<void> {
  if (patch.name !== undefined) {
    await renameProject(uid, projectId, patch.name)
    return
  }
  if (patch.color !== undefined || patch.icon !== undefined) {
    await recolourProject(uid, projectId, patch.color ?? '', patch.icon)
  }
}

export async function incrementProjectDiagramCount(
  uid: string,
  projectId: string,
  delta = 1,
): Promise<void> {
  const existing = await getProject(uid, projectId)
  if (!existing) throw new Error('Project not found')
  const next = Math.max(0, existing.diagramCount + delta)
  await updateDoc(projectRef(uid, projectId), {
    diagramCount: next,
    updatedAt: serverTimestamp(),
  })
}

export async function decrementProjectDiagramCount(uid: string, projectId: string): Promise<void> {
  await incrementProjectDiagramCount(uid, projectId, -1)
}

export async function deleteProject(uid: string, projectId: string): Promise<void> {
  const snap = await getDocs(diagramsCol(uid, projectId))
  for (const d of snap.docs) {
    await deleteDiagramSubcollections(uid, projectId, d.id)
    await deleteDoc(d.ref)
  }
  await deleteDoc(projectRef(uid, projectId))
}

/** Creates the default project if the user has no projects yet. */
export async function ensureDefaultProject(uid: string): Promise<Project> {
  const existing = await listProjects(uid)
  if (existing.length > 0) {
    const first = existing[0]
    const full = await getProject(uid, first.id)
    if (full) return full
  }
  return createProject(uid, {
    name: DEFAULT_PROJECT_NAME,
    color: defaultProjectColor(uid),
    icon: defaultProjectIcon(uid),
  })
}

/** Reconcile diagramCount with the diagrams subcollection (repair helper). */
export async function syncProjectDiagramCount(uid: string, projectId: string): Promise<number> {
  const snap = await getDocs(diagramsCol(uid, projectId))
  const count = snap.size
  await updateDoc(projectRef(uid, projectId), {
    diagramCount: count,
    updatedAt: serverTimestamp(),
  })
  return count
}

export async function countLegacyDiagrams(uid: string): Promise<number> {
  const snap = await getDocs(legacyDiagramsCol(uid))
  return snap.size
}