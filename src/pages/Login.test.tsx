import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { LoginPage } from './Login'
import { ThemeProvider } from '../theme/ThemeProvider'

const signIn = vi.fn()
const signInWithGoogle = vi.fn()
const resetPassword = vi.fn()

vi.mock('../auth/useAuth', () => ({
  useAuth: () => ({
    user: null,
    loading: false,
    signIn,
    signUp: vi.fn(),
    signOut: vi.fn(),
    signInWithGoogle,
    resetPassword,
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
    signInWithGoogle.mockReset()
    resetPassword.mockReset()
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

  it('toggles password visibility', async () => {
    const user = userEvent.setup()
    renderLogin()

    const password = screen.getByLabelText('Password')
    expect(password).toHaveAttribute('type', 'password')

    await user.click(screen.getByRole('button', { name: 'Show password' }))
    expect(password).toHaveAttribute('type', 'text')

    await user.click(screen.getByRole('button', { name: 'Hide password' }))
    expect(password).toHaveAttribute('type', 'password')
  })

  it('sends a password reset email', async () => {
    const user = userEvent.setup()
    resetPassword.mockResolvedValue(undefined)
    renderLogin()

    await user.type(screen.getByLabelText('Email'), 'demo@example.com')
    await user.click(screen.getByRole('button', { name: 'Forgot password?' }))

    await waitFor(() => {
      expect(resetPassword).toHaveBeenCalledWith('demo@example.com')
    })
    expect(await screen.findByRole('status')).toHaveTextContent(/reset email sent/i)
  })

  it('renders the split layout shell', () => {
    renderLogin()
    expect(screen.getByTestId('auth-split')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Continue with Google' })).toBeInTheDocument()
  })
})
