import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createEmptyDiagram } from '../schema'
import { useEditorStore } from '../store/editorStore'
import { ThemeProvider } from '../theme/ThemeProvider'
import { forgetApiKey } from './keyStorage'
import { upsertConnection } from './providers/connections'
import { computeKeyFingerprint, saveModelCache } from './providers/modelCache'
import { setSelectedModel } from './providers/selectedModel'
import { AssistantPanel } from './AssistantPanel'
import type { LLMProvider } from './provider'

async function seedAiReady(uid: string, apiKey: string) {
  const conn = upsertConnection(uid, {
    provider: 'gemini',
    label: 'Gemini',
    apiKey,
  })
  const fp = await computeKeyFingerprint(conn)
  upsertConnection(uid, { ...conn, keyFingerprint: fp })
  saveModelCache(uid, {
    connectionId: conn.id,
    keyFingerprint: fp,
    lastCheckedAt: Date.now(),
    enabledModelIds: ['gemini-2.5-flash'],
    models: [
      { id: 'gemini-2.5-flash', usable: true, supportsTools: true, checkedAt: Date.now() },
    ],
  })
  setSelectedModel(uid, {
    connectionId: conn.id,
    provider: 'gemini',
    model: 'gemini-2.5-flash',
  })
}

vi.mock('../auth/useAuth', () => ({
  useAuth: () => ({
    user: { uid: 'u1', email: 'demo@example.com' },
    loading: false,
    signIn: vi.fn(),
    signUp: vi.fn(),
    signOut: vi.fn(),
    signInWithGoogle: vi.fn(),
    resetPassword: vi.fn(),
  }),
}))

vi.mock('../data/messages', () => ({
  listMessages: vi.fn().mockResolvedValue([]),
  addMessage: vi.fn().mockImplementation(
    async (
      _uid: string,
      _diagramId: string,
      input: { role: string; text: string; applied?: boolean },
    ) => ({
      id: `m_${Math.random().toString(16).slice(2)}`,
      role: input.role,
      text: input.text,
      createdAt: new Date(),
      applied: input.applied === true,
    }),
  ),
  markMessageApplied: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../ai/providers/probe', () => ({
  listAndProbeModels: vi.fn().mockImplementation(async (uid: string, conn: { id: string }) => {
    const { computeKeyFingerprint, saveModelCache } = await import('./providers/modelCache')
    const fp = await computeKeyFingerprint(conn as never)
    const cache = {
      connectionId: conn.id,
      keyFingerprint: fp,
      lastCheckedAt: Date.now(),
      enabledModelIds: ['gemini-2.5-flash'],
      models: [
        { id: 'gemini-2.5-flash', usable: true, supportsTools: true, checkedAt: Date.now() },
      ],
    }
    saveModelCache(uid, cache)
    return cache
  }),
  recheckModel: vi.fn(),
}))

vi.mock('../data/settings', () => ({
  getUserSettings: vi.fn().mockResolvedValue({
    theme: 'light',
    aiProvider: 'gemini',
    aiModel: 'gemini-2.5-flash',
  }),
  updateUserSettings: vi.fn().mockResolvedValue({
    theme: 'light',
    aiProvider: 'gemini',
    aiModel: 'gemini-2.5-flash',
  }),
  DEFAULT_USER_SETTINGS: {
    theme: 'light',
    aiProvider: 'gemini',
    aiModel: 'gemini-2.5-flash',
  },
  GEMINI_MODELS: ['gemini-2.5-flash'],
}))

vi.mock('../data/versions', () => ({
  saveVersion: vi.fn().mockResolvedValue({ id: 'v1' }),
}))

vi.mock('../editor/layout', () => ({
  isAutoLayoutDisabled: () => false,
  layoutDiagram: vi.fn().mockImplementation(async (nodes: unknown, edges: unknown) => ({
    nodes,
    edges,
  })),
  placeNodesIncremental: vi.fn().mockImplementation((nodes: unknown, edges: unknown) => ({
    nodes,
    edges,
  })),
  autoLayoutDiagram: vi.fn().mockImplementation(async (nodes: unknown) => nodes),
}))

function renderPanel(provider?: LLMProvider) {
  return render(
    <ThemeProvider>
      <MemoryRouter>
        <AssistantPanel
          open
          onClose={() => undefined}
          projectId="p1"
          diagramId="d1"
          providerFactory={
            provider
              ? () => provider
              : (apiKey, model) => {
                  throw new Error(`Unexpected real provider ${apiKey} ${model}`)
                }
          }
        />
      </MemoryRouter>
    </ThemeProvider>,
  )
}

describe('AssistantPanel', () => {
  beforeEach(() => {
    localStorage.clear()
    forgetApiKey('u1')
    useEditorStore.getState().reset()
    useEditorStore.getState().load(createEmptyDiagram('d1', 'Demo'), 0)
  })

  it('shows a missing key card when no key is saved', async () => {
    renderPanel()
    expect(await screen.findByTestId('ai-missing-key')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Open Settings/i })).toHaveAttribute(
      'href',
      '/settings',
    )
  })

  it('saves a key from the inline card', async () => {
    const user = userEvent.setup()
    renderPanel()
    await screen.findByTestId('ai-missing-key')
    await user.type(screen.getByPlaceholderText(/Paste your API key/i), 'key-from-panel')
    await user.click(screen.getByRole('button', { name: 'Save key' }))
    await screen.findByTestId('ai-save-enabled')
    await user.click(screen.getByTestId('ai-save-enabled'))
    await waitFor(() => {
      expect(screen.queryByTestId('ai-missing-key')).not.toBeInTheDocument()
    })
  })

  it('rejects invalid AI output and offers try again', async () => {
    await seedAiReady('u1', 'test-key')
    const provider: LLMProvider = {
      id: 'mock',
      listModels: async () => ['mock'],
      generate: async () => 'not-json-at-all',
    }
    const user = userEvent.setup()
    renderPanel(provider)

    await screen.findByPlaceholderText(/Describe the flow/i)
    await user.type(screen.getByPlaceholderText(/Describe the flow/i), 'Make a flow')
    await user.click(screen.getByRole('button', { name: 'Send' }))

    expect(await screen.findByText(/not valid JSON/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
  })

  it('shows a diff preview for a replace reply and applies it', async () => {
    await seedAiReady('u1', 'test-key')
    const provider: LLMProvider = {
      id: 'mock',
      listModels: async () => ['mock'],
      generate: async () =>
        JSON.stringify({
          type: 'replace',
          summary: 'Created a start and end',
          diagram: {
            title: 'Simple flow',
            nodes: [
              { id: 'n1', kind: 'start', label: 'Start', position: { x: 0, y: 0 } },
              { id: 'n2', kind: 'end', label: 'End', position: { x: 0, y: 120 } },
            ],
            edges: [{ id: 'e1', source: 'n1', target: 'n2' }],
          },
        }),
    }
    const user = userEvent.setup()
    renderPanel(provider)

    await screen.findByPlaceholderText(/Describe the flow/i)
    await user.type(screen.getByPlaceholderText(/Describe the flow/i), 'Create a simple flow')
    await user.click(screen.getByRole('button', { name: 'Send' }))

    expect(await screen.findByText('Created a start and end')).toBeInTheDocument()
    expect(screen.getByText(/\+3 added|\+2 added/i)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Apply changes' }))
    await waitFor(() => {
      const diagram = useEditorStore.getState().diagram
      expect(diagram?.title).toBe('Simple flow')
      expect(diagram?.nodes).toHaveLength(2)
    })
  })
})
