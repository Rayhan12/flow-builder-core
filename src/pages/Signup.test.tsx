import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SignupPage } from './Signup'
import { ThemeProvider } from '../theme/ThemeProvider'

const signUp = vi.fn()

vi.mock('../auth/useAuth', () => ({
  useAuth: () => ({
    user: null,
    loading: false,
    signIn: vi.fn(),
    signUp,
    signOut: vi.fn(),
    signInWithGoogle: vi.fn(),
    resetPassword: vi.fn(),
  }),
}))

function renderSignup() {
  return render(
    <ThemeProvider>
      <MemoryRouter>
        <SignupPage />
      </MemoryRouter>
    </ThemeProvider>,
  )
}

describe('SignupPage', () => {
  beforeEach(() => {
    signUp.mockReset()
  })

  it('creates an account with name, email and password', async () => {
    const user = userEvent.setup()
    signUp.mockResolvedValue(undefined)
    renderSignup()

    await user.type(screen.getByLabelText('Name (optional)'), 'Ray')
    await user.type(screen.getByLabelText('Email'), 'ray@example.com')
    await user.type(screen.getByLabelText('Password'), 'secret12')
    await user.click(screen.getByRole('button', { name: 'Create account' }))

    await waitFor(() => {
      expect(signUp).toHaveBeenCalledWith('ray@example.com', 'secret12', 'Ray')
    })
  })

  it('blocks short passwords before calling Firebase', async () => {
    const user = userEvent.setup()
    renderSignup()

    await user.type(screen.getByLabelText('Email'), 'ray@example.com')
    await user.type(screen.getByLabelText('Password'), '123')
    await user.click(screen.getByRole('button', { name: 'Create account' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/6 characters/i)
    expect(signUp).not.toHaveBeenCalled()
  })
})
