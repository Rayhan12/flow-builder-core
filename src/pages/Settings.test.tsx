import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

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

vi.mock('../data/settings', () => ({
  DEFAULT_USER_SETTINGS: {
    theme: 'light',
    aiProvider: 'gemini',
    aiModel: 'gemini-2.5-flash',
  },
  getUserSettings: vi.fn().mockResolvedValue({
    theme: 'light',
    aiProvider: 'gemini',
    aiModel: 'gemini-2.5-flash',
  }),
  updateUserSettings: vi.fn().mockImplementation(async (_uid: string, patch: { aiModel?: string }) => ({
    theme: 'light',
    aiProvider: 'gemini',
    aiModel: patch.aiModel ?? 'gemini-2.5-flash',
  })),
}))

vi.mock('../ai/providers/probe', () => ({
  listAndProbeModels: vi.fn().mockResolvedValue({
    connectionId: 'x',
    keyFingerprint: 'abcd1234abcd1234',
    lastCheckedAt: Date.now(),
    enabledModelIds: ['gemini-2.5-flash'],
    models: [
      {
        id: 'gemini-2.5-flash',
        usable: true,
        supportsTools: true,
        checkedAt: Date.now(),
      },
    ],
  }),
  recheckModel: vi.fn().mockResolvedValue({
    id: 'gemini-2.5-flash',
    usable: true,
    supportsTools: true,
    checkedAt: Date.now(),
  }),
}))

vi.mock('../data/mcpTokens', () => ({
  listMcpTokens: vi.fn().mockResolvedValue([]),
  createMcpToken: vi.fn(),
  revokeMcpToken: vi.fn(),
}))

describe('SettingsPage', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  async function renderSettings() {
    const { ThemeProvider } = await import('../theme/ThemeProvider')
    const { SettingsPage } = await import('./Settings')
    return render(
      <ThemeProvider>
        <MemoryRouter>
          <SettingsPage />
        </MemoryRouter>
      </ThemeProvider>,
    )
  }

  it('renders the AI providers section', async () => {
    await renderSettings()
    await screen.findByRole('heading', { name: 'Settings' })
    expect(screen.getByTestId('ai-providers-settings')).toBeInTheDocument()
    expect(screen.getByText(/Keys stay in this browser/i)).toBeInTheDocument()
    expect(screen.getByTestId('mcp-connect-section')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Connect your AI agent' })).toBeInTheDocument()
  })

  it('saves an AI provider connection in the browser only', async () => {
    const user = userEvent.setup()
    const { getApiKey, hasApiKey } = await import('../ai/keyStorage')
    const { listConnections } = await import('../ai/providers/connections')
    const probe = await import('../ai/providers/probe')
    await renderSettings()

    await screen.findByTestId('ai-add-connection')
    await user.type(screen.getByPlaceholderText(/^Paste API key$/i), 'browser-only-key')
    await user.click(screen.getByRole('button', { name: 'Save connection' }))

    await waitFor(() => {
      expect(listConnections('u1').length).toBeGreaterThan(0)
      expect(hasApiKey('u1')).toBe(true)
      expect(getApiKey('u1')).toBe('browser-only-key')
    })
    expect(probe.listAndProbeModels).toHaveBeenCalled()
  })

  it('forgets a connection', async () => {
    const user = userEvent.setup()
    const { listConnections, upsertConnection } = await import('../ai/providers/connections')
    upsertConnection('u1', { provider: 'gemini', label: 'Gemini', apiKey: 'to-forget' })
    await renderSettings()

    await screen.findByRole('button', { name: 'Forget' })
    await user.click(screen.getByRole('button', { name: 'Forget' }))
    expect(listConnections('u1')).toHaveLength(0)
  })
})
