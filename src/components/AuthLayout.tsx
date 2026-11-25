import {
  FolderKanban,
  GitBranch,
  KeyRound,
  Moon,
  Plug,
  Sparkles,
  Sun,
} from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { LogoWordmark } from '../assets/brand'
import { useTheme } from '../theme/useTheme'
import { AuthDiagramPreview } from './auth/AuthDiagramPreview'

type AuthLayoutProps = {
  title: string
  subtitle: string
  children: ReactNode
}

const CAPABILITIES = [
  {
    icon: GitBranch,
    text: 'Build decision-flow diagrams',
  },
  {
    icon: Sparkles,
    text: 'AI-assisted creation with your own Gemini key',
  },
  {
    icon: FolderKanban,
    text: 'Projects that organise your diagrams',
  },
  {
    icon: Plug,
    text: 'MCP access so your AI agent can build in your projects',
  },
] as const

export function AuthLayout({ title, subtitle, children }: AuthLayoutProps) {
  const { theme, toggleTheme } = useTheme()

  return (
    <div className="auth-split" data-testid="auth-split">
      <aside className="auth-showcase" aria-label="Product overview">
        <div className="auth-showcase-inner">
          <Link to="/login" className="auth-showcase-brand">
            <LogoWordmark markSize={28} />
          </Link>

          <div className="auth-showcase-hero">
            <p className="section-eyebrow">Decision flows</p>
            <h2 className="auth-showcase-title">Design flows that think with you</h2>
            <p className="auth-showcase-lead">
              A calm canvas for rules, decisions and integrations, ready for you and your AI agents.
            </p>
          </div>

          <AuthDiagramPreview />

          <ul className="auth-capability-list">
            {CAPABILITIES.map(({ icon: Icon, text }) => (
              <li key={text} className="auth-capability">
                <span className="auth-capability-icon" aria-hidden>
                  <Icon size={16} strokeWidth={2} />
                </span>
                <span>{text}</span>
              </li>
            ))}
          </ul>

          <p className="auth-showcase-foot">
            <KeyRound size={14} aria-hidden />
            Your Gemini key stays in your browser
          </p>
        </div>
      </aside>

      <div className="auth-form-pane">
        <button
          type="button"
          className="btn btn-ghost btn-icon theme-float"
          onClick={toggleTheme}
          aria-label={theme === 'light' ? 'Switch to dark theme' : 'Switch to light theme'}
        >
          {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
        </button>

        <div className="auth-card">
          <Link to="/login" className="brand brand-auth auth-form-brand">
            <LogoWordmark markSize={24} />
          </Link>
          <p className="section-eyebrow">Welcome</p>
          <h1>{title}</h1>
          <p className="auth-subtitle">{subtitle}</p>
          {children}
        </div>
      </div>
    </div>
  )
}
