import { useContext } from 'react'
import { AgentPanelContext } from './agentPanelContext'

/** Open and close the shared agent panel. Needs <AgentPanelProvider> above it. */
export function useAgentPanel() {
  const ctx = useContext(AgentPanelContext)
  if (!ctx) {
    throw new Error('useAgentPanel must be used within AgentPanelProvider')
  }
  return ctx
}
