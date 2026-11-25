/**
 * Runs only when Firebase Auth emulator env is present
 * (set automatically by `firebase emulators:exec`).
 *
 * Example:
 * firebase emulators:exec --only auth,firestore --project flow-builder-core "npm test"
 */
import { initializeApp, deleteApp, type FirebaseApp } from 'firebase/app'
import {
  connectAuthEmulator,
  createUserWithEmailAndPassword,
  getAuth,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const emulatorHost = process.env.FIREBASE_AUTH_EMULATOR_HOST
const run = !!emulatorHost

describe.skipIf(!run)('Auth emulator', () => {
  let app: FirebaseApp

  beforeAll(() => {
    app = initializeApp({
      apiKey: 'demo-api-key',
      projectId: 'flow-builder-core',
      authDomain: 'flow-builder-core.firebaseapp.com',
    })
    const auth = getAuth(app)
    connectAuthEmulator(auth, `http://${emulatorHost}`, { disableWarnings: true })
  })

  afterAll(async () => {
    await deleteApp(app)
  })

  it('signs up and signs in with email and password', async () => {
    const auth = getAuth(app)
    const email = `m1-${Date.now()}@example.com`
    const password = 'test-pass-123'

    const created = await createUserWithEmailAndPassword(auth, email, password)
    expect(created.user.email).toBe(email)

    await signOut(auth)
    expect(auth.currentUser).toBeNull()

    const signedIn = await signInWithEmailAndPassword(auth, email, password)
    expect(signedIn.user.uid).toBe(created.user.uid)
  })
})
