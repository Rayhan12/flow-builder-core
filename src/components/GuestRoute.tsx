import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'

/** Redirects signed-in users away from login/signup. */
export function GuestRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="page-loading" role="status">
        Loading...
      </div>
    )
  }

  if (user) {
    return <Navigate to="/" replace />
  }

  return children
}
