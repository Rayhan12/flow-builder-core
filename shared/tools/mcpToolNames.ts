/**
 * Tool names exposed by the MCP server (docs/PLAN.md section 15) and reused
 * by the in-app agent panel (section 16). Order matches the plan.
 */
export const MCP_TOOL_NAMES = [
  'list_projects',
  'get_project',
  'create_project',
  'list_diagrams',
  'get_diagram',
  'create_diagram',
  'update_diagram',
  'apply_diagram_edits',
  'rename_diagram',
  'delete_diagram',
] as const

export type ToolName = (typeof MCP_TOOL_NAMES)[number]
