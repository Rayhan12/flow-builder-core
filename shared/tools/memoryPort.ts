import {
  ToolError,
  type DataPort,
  type DiagramJson,
  type DiagramSummary,
  type EditOpJson,
  type ProjectSummary,
} from './types.ts'

/**
 * Tiny in-memory DataPort for tests and local experiments. It does not
 * validate diagram bodies; real adapters do. `calls` records every method call.
 */
export function createMemoryDataPort(): DataPort & { calls: { method: string; args: unknown[] }[] } {
  const projects = new Map<string, ProjectSummary>()
  const diagrams = new Map<string, Map<string, DiagramSummary & { diagram: DiagramJson }>>()
  const calls: { method: string; args: unknown[] }[] = []
  let seq = 0

  const rec = (method: string, ...args: unknown[]) => {
    calls.push({ method, args })
  }
  const bucket = (projectId: string) => {
    const b = diagrams.get(projectId)
    if (!projects.has(projectId) || !b) {
      throw new ToolError('not_found', `Project not found: ${projectId}`)
    }
    return b
  }
  const summary = (d: DiagramSummary & { diagram: DiagramJson }): DiagramSummary => ({
    id: d.id,
    projectId: d.projectId,
    title: d.title,
    nodeCount: d.nodeCount,
    revision: d.revision,
    updatedAt: d.updatedAt,
  })
  const nodeCountOf = (diagram: DiagramJson) =>
    Array.isArray(diagram.nodes) ? diagram.nodes.length : 0
  const must = (projectId: string, diagramId: string) => {
    const found = bucket(projectId).get(diagramId)
    if (!found) throw new ToolError('not_found', `Diagram not found: ${diagramId}`)
    return found
  }

  return {
    calls,
    async listProjects() {
      rec('listProjects')
      return [...projects.values()]
    },
    async getProject(projectId) {
      rec('getProject', projectId)
      return projects.get(projectId) ?? null
    },
    async createProject({ name }) {
      rec('createProject', { name })
      const project: ProjectSummary = {
        id: `p_${++seq}`,
        name,
        diagramCount: 0,
        updatedAt: null,
      }
      projects.set(project.id, project)
      diagrams.set(project.id, new Map())
      return project
    },
    async listDiagrams(projectId) {
      rec('listDiagrams', projectId)
      return [...bucket(projectId).values()].map(summary)
    },
    async getDiagram(projectId, diagramId) {
      rec('getDiagram', projectId, diagramId)
      return bucket(projectId).get(diagramId) ?? null
    },
    async createDiagram(projectId, title, diagram) {
      rec('createDiagram', projectId, title, diagram)
      const b = bucket(projectId)
      const body = diagram ?? { title, nodes: [], edges: [] }
      const d = {
        id: `d_${++seq}`,
        projectId,
        title,
        nodeCount: nodeCountOf(body),
        revision: 0,
        updatedAt: null,
        diagram: body,
      }
      b.set(d.id, d)
      return summary(d)
    },
    async updateDiagram(projectId, diagramId, diagram) {
      rec('updateDiagram', projectId, diagramId, diagram)
      const d = must(projectId, diagramId)
      d.diagram = diagram
      d.nodeCount = nodeCountOf(diagram)
      d.revision += 1
      return summary(d)
    },
    async applyDiagramEdits(projectId, diagramId, ops: EditOpJson[]) {
      rec('applyDiagramEdits', projectId, diagramId, ops)
      const d = must(projectId, diagramId)
      d.revision += 1
      return { ...summary(d), changeSummary: `${ops.length} change${ops.length === 1 ? '' : 's'}` }
    },
    async renameDiagram(projectId, diagramId, title) {
      rec('renameDiagram', projectId, diagramId, title)
      const d = must(projectId, diagramId)
      d.title = title
      return summary(d)
    },
    async deleteDiagram(projectId, diagramId) {
      rec('deleteDiagram', projectId, diagramId)
      must(projectId, diagramId)
      bucket(projectId).delete(diagramId)
    },
  }
}
