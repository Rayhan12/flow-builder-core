/**
 * Register the shared tool definitions on an MCP server.
 * Handlers call executeTool against a uid-scoped admin DataPort.
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { executeTool, TOOL_LIST, type DataPort } from '../../shared/tools/index.ts'

export const MCP_SERVER_NAME = 'flow-builder'
export const MCP_SERVER_VERSION = '1.0.0'

/** Names registered on the MCP server (must match shared TOOL_LIST). */
export function registeredMcpToolNames(): string[] {
  return TOOL_LIST.map((d) => d.name)
}

export function registerMcpTools(server: McpServer, port: DataPort): void {
  for (const def of TOOL_LIST) {
    server.registerTool(
      def.name,
      {
        description: def.description,
        // Plan: use def.input.shape as the MCP input schema.
        inputSchema: def.input.shape,
      },
      async (args) => {
        const result = await executeTool(def.name, args ?? {}, port, {
          allowDestructive: true,
        })
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(result),
            },
          ],
          isError: !result.ok,
        }
      },
    )
  }
}
