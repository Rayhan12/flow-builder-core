import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { LogoMark } from '../assets/brand'
import { useAuth } from '../auth/useAuth'

/** Redirects signed-in users away from login/signup. */
export function GuestRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="page-loading" role="status">
        <LogoMark size={32} title="" className="page-loading-mark" />
        <span>Loading...</span>
      </div>
    )
  }

  if (user) {
    return <Navigate to="/" replace />
  }

  return children
}
