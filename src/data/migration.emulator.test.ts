/**
 * Runs only when the Firestore emulator is up.
 */
import { createUserWithEmailAndPassword, signOut } from 'firebase/auth'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { auth, db } from '../lib/firebase'
import { CURRENT_SCHEMA_VERSION, createEmptyDiagramDoc } from '../schema'
import {
  getDiagram,
  legacyDiagramRef,
  listLegacyDiagrams,
  listDiagrams,
} from './diagrams'
import { migrateLegacyDiagramsIfNeeded } from './migration'
import { listProjects } from './projects'

const run = Boolean(process.env.FIRESTORE_EMULATOR_HOST && process.env.FIREBASE_AUTH_EMULATOR_HOST)

describe.skipIf(!run)('Legacy diagram migration (emulator)', () => {
  let uid: string

  beforeAll(async () => {
    const cred = await createUserWithEmailAndPassword(
      auth,
      `m9-migrate-${Date.now()}@example.com`,
      'test-pass-123',
    )
    uid = cred.user.uid
    await setDoc(doc(db, 'users', uid), {
      email: cred.user.email,
      settings: { theme: 'light', aiProvider: 'gemini', aiModel: 'gemini-2.5-flash' },
    })
  })

  afterAll(async () => {
    await signOut(auth)
  })

  it('copies legacy diagrams into a default project and is idempotent', async () => {
    const legacyId = 'd_legacy01'
    const diagramDoc = createEmptyDiagramDoc('Legacy flow')
    await setDoc(legacyDiagramRef(uid, legacyId), {
      ownerId: uid,
      title: diagramDoc.title,
      schemaVersion: CURRENT_SCHEMA_VERSION,
      doc: diagramDoc,
      nodeCount: 0,
      revision: 0,
    })

    await setDoc(doc(db, 'users', uid, 'diagrams', legacyId, 'messages', 'm1'), {
      role: 'user',
      text: 'hello',
      applied: false,
    })

    await setDoc(doc(db, 'users', uid, 'diagrams', legacyId, 'versions', 'v1'), {
      doc: diagramDoc,
      reason: 'manual',
    })

    expect(await listLegacyDiagrams(uid)).toHaveLength(1)

    await migrateLegacyDiagramsIfNeeded(uid)

    const projects = await listProjects(uid)
    const defaultProject = projects.find((p) => p.name === 'My first project')
    expect(defaultProject).toBeTruthy()

    const migrated = await getDiagram(uid, defaultProject!.id, legacyId)
    expect(migrated?.title).toBe('Legacy flow')
    expect(await listLegacyDiagrams(uid)).toHaveLength(0)

    const msgSnap = await getDoc(
      doc(db, 'users', uid, 'projects', defaultProject!.id, 'diagrams', legacyId, 'messages', 'm1'),
    )
    expect(msgSnap.exists()).toBe(true)

    await migrateLegacyDiagramsIfNeeded(uid)
    expect(await listDiagrams(uid, defaultProject!.id)).toHaveLength(1)
  }, 20_000)
})