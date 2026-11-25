/**
 * Runs only when the Firestore emulator is up
 * (`firebase emulators:exec` sets FIRESTORE_EMULATOR_HOST).
 */
import {
  createUserWithEmailAndPassword,
  signOut,
} from 'firebase/auth'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { auth } from '../lib/firebase'
import {
  createDiagram,
  deleteDiagram,
  duplicateDiagram,
  getDiagram,
  listDiagrams,
  renameDiagram,
} from './diagrams'

const run = Boolean(process.env.FIRESTORE_EMULATOR_HOST && process.env.FIREBASE_AUTH_EMULATOR_HOST)

describe.skipIf(!run)('Diagrams repo (emulator)', () => {
  let uid: string

  beforeAll(async () => {
    const cred = await createUserWithEmailAndPassword(
      auth,
      `m2-repo-${Date.now()}@example.com`,
      'test-pass-123',
    )
    uid = cred.user.uid
  })

  afterAll(async () => {
    await signOut(auth)
  })

  it('creates, lists, renames, duplicates and deletes diagrams', async () => {
    const created = await createDiagram(uid, 'Loan flow')
    expect(created.title).toBe('Loan flow')
    expect(created.doc.nodes).toEqual([])

    let list = await listDiagrams(uid)
    expect(list.some((d) => d.id === created.id)).toBe(true)

    await renameDiagram(uid, created.id, 'Loan approval')
    const renamed = await getDiagram(uid, created.id)
    expect(renamed?.title).toBe('Loan approval')
    expect(renamed?.doc.title).toBe('Loan approval')

    const copy = await duplicateDiagram(uid, created.id)
    expect(copy.id).not.toBe(created.id)
    expect(copy.title).toBe('Copy of Loan approval')

    list = await listDiagrams(uid)
    expect(list.length).toBeGreaterThanOrEqual(2)

    await deleteDiagram(uid, copy.id)
    await deleteDiagram(uid, created.id)
    expect(await getDiagram(uid, created.id)).toBeNull()
  })
})
