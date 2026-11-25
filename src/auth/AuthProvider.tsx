import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  getRedirectResult,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  signOut as firebaseSignOut,
  updateProfile,
  type User,
} from 'firebase/auth'
import { doc, serverTimestamp, setDoc } from 'firebase/firestore'
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { auth, db } from '../lib/firebase'
import { ensureUserAndDefaultProject, migrateLegacyDiagramsIfNeeded } from '../data/migration'
import { AuthContext } from './authContext'

const googleProvider = new GoogleAuthProvider()

const POPUP_FALLBACK_CODES = new Set([
  'auth/popup-blocked',
  'auth/cancelled-popup-request',
  'auth/operation-not-supported-in-environment',
])

function authErrorCode(error: unknown): string {
  if (error && typeof error === 'object' && 'code' in error) {
    return String((error as { code: unknown }).code)
  }
  return ''
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [migrating, setMigrating] = useState(false)

  const runPostSignIn = useCallback(async (next: User) => {
    setMigrating(true)
    try {
      await ensureUserAndDefaultProject(next.uid, {
        email: next.email,
        displayName: next.displayName,
      })
      await migrateLegacyDiagramsIfNeeded(next.uid)
    } catch (err) {
      console.error('Post sign-in setup failed', err)
    } finally {
      setMigrating(false)
    }
  }, [])

  useEffect(() => {
    let active = true

    void (async () => {
      try {
        const redirect = await getRedirectResult(auth)
        if (redirect?.user && active) {
          // onAuthStateChanged will also fire; post-sign-in runs there.
        }
      } catch (err) {
        console.error('Google redirect sign-in failed', err)
      }
    })()

    const unsub = onAuthStateChanged(auth, (next) => {
      setUser(next)
      setLoading(false)
      if (next) {
        void runPostSignIn(next)
      }
    })
    return () => {
      active = false
      unsub()
    }
  }, [runPostSignIn])

  const signIn = useCallback(async (email: string, password: string) => {
    await signInWithEmailAndPassword(auth, email.trim(), password)
  }, [])

  const signUp = useCallback(
    async (email: string, password: string, displayName?: string) => {
      const cred = await createUserWithEmailAndPassword(auth, email.trim(), password)
      const name = displayName?.trim()
      if (name) {
        await updateProfile(cred.user, { displayName: name })
      }
      await setDoc(doc(db, 'users', cred.user.uid), {
        email: cred.user.email,
        displayName: name || null,
        createdAt: serverTimestamp(),
        settings: {
          theme: 'light',
          aiProvider: 'gemini',
          aiModel: 'gemini-2.5-flash',
        },
      })
      await ensureUserAndDefaultProject(cred.user.uid, {
        email: cred.user.email,
        displayName: name || cred.user.displayName,
      })
    },
    [],
  )

  const signInWithGoogle = useCallback(async () => {
    try {
      await signInWithPopup(auth, googleProvider)
    } catch (err) {
      const code = authErrorCode(err)
      if (POPUP_FALLBACK_CODES.has(code)) {
        await signInWithRedirect(auth, googleProvider)
        return
      }
      throw err
    }
  }, [])

  const resetPassword = useCallback(async (email: string) => {
    await sendPasswordResetEmail(auth, email.trim())
  }, [])

  const signOut = useCallback(async () => {
    await firebaseSignOut(auth)
  }, [])

  const value = useMemo(
    () => ({
      user,
      loading,
      migrating,
      signIn,
      signUp,
      signInWithGoogle,
      resetPassword,
      signOut,
    }),
    [user, loading, migrating, signIn, signUp, signInWithGoogle, resetPassword, signOut],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
