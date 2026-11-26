import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { saveConnections } from '../providers/connections'
import { computeKeyFingerprint, saveModelCache } from '../providers/modelCache'
import type { AiConnection } from '../providers/types'
import { ModelSwitcher } from './ModelSwitcher'

afterEach(() => {
  localStorage.clear()
  vi.restoreAllMocks()
})

describe('ModelSwitcher', () => {
  it('renders only enabled stored models and makes zero fetch calls on mount and open', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const conn: AiConnection = {
      id: 'c1',
      provider: 'openai',
      label: 'OpenAI',
      apiKey: 'sk-test',
      createdAt: 1,
    }
    const fp = await computeKeyFingerprint(conn)
    const withFp = { ...conn, keyFingerprint: fp }
    saveConnections('u1', [withFp])
    saveModelCache('u1', {
      connectionId: 'c1',
      keyFingerprint: fp,
      lastCheckedAt: Date.now(),
      enabledModelIds: ['gpt-4o-mini'],
      models: [
        { id: 'gpt-4o-mini', usable: true, supportsTools: true, checkedAt: 1 },
        { id: 'gpt-4o', usable: true, supportsTools: true, checkedAt: 1 },
        { id: 'o1-mini', usable: false, reason: 'no_access', supportsTools: false, checkedAt: 1 },
      ],
    })

    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <ModelSwitcher uid="u1" />
      </MemoryRouter>,
    )

    expect(fetchMock).not.toHaveBeenCalled()
    await user.click(screen.getByTestId('ai-model-switcher').querySelector('button')!)
    expect(fetchMock).not.toHaveBeenCalled()

    expect(screen.getByRole('option', { name: /gpt-4o-mini/i })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: /^gpt-4o$/i })).not.toBeInTheDocument()
    expect(screen.queryByText('o1-mini')).not.toBeInTheDocument()
  })

  it('shows set up models link when there is a key but no enabled models', async () => {
    const conn: AiConnection = {
      id: 'c1',
      provider: 'openai',
      label: 'OpenAI',
      apiKey: 'sk-test',
      createdAt: 1,
    }
    const fp = await computeKeyFingerprint(conn)
    saveConnections('u1', [{ ...conn, keyFingerprint: fp }])

    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <ModelSwitcher uid="u1" />
      </MemoryRouter>,
    )
    await user.click(screen.getByTestId('ai-model-switcher').querySelector('button')!)
    expect(screen.getByTestId('ai-model-setup-link')).toHaveTextContent(/Set up models in Settings/i)
  })
})
