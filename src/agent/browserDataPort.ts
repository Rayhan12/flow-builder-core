import {
  ToolError,
  type DataPort,
  type DiagramJson,
  type DiagramSummary,
  type ProjectSummary,
} from '../../shared/tools'
import { EditOpSchema, applyOps, applyReplace } from '../ai/ops'
import {
  createDiagram,
  deleteDiagram,
  getDiagram,
  listDiagrams,
  renameDiagram,
  saveDiagram,
  type DiagramListItem,
  type DiagramRecord,
} from '../data/diagrams'
import {
  createProject,
  getProject,
  listProjects,
  type Project,
  type ProjectListItem,
} from '../data/projects'
import { saveVersion } from '../data/versions'
import { createEmptyDiagram, type Diagram, type DiagramEdge, type DiagramNode } from '../schema'

export type LayoutFn = (
  nodes: DiagramNode[],
  edges: DiagramEdge[],
) => Promise<DiagramNode[] | { nodes: DiagramNode[]; edges: DiagramEdge[] }>

export type IncrementalLayoutFn = (
  nodes: DiagramNode[],
  edges: DiagramEdge[],
  newNodeIds: string[],
) => Promise<{ nodes: DiagramNode[]; edges: DiagramEdge[] } | DiagramNode[]>

export type BrowserDataPortOptions = {
  /**
   * Auto layout after create_diagram / update_diagram.
   * Prefer returning `{ nodes, edges }` so orthogonal waypoints are kept.
   */
  layout?: LayoutFn
  /**
   * Incremental placement when apply_diagram_edits adds nodes.
   * Falls back to full `layout` when omitted.
   */
  placeIncremental?: IncrementalLayoutFn
  /** When true, skip layout (e2e piled-up screenshots). */
  disableAutoLayout?: boolean
}

function iso(d: Date | null): string | null {
  return d ? d.toISOString() : null
}

function projectSummary(p: Project | ProjectListItem): ProjectSummary {
  return {
    id: p.id,
    name: p.name,
    color: p.color,
    icon: p.icon,
    diagramCount: p.diagramCount,
    updatedAt: iso(p.updatedAt),
  }
}

function listItemSummary(projectId: string, d: DiagramListItem): DiagramSummary {
  return {
    id: d.id,
    projectId,
    title: d.title,
    nodeCount: d.nodeCount,
    revision: d.revision,
    updatedAt: iso(d.updatedAt),
  }
}

function recordSummary(projectId: string, d: DiagramRecord): DiagramSummary {
  return {
    id: d.id,
    projectId,
    title: d.title,
    nodeCount: d.doc.nodes.length,
    revision: d.revision,
    updatedAt: iso(d.updatedAt),
  }
}

function normalizeLayoutResult(
  result: DiagramNode[] | { nodes: DiagramNode[]; edges: DiagramEdge[] },
  edges: DiagramEdge[],
): { nodes: DiagramNode[]; edges: DiagramEdge[] } {
  if (Array.isArray(result)) return { nodes: result, edges }
  return result
}

/**
 * DataPort backed by Firestore through `src/data/*`, scoped to one user.
 * The caller (the signed-in agent panel) supplies `uid`; no tool can pass one.
 */
export function createBrowserDataPort(uid: string, options: BrowserDataPortOptions = {}): DataPort {
  async function requireProject(projectId: string): Promise<Project> {
    const project = await getProject(uid, projectId)
    if (!project) throw new ToolError('not_found', `Project not found: ${projectId}`)
    return project
  }

  async function requireDiagram(projectId: string, diagramId: string): Promise<DiagramRecord> {
    const record = await getDiagram(uid, projectId, diagramId)
    if (!record) throw new ToolError('not_found', `Diagram not found: ${diagramId}`)
    return record
  }

  function baseOf(record: DiagramRecord): Diagram {
    return { ...record.doc, id: record.id }
  }

  async function runFullLayout(diagram: Diagram): Promise<Diagram> {
    if (options.disableAutoLayout || !options.layout) {
      return { ...diagram, layoutPending: true, fitPending: true }
    }
    try {
      const laid = normalizeLayoutResult(
        await options.layout(diagram.nodes, diagram.edges),
        diagram.edges,
      )
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

  async function runIncremental(
    before: Diagram,
    after: Diagram,
    addedNodeIds: string[],
  ): Promise<Diagram> {
    if (options.disableAutoLayout) {
      return { ...after, layoutPending: true, fitPending: true }
    }
    if (addedNodeIds.length === 0) {
      return { ...after, fitPending: true }
    }
    try {
      if (options.placeIncremental) {
        const laid = normalizeLayoutResult(
          await options.placeIncremental(after.nodes, after.edges, addedNodeIds),
          after.edges,
        )
        return {
          ...after,
          nodes: laid.nodes,
          edges: laid.edges,
          layoutPending: false,
          fitPending: true,
        }
      }
      // Full layout when the board was empty / nearly empty; otherwise keep
      // applyOps positions if no incremental fn was supplied.
      if (options.layout && before.nodes.length <= 1) {
        return runFullLayout(after)
      }
      return { ...after, fitPending: true }
    } catch {
      return { ...after, fitPending: true }
    }
  }

  /** Validate a full diagram and place it on the base. Throws invalid_args. */
  async function validateReplace(base: Diagram, raw: DiagramJson, summary: string): Promise<Diagram> {
    const result = applyReplace(base, raw, summary)
    if (!result.ok) throw new ToolError('invalid_args', `Invalid diagram: ${result.error}`)
    return runFullLayout(result.diagram)
  }

  async function persist(projectId: string, record: DiagramRecord, next: Diagram): Promise<DiagramRecord> {
    const revision = await saveDiagram(uid, projectId, record.id, next, record.revision)
    try {
      await saveVersion(uid, projectId, record.id, next, 'agent')
    } catch {
      // ignore
    }
    return { ...record, title: next.title, doc: next, revision }
  }

  return {
    async listProjects() {
      return (await listProjects(uid)).map(projectSummary)
    },

    async getProject(projectId) {
      const project = await getProject(uid, projectId)
      return project ? projectSummary(project) : null
    },

    async createProject({ name }) {
      return projectSummary(await createProject(uid, { name }))
    },

    async listDiagrams(projectId) {
      await requireProject(projectId)
      return (await listDiagrams(uid, projectId)).map((d) => listItemSummary(projectId, d))
    },

    async getDiagram(projectId, diagramId) {
      const record = await getDiagram(uid, projectId, diagramId)
      if (!record) return null
      return {
        ...recordSummary(projectId, record),
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
      const created = await createDiagram(uid, projectId, title)
      if (!body) return recordSummary(projectId, created)
      const saved = await persist(projectId, created, { ...body, id: created.id })
      return recordSummary(projectId, saved)
    },

    async updateDiagram(projectId, diagramId, diagram) {
      const record = await requireDiagram(projectId, diagramId)
      const next = await validateReplace(baseOf(record), diagram, 'Replaced')
      return recordSummary(projectId, await persist(projectId, record, next))
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
      if (!result.ok) throw new ToolError('invalid_args', `Edits not applied: ${result.error}`)
      const addedNodeIds = result.diff.addedNodes
      const next = await runIncremental(before, result.diagram, addedNodeIds)
      const saved = await persist(projectId, record, next)
      return { ...recordSummary(projectId, saved), changeSummary: result.diff.summary }
    },

    async renameDiagram(projectId, diagramId, title) {
      await requireDiagram(projectId, diagramId)
      await renameDiagram(uid, projectId, diagramId, title)
      return recordSummary(projectId, await requireDiagram(projectId, diagramId))
    },

    async deleteDiagram(projectId, diagramId) {
      await requireDiagram(projectId, diagramId)
      await deleteDiagram(uid, projectId, diagramId)
    },
  }
}
