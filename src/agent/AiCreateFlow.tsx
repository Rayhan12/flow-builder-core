import { AgentPanel, type AgentPanelProps } from './AgentPanel'

export type AiCreateFlowProps = Pick<
  AgentPanelProps,
  'open' | 'onClose' | 'initialPrompt' | 'initialProjectId' | 'onDataChanged' | 'generate' | 'createPort'
>

/**
 * "AI create" entry point for the sidebar and dashboard. A centred dialog that
 * starts a fresh chat, limits the agent to creating and editing diagrams
 * (no delete, no new projects) and shows an Open link for what it made.
 * Pass `initialPrompt` to send it as soon as the dialog opens.
 */
export function AiCreateFlow(props: AiCreateFlowProps) {
  return <AgentPanel {...props} mode="create" variant="dialog" />
}
