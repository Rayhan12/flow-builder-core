import { getApiKey } from '../ai/keyStorage'
import { getUserSettings } from '../data/settings'
import { createBrowserDataPort } from './browserDataPort'
import { generateWithTools } from './geminiTools'
import { CREATE_FLOW_TOOLS, buildAgentSystemPrompt } from './prompts'

export type AgentCreateInput = { uid: string; projectId: string; prompt: string }
export type AgentCreateResult = { projectId: string; diagramId: string }

/**
 * Headless version of the create flow: runs the Gemini tool loop once with
 * the create tools and returns the first diagram it made. Has the same shape
 * as the dashboard's `AiCreateHandler` (`{ uid, projectId, prompt }` in,
 * `{ projectId, diagramId }` out), so it can be passed straight to
 * `AppDataProvider onGenerate` instead of the empty-diagram stub.
 */
export async function agentCreateDiagram({
  uid,
  projectId,
  prompt,
}: AgentCreateInput): Promise<AgentCreateResult> {
  const apiKey = getApiKey(uid)
  if (!apiKey) throw new Error('Add your Gemini API key in Settings first')
  const settings = await getUserSettings(uid)
  const port = createBrowserDataPort(uid, {
    layout: async (nodes, edges) =>
      (await import('../editor/layout')).autoLayoutDiagram(nodes, edges, 'DOWN'),
  })
  const project = await port.getProject(projectId)
  const result = await generateWithTools({
    apiKey,
    model: settings.aiModel,
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
