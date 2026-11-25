import { Eye, EyeOff } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import { authErrorMessage } from '../auth/authErrors'
import { AuthLayout } from '../components/AuthLayout'
import { GoogleMark } from '../components/auth/GoogleMark'

export function LoginPage() {
  const { signIn, signInWithGoogle, resetPassword } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const from =
    (location.state as { from?: string } | null)?.from &&
    (location.state as { from: string }).from !== '/login'
      ? (location.state as { from: string }).from
      : '/'

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [resetting, setResetting] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setInfo(null)
    setSubmitting(true)
    try {
      await signIn(email, password)
      navigate(from, { replace: true })
    } catch (err) {
      setError(authErrorMessage(err))
    } finally {
      setSubmitting(false)
    }
  }

  async function onGoogle() {
    setError(null)
    setInfo(null)
    setGoogleLoading(true)
    try {
      await signInWithGoogle()
      navigate(from, { replace: true })
    } catch (err) {
      setError(authErrorMessage(err))
    } finally {
      setGoogleLoading(false)
    }
  }

  async function onForgotPassword() {
    setError(null)
    setInfo(null)
    if (!email.trim()) {
      setError('Enter your email address first.')
      return
    }
    setResetting(true)
    try {
      await resetPassword(email)
      setInfo('Password reset email sent. Check your inbox.')
    } catch (err) {
      setError(authErrorMessage(err))
    } finally {
      setResetting(false)
    }
  }

  const busy = submitting || googleLoading || resetting

  return (
    <AuthLayout
      title="Sign in"
      subtitle="Open your projects and keep building."
    >
      <form className="auth-form" onSubmit={(e) => void onSubmit(e)} noValidate>
        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}
        {info ? (
          <p className="form-success" role="status">
            {info}
          </p>
        ) : null}

        <label className="field">
          <span>Email</span>
          <input
            type="email"
            name="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
          />
        </label>

        <div className="field">
          <label htmlFor="login-password">Password</label>
          <div className="field-password">
            <input
              id="login-password"
              type={showPassword ? 'text' : 'password'}
              name="password"
              autoComplete="current-password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Your password"
            />
            <button
              type="button"
              className="btn btn-ghost btn-icon field-password-toggle"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </div>

        <div className="auth-form-row">
          <button
            type="button"
            className="auth-link-btn"
            onClick={() => void onForgotPassword()}
            disabled={busy}
          >
            {resetting ? 'Sending reset...' : 'Forgot password?'}
          </button>
        </div>

        <button type="submit" className="btn btn-primary" disabled={busy}>
          {submitting ? 'Signing in...' : 'Sign in'}
        </button>

        <div className="auth-divider" role="separator">
          <span>or</span>
        </div>

        <button
          type="button"
          className="btn btn-secondary auth-google-btn"
          onClick={() => void onGoogle()}
          disabled={busy}
        >
          <GoogleMark />
          {googleLoading ? 'Continuing...' : 'Continue with Google'}
        </button>
      </form>

      <p className="auth-footer">
        New here? <Link to="/signup">Create an account</Link>
      </p>
    </AuthLayout>
  )
}
