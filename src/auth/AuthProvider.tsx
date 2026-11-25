import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
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
    const unsub = onAuthStateChanged(auth, (next) => {
      setUser(next)
      setLoading(false)
      if (next) {
        void runPostSignIn(next)
      }
    })
    return unsub
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

  const signOut = useCallback(async () => {
    await firebaseSignOut(auth)
  }, [])

  const value = useMemo(
    () => ({ user, loading, migrating, signIn, signUp, signOut }),
    [user, loading, migrating, signIn, signUp, signOut],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}