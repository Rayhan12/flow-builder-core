import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { AgentPanel } from './AgentPanel'
import { AgentPanelContext, type AgentPanelContextValue, type OpenAgentOptions } from './agentPanelContext'
import { AiCreateFlow } from './AiCreateFlow'

type AgentPanelProviderProps = {
  children: ReactNode
  /** Called after the agent changed stored data, so the app can refresh lists. */
  onDataChanged?: () => void
}

type PanelState = {
  kind: 'agent' | 'create' | null
  prompt?: string
  projectId?: string
}

/**
 * Owns the one agent panel for the app. Place it inside the Router and
 * AuthProvider, around the shell. Anything below can call `useAgentPanel()`.
 */
export function AgentPanelProvider({ children, onDataChanged }: AgentPanelProviderProps) {
  const [state, setState] = useState<PanelState>({ kind: null })

  const openAgent = useCallback((opts?: OpenAgentOptions) => {
    setState({ kind: 'agent', prompt: opts?.prompt, projectId: opts?.projectId })
  }, [])
  const openAiCreate = useCallback((opts?: OpenAgentOptions) => {
    setState({ kind: 'create', prompt: opts?.prompt, projectId: opts?.projectId })
  }, [])
  const closeAgent = useCallback(() => setState({ kind: null }), [])

  const value = useMemo<AgentPanelContextValue>(
    () => ({
      isOpen: state.kind !== null,
      openAgent,
      openAiCreate,
      closeAgent,
      mode: state.kind === 'create' ? 'create' : 'agent',
    }),
    [state.kind, openAgent, openAiCreate, closeAgent],
  )

  return (
    <AgentPanelContext.Provider value={value}>
      {children}
      <AgentPanel
        open={state.kind === 'agent'}
        onClose={closeAgent}
        initialPrompt={state.prompt}
        initialProjectId={state.projectId}
        onDataChanged={onDataChanged}
        variant="drawer"
      />
      <AiCreateFlow
        open={state.kind === 'create'}
        onClose={closeAgent}
        initialPrompt={state.prompt}
        initialProjectId={state.projectId}
        onDataChanged={onDataChanged}
      />
    </AgentPanelContext.Provider>
  )
}
