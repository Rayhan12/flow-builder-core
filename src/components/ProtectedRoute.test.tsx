import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { ProtectedRoute } from './ProtectedRoute'

vi.mock('../auth/useAuth', () => ({
  useAuth: vi.fn(),
}))

import { useAuth } from '../auth/useAuth'

const mockedUseAuth = vi.mocked(useAuth)

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route
          path="/private"
          element={
            <ProtectedRoute>
              <div>Private content</div>
            </ProtectedRoute>
          }
        />
        <Route path="/login" element={<div>Login page</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('ProtectedRoute', () => {
  it('shows loading while auth is resolving', () => {
    mockedUseAuth.mockReturnValue({
      user: null,
      loading: true,
      signIn: vi.fn(),
      signUp: vi.fn(),
      signOut: vi.fn(),
    })

    renderAt('/private')
    expect(screen.getByRole('status')).toHaveTextContent('Loading...')
  })

  it('redirects guests to login', () => {
    mockedUseAuth.mockReturnValue({
      user: null,
      loading: false,
      signIn: vi.fn(),
      signUp: vi.fn(),
      signOut: vi.fn(),
    })

    renderAt('/private')
    expect(screen.getByText('Login page')).toBeInTheDocument()
    expect(screen.queryByText('Private content')).not.toBeInTheDocument()
  })

  it('renders children when signed in', () => {
    mockedUseAuth.mockReturnValue({
      user: { uid: 'u1', email: 'a@b.com' } as never,
      loading: false,
      signIn: vi.fn(),
      signUp: vi.fn(),
      signOut: vi.fn(),
    })

    renderAt('/private')
    expect(screen.getByText('Private content')).toBeInTheDocument()
  })
})
