import {
  collection,
  doc,
  serverTimestamp,
  setDoc,
  type Timestamp,
} from 'firebase/firestore'
import { db } from '../lib/firebase'
import type { Diagram, DiagramDoc } from '../schema'

export type VersionReason = 'manual' | 'ai-apply' | 'import'

export type DiagramVersion = {
  id: string
  doc: DiagramDoc
  createdAt: Date | null
  reason: VersionReason
}

function versionsCol(uid: string, projectId: string, diagramId: string) {
  return collection(
    db,
    'users',
    uid,
    'projects',
    projectId,
    'diagrams',
    diagramId,
    'versions',
  )
}

function versionRef(uid: string, projectId: string, diagramId: string, versionId: string) {
  return doc(
    db,
    'users',
    uid,
    'projects',
    projectId,
    'diagrams',
    diagramId,
    'versions',
    versionId,
  )
}

function newVersionId(): string {
  const raw =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().replace(/-/g, '')
      : `${Date.now()}${Math.random().toString(16).slice(2)}`
  return `v_${raw.slice(0, 16)}`
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

function toDoc(diagram: Diagram): DiagramDoc {
  return {
    schemaVersion: diagram.schemaVersion,
    title: diagram.title,
    description: diagram.description,
    nodes: diagram.nodes,
    edges: diagram.edges,
    groups: diagram.groups ?? [],
    viewport: diagram.viewport,
    theme: diagram.theme,
  }
}

export async function saveVersion(
  uid: string,
  projectId: string,
  diagramId: string,
  diagram: Diagram,
  reason: VersionReason,
): Promise<DiagramVersion> {
  const id = newVersionId()
  const docBody = toDoc(diagram)
  await setDoc(versionRef(uid, projectId, diagramId, id), {
    doc: docBody,
    createdAt: serverTimestamp(),
    reason,
  })
  return {
    id,
    doc: docBody,
    createdAt: new Date(),
    reason,
  }
}

/** Exported for tests / future list UI. */
export function parseVersion(id: string, data: Record<string, unknown>): DiagramVersion {
  return {
    id,
    doc: data.doc as DiagramDoc,
    createdAt: asDate(data.createdAt),
    reason:
      data.reason === 'ai-apply' || data.reason === 'import' || data.reason === 'manual'
        ? data.reason
        : 'manual',
  }
}

export function versionsCollection(uid: string, projectId: string, diagramId: string) {
  return versionsCol(uid, projectId, diagramId)
}