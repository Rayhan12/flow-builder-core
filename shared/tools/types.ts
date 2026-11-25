import type { z } from 'zod'

/**
 * Pure types for the shared agent tool layer. No Firebase, React or browser
 * imports belong in `shared/`, so the browser agent panel and the Vercel MCP
 * server can both depend on it.
 */

/** A diagram document as JSON. The port validates it against the real schema. */
export type DiagramJson = Record<string, unknown>

/** One edit operation. The port validates it against the real ops schema. */
export type EditOpJson = Record<string, unknown>

export type ProjectSummary = {
  id: string
  name: string
  color?: string
  icon?: string
  diagramCount: number
  /** ISO 8601 string or null. */
  updatedAt: string | null
}

export type DiagramSummary = {
  id: string
  projectId: string
  title: string
  nodeCount: number
  revision: number
  /** ISO 8601 string or null. */
  updatedAt: string | null
}

export type DiagramWithBody = DiagramSummary & { diagram: DiagramJson }

export type ToolErrorCode =
  | 'invalid_args'
  | 'unknown_tool'
  | 'not_found'
  | 'confirm_required'
  | 'not_allowed'
  | 'declined'
  | 'failed'

/** Throw this from a DataPort to give the model a precise failure code. */
export class ToolError extends Error {
  code: ToolErrorCode

  constructor(code: ToolErrorCode, message: string) {
    super(message)
    this.name = 'ToolError'
    this.code = code
  }
}

/**
 * Storage access used by the tools. The browser implements it with Firestore
 * via `src/data/*`; the MCP server will implement it with firebase-admin.
 * Every method is already scoped to one user: no method takes a uid.
 *
 * Missing records: `getProject` and `getDiagram` return null; every other
 * method that needs an existing record throws `ToolError('not_found', ...)`.
 */
export interface DataPort {
  listProjects(): Promise<ProjectSummary[]>
  getProject(projectId: string): Promise<ProjectSummary | null>
  createProject(input: { name: string }): Promise<ProjectSummary>

  listDiagrams(projectId: string): Promise<DiagramSummary[]>
  getDiagram(projectId: string, diagramId: string): Promise<DiagramWithBody | null>
  createDiagram(projectId: string, title: string, diagram?: DiagramJson): Promise<DiagramSummary>
  /** Full replace. Validates, saves a version snapshot. */
  updateDiagram(projectId: string, diagramId: string, diagram: DiagramJson): Promise<DiagramSummary>
  /** Applies ops. Validates, saves a version snapshot. */
  applyDiagramEdits(
    projectId: string,
    diagramId: string,
    ops: EditOpJson[],
  ): Promise<DiagramSummary & { changeSummary: string }>
  renameDiagram(projectId: string, diagramId: string, title: string): Promise<DiagramSummary>
  /** Only ever called by `executeTool` after both confirm gates pass. */
  deleteDiagram(projectId: string, diagramId: string): Promise<void>
}

export type ToolResult<T = unknown> =
  | {
      ok: true
      data: T
      /** One line for UI cards and for the model. */
      summary: string
      /** App route for an "Open" link, when the result points at a project or diagram. */
      openPath?: string
      /** True when the tool changed stored data (UIs refresh lists on this). */
      mutated: boolean
    }
  | {
      ok: false
      code: ToolErrorCode
      error: string
    }

export type ToolDefinition = {
  name: string
  description: string
  /** zod object schema for the arguments. */
  input: z.ZodObject
  /** Destructive tools need `confirm: true` in args and `allowDestructive` from the caller. */
  destructive: boolean
  /** True when the tool changes stored data. */
  mutating: boolean
  /**
   * Top-level args that hold free-form JSON (a diagram or an ops array).
   * Model APIs with a limited JSON Schema subset (Gemini) receive these as
   * JSON encoded strings; `executeTool` decodes them before validation.
   */
  jsonArgs: readonly string[]
}

export type ExecuteOptions = {
  /**
   * Set by the caller once a human (or the caller's own policy) approved the
   * destructive action. The browser agent sets it only after its confirm
   * dialog. The MCP server may set it because its tool schema already
   * requires `confirm: true` from the agent.
   */
  allowDestructive?: boolean
}
