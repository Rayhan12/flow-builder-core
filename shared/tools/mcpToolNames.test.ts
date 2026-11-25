import { describe, expect, it } from 'vitest'
import { MCP_TOOL_NAMES, TOOL_DEFINITIONS, TOOL_LIST } from './index.ts'

/** Must match docs/PLAN.md section 15 (MCP server tools) exactly. */
const PLANNED = [
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
]

describe('MCP tool names', () => {
  it('equals the planned list exactly', () => {
    expect([...MCP_TOOL_NAMES]).toEqual(PLANNED)
  })

  it('has one definition per name, in order, with matching names', () => {
    expect(TOOL_LIST.map((t) => t.name)).toEqual(PLANNED)
    for (const name of MCP_TOOL_NAMES) {
      expect(TOOL_DEFINITIONS[name].name).toBe(name)
      expect(TOOL_DEFINITIONS[name].description.length).toBeGreaterThan(10)
    }
    expect(Object.keys(TOOL_DEFINITIONS).sort()).toEqual([...PLANNED].sort())
  })

  it('marks only delete_diagram as destructive', () => {
    expect(TOOL_LIST.filter((t) => t.destructive).map((t) => t.name)).toEqual(['delete_diagram'])
  })
})
