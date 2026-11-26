import { describe, expect, it } from 'vitest'
import { MCP_TOOL_NAMES, TOOL_LIST } from '../../shared/tools/index.ts'
import { registeredMcpToolNames } from './tools.ts'

describe('MCP registered tools', () => {
  it('matches shared TOOL_LIST and MCP_TOOL_NAMES exactly', () => {
    expect(registeredMcpToolNames()).toEqual(TOOL_LIST.map((d) => d.name))
    expect(registeredMcpToolNames()).toEqual([...MCP_TOOL_NAMES])
  })
})
