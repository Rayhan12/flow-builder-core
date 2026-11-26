/**
 * DataPort backed by firebase-admin, scoped to one uid (from the MCP token).
 * Same contract as createBrowserDataPort; version snapshots use reason "mcp".
 */
import { FieldValue, type Firestore } from 'firebase-admin/firestore'
import { layoutDiagram, placeNodesIncremental } from '../shared/layout/index.ts'
import {
  ToolError,
  type DataPort,
  type DiagramJson,
  type DiagramSummary,
  type ProjectSummary,
} from '../shared/tools/index.ts'
import { EditOpSchema, applyOps, applyReplace } from '../src/ai/ops.ts'
import {
  CURRENT_SCHEMA_VERSION,
  createEmptyDiagram,
  createEmptyDiagramDoc,
  migrateDiagramDoc,
  type Diagram,
  type DiagramDoc,
} from '../src/schema/index.ts'
import { getAdminDb } from './firebaseAdmin.ts'

const DEFAULT_PROJECT_NAME = 'My first project'
const DEFAULT_PROJECT_COLORS = ['teal', 'blue', 'violet', 'amber', 'rose', 'slate'] as const
const DEFAULT_PROJECT_ICONS = ['folder', 'workflow', 'layers', 'briefcase', 'rocket', 'star'] as const
const DELETE_BATCH = 400

type StoredDiagram = {
  id: string
  title: string
  schemaVersion: number
  doc: DiagramDoc
  nodeCount: number
  revision: number
  updatedAt: Date | null
}

function iso(d: Date | null): string | null {
  return d ? d.toISOString() : null
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

function stripUndefined<T>(value: T): T {
  if (Array.isArray(value)) return value.map((item) => stripUndefined(item)) as T
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

function newId(prefix: string): string {
  const raw =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().replace(/-/g, '')
      : `${Date.now()}${Math.random().toString(16).slice(2)}`
  return `${prefix}_${raw.slice(0, 16)}`
}

function defaultColor(seed: string): string {
  let hash = 0
  for (let i = 0; i < seed.length; i++) hash = (hash + seed.charCodeAt(i)) % DEFAULT_PROJECT_COLORS.length
  return DEFAULT_PROJECT_COLORS[hash] ?? DEFAULT_PROJECT_COLORS[0]
}

function defaultIcon(seed: string): string {
  let hash = 0
  for (let i = 0; i < seed.length; i++) hash = (hash + seed.charCodeAt(i)) % DEFAULT_PROJECT_ICONS.length
  return DEFAULT_PROJECT_ICONS[hash] ?? DEFAULT_PROJECT_ICONS[0]
}

function projectPath(uid: string, projectId: string) {
  return `users/${uid}/projects/${projectId}`
}

function diagramPath(uid: string, projectId: string, diagramId: string) {
  return `${projectPath(uid, projectId)}/diagrams/${diagramId}`
}

function toProjectSummary(id: string, data: Record<string, unknown>): ProjectSummary {
  return {
    id,
    name: typeof data.name === 'string' ? data.name : DEFAULT_PROJECT_NAME,
    color: typeof data.color === 'string' ? data.color : 'teal',
    icon: typeof data.icon === 'string' ? data.icon : 'folder',
    diagramCount: typeof data.diagramCount === 'number' ? data.diagramCount : 0,
    updatedAt: iso(asDate(data.updatedAt)),
  }
}

function toDiagramSummary(projectId: string, d: StoredDiagram): DiagramSummary {
  return {
    id: d.id,
    projectId,
    title: d.title,
    nodeCount: d.nodeCount,
    revision: d.revision,
    updatedAt: iso(d.updatedAt),
  }
}

function parseStoredDiagram(id: string, data: Record<string, unknown>): StoredDiagram {
  const rawDoc = (data.doc ?? {}) as DiagramDoc
  const doc = migrateDiagramDoc(rawDoc)
  return {
    id,
    title: typeof data.title === 'string' ? data.title : doc.title,
    schemaVersion:
      typeof data.schemaVersion === 'number' ? data.schemaVersion : doc.schemaVersion,
    doc,
    nodeCount:
      typeof data.nodeCount === 'number' ? data.nodeCount : (doc.nodes?.length ?? 0),
    revision: typeof data.revision === 'number' ? data.revision : 0,
    updatedAt: asDate(data.updatedAt),
  }
}

async function adjustDiagramCount(
  db: Firestore,
  uid: string,
  projectId: string,
  delta: number,
): Promise<void> {
  const ref = db.doc(projectPath(uid, projectId))
  const snap = await ref.get()
  if (!snap.exists) return
  const data = snap.data() as Record<string, unknown>
  const current = typeof data.diagramCount === 'number' ? data.diagramCount : 0
  await ref.update({
    diagramCount: Math.max(0, current + delta),
    updatedAt: FieldValue.serverTimestamp(),
  })
}

async function deleteSubcollection(
  db: Firestore,
  parentPath: string,
  sub: string,
): Promise<void> {
  const col = db.collection(`${parentPath}/${sub}`)
  let more = true
  while (more) {
    const snap = await col.limit(DELETE_BATCH).get()
    if (snap.empty) {
      more = false
      break
    }
    const batch = db.batch()
    for (const d of snap.docs) batch.delete(d.ref)
    await batch.commit()
    more = snap.size >= DELETE_BATCH
  }
}

/**
 * Create a DataPort for `uid`. All paths are under users/{uid}/...
 * No method accepts a uid argument.
 */
export function createAdminDataPort(uid: string, db: Firestore = getAdminDb()): DataPort {
  async function requireProject(projectId: string): Promise<ProjectSummary> {
    const snap = await db.doc(projectPath(uid, projectId)).get()
    if (!snap.exists) throw new ToolError('not_found', `Project not found: ${projectId}`)
    return toProjectSummary(snap.id, snap.data() as Record<string, unknown>)
  }

  async function requireDiagram(projectId: string, diagramId: string): Promise<StoredDiagram> {
    await requireProject(projectId)
    const snap = await db.doc(diagramPath(uid, projectId, diagramId)).get()
    if (!snap.exists) throw new ToolError('not_found', `Diagram not found: ${diagramId}`)
    return parseStoredDiagram(snap.id, snap.data() as Record<string, unknown>)
  }

  function baseOf(record: StoredDiagram): Diagram {
    return { ...record.doc, id: record.id }
  }

  async function runFullLayout(diagram: Diagram): Promise<Diagram> {
    try {
      const laid = await layoutDiagram(diagram.nodes, diagram.edges, { direction: 'DOWN' })
      return {
        ...diagram,
        nodes: laid.nodes,
        edges: laid.edges,
        layoutPending: false,
        fitPending: true,
      }
    } catch {
      return { ...diagram, layoutPending: true, fitPending: true }
    }
  }

  async function validateReplace(base: Diagram, raw: DiagramJson, summary: string): Promise<Diagram> {
    const result = applyReplace(base, raw, summary)
    if (!result.ok) {
      throw new ToolError(
        result.code === 'graph_invalid' ? 'graph_invalid' : 'invalid_args',
        `Invalid diagram: ${result.error}`,
      )
    }
    return runFullLayout(result.diagram)
  }

  async function persist(
    projectId: string,
    record: StoredDiagram,
    next: Diagram,
  ): Promise<StoredDiagram> {
    const nextDoc = stripUndefined(
      migrateDiagramDoc({
        schemaVersion: next.schemaVersion,
        title: next.title,
        description: next.description,
        nodes: next.nodes,
        edges: next.edges,
        groups: next.groups,
        viewport: next.viewport,
        theme: next.theme,
        layoutPending: next.layoutPending,
        fitPending: next.fitPending,
      }),
    )
    const nextRevision = record.revision + 1
    const ref = db.doc(diagramPath(uid, projectId, record.id))
    await ref.update({
      title: nextDoc.title,
      schemaVersion: nextDoc.schemaVersion,
      doc: nextDoc,
      nodeCount: nextDoc.nodes.length,
      revision: nextRevision,
      updatedAt: FieldValue.serverTimestamp(),
    })

    try {
      const versionId = newId('v')
      await db.doc(`${diagramPath(uid, projectId, record.id)}/versions/${versionId}`).set({
        doc: nextDoc,
        createdAt: FieldValue.serverTimestamp(),
        reason: 'mcp',
      })
    } catch {
      // Version history is best effort.
    }

    return {
      id: record.id,
      title: nextDoc.title,
      schemaVersion: nextDoc.schemaVersion,
      doc: nextDoc,
      nodeCount: nextDoc.nodes.length,
      revision: nextRevision,
      updatedAt: new Date(),
    }
  }

  return {
    async listProjects() {
      const snap = await db
        .collection(`users/${uid}/projects`)
        .orderBy('updatedAt', 'desc')
        .get()
      return snap.docs.map((d) => toProjectSummary(d.id, d.data() as Record<string, unknown>))
    },

    async getProject(projectId) {
      const snap = await db.doc(projectPath(uid, projectId)).get()
      if (!snap.exists) return null
      return toProjectSummary(snap.id, snap.data() as Record<string, unknown>)
    },

    async createProject({ name }) {
      const id = newId('p')
      const trimmed = name.trim().slice(0, 200) || DEFAULT_PROJECT_NAME
      const color = defaultColor(id)
      const icon = defaultIcon(id)
      await db.doc(projectPath(uid, id)).set({
        name: trimmed,
        color,
        icon,
        diagramCount: 0,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      })
      return {
        id,
        name: trimmed,
        color,
        icon,
        diagramCount: 0,
        updatedAt: new Date().toISOString(),
      }
    },

    async listDiagrams(projectId) {
      await requireProject(projectId)
      const snap = await db
        .collection(`${projectPath(uid, projectId)}/diagrams`)
        .orderBy('updatedAt', 'desc')
        .get()
      return snap.docs.map((d) =>
        toDiagramSummary(projectId, parseStoredDiagram(d.id, d.data() as Record<string, unknown>)),
      )
    },

    async getDiagram(projectId, diagramId) {
      const snap = await db.doc(diagramPath(uid, projectId, diagramId)).get()
      if (!snap.exists) return null
      const record = parseStoredDiagram(snap.id, snap.data() as Record<string, unknown>)
      return {
        ...toDiagramSummary(projectId, record),
        diagram: { ...record.doc } as DiagramJson,
      }
    },

    async createDiagram(projectId, title, diagram) {
      await requireProject(projectId)
      let body: Diagram | null = null
      if (diagram) {
        body = await validateReplace(
          createEmptyDiagram('pending', title),
          { ...diagram, title },
          'Created',
        )
      }
      const id = newId('d')
      const empty = createEmptyDiagramDoc(title)
      const initial = body
        ? stripUndefined(
            migrateDiagramDoc({
              schemaVersion: body.schemaVersion,
              title: body.title,
              description: body.description,
              nodes: body.nodes,
              edges: body.edges,
              groups: body.groups,
              viewport: body.viewport,
              theme: body.theme,
            }),
          )
        : empty
      await db.doc(diagramPath(uid, projectId, id)).set({
        ownerId: uid,
        title: initial.title,
        schemaVersion: initial.schemaVersion ?? CURRENT_SCHEMA_VERSION,
        doc: initial,
        nodeCount: initial.nodes.length,
        revision: 0,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      })
      await adjustDiagramCount(db, uid, projectId, 1)

      const record: StoredDiagram = {
        id,
        title: initial.title,
        schemaVersion: initial.schemaVersion ?? CURRENT_SCHEMA_VERSION,
        doc: initial,
        nodeCount: initial.nodes.length,
        revision: 0,
        updatedAt: new Date(),
      }

      if (body) {
        const saved = await persist(projectId, record, { ...body, id })
        return toDiagramSummary(projectId, saved)
      }
      return toDiagramSummary(projectId, record)
    },

    async updateDiagram(projectId, diagramId, diagram) {
      const record = await requireDiagram(projectId, diagramId)
      const next = await validateReplace(baseOf(record), diagram, 'Replaced')
      return toDiagramSummary(projectId, await persist(projectId, record, next))
    },

    async applyDiagramEdits(projectId, diagramId, ops) {
      const parsed = EditOpSchema.array().safeParse(ops)
      if (!parsed.success) {
        const issue = parsed.error.issues[0]
        const where = issue?.path.length ? ` at ${issue.path.join('.')}` : ''
        throw new ToolError('invalid_args', `Invalid ops${where}: ${issue?.message ?? 'bad shape'}`)
      }
      const record = await requireDiagram(projectId, diagramId)
      const before = baseOf(record)
      const result = applyOps(before, parsed.data)
      if (!result.ok) {
        throw new ToolError(
          result.code === 'graph_invalid' ? 'graph_invalid' : 'invalid_args',
          `Edits not applied: ${result.error}`,
        )
      }
      let next = result.diagram
      const added = result.diff.addedNodes
      if (added.length > 0) {
        try {
          if (before.nodes.length <= 1) {
            next = await runFullLayout(next)
          } else {
            const laid = await placeNodesIncremental(next.nodes, next.edges, added, {
              direction: 'DOWN',
            })
            next = {
              ...next,
              nodes: laid.nodes,
              edges: laid.edges,
              layoutPending: false,
              fitPending: true,
            }
          }
        } catch {
          next = { ...next, fitPending: true }
        }
      } else {
        next = { ...next, fitPending: true }
      }
      const saved = await persist(projectId, record, next)
      return { ...toDiagramSummary(projectId, saved), changeSummary: result.diff.summary }
    },

    async renameDiagram(projectId, diagramId, title) {
      const record = await requireDiagram(projectId, diagramId)
      const trimmed = title.trim().slice(0, 200)
      if (!trimmed) throw new ToolError('invalid_args', 'Title cannot be empty')
      const nextDoc: DiagramDoc = { ...record.doc, title: trimmed }
      await db.doc(diagramPath(uid, projectId, diagramId)).update({
        title: trimmed,
        doc: nextDoc,
        updatedAt: FieldValue.serverTimestamp(),
        revision: record.revision + 1,
      })
      return toDiagramSummary(projectId, {
        ...record,
        title: trimmed,
        doc: nextDoc,
        revision: record.revision + 1,
        updatedAt: new Date(),
      })
    },

    async deleteDiagram(projectId, diagramId) {
      await requireDiagram(projectId, diagramId)
      const path = diagramPath(uid, projectId, diagramId)
      await deleteSubcollection(db, path, 'messages')
      await deleteSubcollection(db, path, 'versions')
      await db.doc(path).delete()
      await adjustDiagramCount(db, uid, projectId, -1)
    },
  }
}
