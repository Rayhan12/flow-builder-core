import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { LoginPage } from './Login'
import { ThemeProvider } from '../theme/ThemeProvider'

const signIn = vi.fn()

vi.mock('../auth/useAuth', () => ({
  useAuth: () => ({
    user: null,
    loading: false,
    signIn,
    signUp: vi.fn(),
    signOut: vi.fn(),
  }),
}))

function renderLogin() {
  return render(
    <ThemeProvider>
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>
    </ThemeProvider>,
  )
}

describe('LoginPage', () => {
  beforeEach(() => {
    signIn.mockReset()
  })

  it('submits email and password', async () => {
    const user = userEvent.setup()
    signIn.mockResolvedValue(undefined)
    renderLogin()

    await user.type(screen.getByLabelText('Email'), 'demo@example.com')
    await user.type(screen.getByLabelText('Password'), 'secret12')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    await waitFor(() => {
      expect(signIn).toHaveBeenCalledWith('demo@example.com', 'secret12')
    })
  })

  it('shows a friendly error when sign in fails', async () => {
    const user = userEvent.setup()
    signIn.mockRejectedValue({ code: 'auth/invalid-credential' })
    renderLogin()

    await user.type(screen.getByLabelText('Email'), 'demo@example.com')
    await user.type(screen.getByLabelText('Password'), 'bad')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/incorrect/i)
  })
})
