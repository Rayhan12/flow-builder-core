import { createContext } from 'react'
import type { AgentMode } from './prompts'

export type OpenAgentOptions = {
  /** Sent right away when the panel opens. */
  prompt?: string
  /** Project the user is looking at. */
  projectId?: string
}

export type AgentPanelContextValue = {
  isOpen: boolean
  /** Open the general agent drawer. */
  openAgent: (opts?: OpenAgentOptions) => void
  /** Open the "AI create" dialog. */
  openAiCreate: (opts?: OpenAgentOptions) => void
  closeAgent: () => void
  mode: AgentMode
}

export const AgentPanelContext = createContext<AgentPanelContextValue | null>(null)
