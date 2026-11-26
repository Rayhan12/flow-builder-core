import { getConnection } from '../ai/providers/connections'
import { getModelCache } from '../ai/providers/modelCache'
import { resolveActiveSelection } from '../ai/providers/selectedModel'
import { createBrowserDataPort } from './browserDataPort'
import { generateWithTools } from './geminiTools'
import { CREATE_FLOW_TOOLS, buildAgentSystemPrompt } from './prompts'

export type AgentCreateInput = { uid: string; projectId: string; prompt: string }
export type AgentCreateResult = { projectId: string; diagramId: string }

/**
 * Headless version of the create flow: runs the tool loop once with the create
 * tools and returns the first diagram it made.
 */
export async function agentCreateDiagram({
  uid,
  projectId,
  prompt,
}: AgentCreateInput): Promise<AgentCreateResult> {
  const active = resolveActiveSelection(uid)
  const conn = active ? getConnection(uid, active.connectionId) : null
  if (!active || !conn) {
    throw new Error('Add an AI provider key in Settings first')
  }
  const port = createBrowserDataPort(uid, {
    layout: async (nodes, edges) =>
      (await import('../editor/layout')).autoLayoutDiagram(nodes, edges, 'DOWN'),
  })
  const project = await port.getProject(projectId)
  const cache = getModelCache(uid, conn.id)
  const modelStatus = cache?.models.find((m) => m.id === active.model)
  const result = await generateWithTools({
    apiKey: conn.apiKey,
    model: active.model,
    connection: conn,
    supportsTools: modelStatus?.supportsTools ?? true,
    system: buildAgentSystemPrompt({
      mode: 'create',
      project: { id: projectId, name: project?.name ?? projectId },
    }),
    history: [],
    userText: prompt,
    port,
    tools: CREATE_FLOW_TOOLS,
  })
  for (const call of result.toolCalls) {
    if (call.name === 'create_diagram' && call.result?.ok) {
      const data = call.result.data as { id: string; projectId: string }
      return { projectId: data.projectId, diagramId: data.id }
    }
  }
  throw new Error(result.text || 'The agent did not create a diagram')
}
