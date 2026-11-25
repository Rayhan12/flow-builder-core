import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { LogoMark } from '../assets/brand'
import { useAuth } from '../auth/useAuth'

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div className="page-loading" role="status">
        <LogoMark size={32} title="" className="page-loading-mark" />
        <span>Loading...</span>
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  return children
}
