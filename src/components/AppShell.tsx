import { Moon, Sun, Workflow } from 'lucide-react'
import { Link, Outlet } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import { useTheme } from '../theme/useTheme'

export function AppShell() {
  const { user, signOut } = useAuth()
  const { theme, toggleTheme } = useTheme()

  return (
    <div className="app-shell">
      <header className="app-header">
        <Link to="/" className="brand">
          <Workflow className="brand-icon" aria-hidden size={22} strokeWidth={2} />
          <span className="brand-name">Flow Builder</span>
        </Link>

        <div className="header-actions">
          {user?.email ? (
            <span className="user-email" title={user.email}>
              {user.email}
            </span>
          ) : null}
          <button
            type="button"
            className="btn btn-ghost btn-icon"
            onClick={toggleTheme}
            aria-label={theme === 'light' ? 'Switch to dark theme' : 'Switch to light theme'}
          >
            {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => void signOut()}>
            Sign out
          </button>
        </div>
      </header>
      <main className="app-main">
        <Outlet />
      </main>
    </div>
  )
}
