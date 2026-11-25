import { Eye, EyeOff } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import { authErrorMessage } from '../auth/authErrors'
import { AuthLayout } from '../components/AuthLayout'
import { GoogleMark } from '../components/auth/GoogleMark'

export function SignupPage() {
  const { signUp, signInWithGoogle } = useAuth()
  const navigate = useNavigate()

  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)

    if (password.length < 6) {
      setError('Password must be at least 6 characters.')
      return
    }

    setSubmitting(true)
    try {
      await signUp(email, password, displayName)
      navigate('/', { replace: true })
    } catch (err) {
      setError(authErrorMessage(err))
    } finally {
      setSubmitting(false)
    }
  }

  async function onGoogle() {
    setError(null)
    setGoogleLoading(true)
    try {
      await signInWithGoogle()
      navigate('/', { replace: true })
    } catch (err) {
      setError(authErrorMessage(err))
    } finally {
      setGoogleLoading(false)
    }
  }

  const busy = submitting || googleLoading

  return (
    <AuthLayout
      title="Create account"
      subtitle="Sign up to save and edit your flows."
    >
      <form className="auth-form" onSubmit={(e) => void onSubmit(e)} noValidate>
        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}

        <label className="field">
          <span>Name (optional)</span>
          <input
            type="text"
            name="displayName"
            autoComplete="name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Your name"
          />
        </label>

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
          <label htmlFor="signup-password">Password</label>
          <div className="field-password">
            <input
              id="signup-password"
              type={showPassword ? 'text' : 'password'}
              name="password"
              autoComplete="new-password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 6 characters"
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

        <button type="submit" className="btn btn-primary" disabled={busy}>
          {submitting ? 'Creating account...' : 'Create account'}
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
        Already have an account? <Link to="/login">Sign in</Link>
      </p>
    </AuthLayout>
  )
}
