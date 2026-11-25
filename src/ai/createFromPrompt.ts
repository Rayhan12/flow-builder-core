import { createDiagram } from '../data/diagrams'

export type AiCreateInput = {
  uid: string
  projectId: string
  prompt: string
}

export type AiCreateResult = {
  projectId: string
  diagramId: string
}

/**
 * Hook point for the AI agent. The default stub creates an empty diagram titled
 * from the prompt; the agent panel can later supply its own handler that also
 * runs the Gemini loop. The prompt is forwarded to the editor via router state
 * (`{ aiPrompt }`) so the agent panel can pick it up on open.
 */
export type AiCreateHandler = (input: AiCreateInput) => Promise<AiCreateResult>

export function titleFromPrompt(prompt: string): string {
  const oneLine = prompt.replace(/\s+/g, ' ').trim()
  if (!oneLine) return 'Untitled diagram'
  const firstSentence = oneLine.split(/(?<=[.!?])\s/)[0] ?? oneLine
  const clipped = firstSentence.length > 60 ? `${firstSentence.slice(0, 57).trimEnd()}...` : firstSentence
  return clipped.replace(/[.!?]+$/, '') || 'Untitled diagram'
}

export const stubAiCreate: AiCreateHandler = async ({ uid, projectId, prompt }) => {
  const created = await createDiagram(uid, projectId, titleFromPrompt(prompt))
  return { projectId, diagramId: created.id }
}
