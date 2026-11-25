import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { forgetApiKey, getApiKey } from '../ai/keyStorage'
import { ThemeProvider } from '../theme/ThemeProvider'
import { SettingsPage } from './Settings'

vi.mock('../auth/useAuth', () => ({
  useAuth: () => ({
    user: { uid: 'u1', email: 'demo@example.com' },
    loading: false,
    signIn: vi.fn(),
    signUp: vi.fn(),
    signOut: vi.fn(),
  }),
}))

vi.mock('../data/settings', () => ({
  DEFAULT_USER_SETTINGS: {
    theme: 'light',
    aiProvider: 'gemini',
    aiModel: 'gemini-2.5-flash',
  },
  GEMINI_MODELS: ['gemini-2.5-flash', 'gemini-2.5-pro'],
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

function renderSettings() {
  return render(
    <ThemeProvider>
      <MemoryRouter>
        <SettingsPage />
      </MemoryRouter>
    </ThemeProvider>,
  )
}

describe('SettingsPage', () => {
  beforeEach(() => {
    localStorage.clear()
    forgetApiKey('u1')
  })

  it('saves an API key in the browser only', async () => {
    const user = userEvent.setup()
    renderSettings()

    await screen.findByRole('heading', { name: 'Settings' })
    await user.type(screen.getByPlaceholderText(/Paste your Gemini API key/i), 'browser-only-key')
    await user.click(screen.getByRole('button', { name: 'Save key' }))

    await waitFor(() => {
      expect(getApiKey('u1')).toBe('browser-only-key')
    })
    expect(screen.getByText(/saved in this browser/i)).toBeInTheDocument()
    expect(screen.getByText(/Your key stays in this browser/i)).toBeInTheDocument()
  })

  it('forgets the key', async () => {
    const user = userEvent.setup()
    const { setApiKey } = await import('../ai/keyStorage')
    setApiKey('u1', 'to-forget')
    renderSettings()

    await screen.findByRole('button', { name: 'Forget key' })
    await user.click(screen.getByRole('button', { name: 'Forget key' }))
    expect(getApiKey('u1')).toBeNull()
  })
})
