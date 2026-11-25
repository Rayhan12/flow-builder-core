import { Moon, Sun, Workflow } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useTheme } from '../theme/useTheme'

type AuthLayoutProps = {
  title: string
  subtitle: string
  children: ReactNode
}

export function AuthLayout({ title, subtitle, children }: AuthLayoutProps) {
  const { theme, toggleTheme } = useTheme()

  return (
    <div className="auth-page">
      <div className="auth-page-glow" aria-hidden />
      <button
        type="button"
        className="btn btn-ghost btn-icon theme-float"
        onClick={toggleTheme}
        aria-label={theme === 'light' ? 'Switch to dark theme' : 'Switch to light theme'}
      >
        {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
      </button>

      <div className="auth-card">
        <Link to="/login" className="brand brand-auth">
          <span className="brand-tile" aria-hidden>
            <Workflow size={18} strokeWidth={2} />
          </span>
          <span className="brand-name">Flow Builder</span>
        </Link>
        <p className="section-eyebrow">Welcome</p>
        <h1>{title}</h1>
        <p className="auth-subtitle">{subtitle}</p>
        {children}
      </div>
    </div>
  )
}
