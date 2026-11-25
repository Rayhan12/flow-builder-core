/**
 * Runs only when the Firestore emulator is up.
 */
import { createUserWithEmailAndPassword, signOut } from 'firebase/auth'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { auth } from '../lib/firebase'
import { createDiagram, listDiagrams } from './diagrams'
import {
  createProject,
  deleteProject,
  ensureDefaultProject,
  getProject,
  listProjects,
  renameProject,
} from './projects'

const run = Boolean(process.env.FIRESTORE_EMULATOR_HOST && process.env.FIREBASE_AUTH_EMULATOR_HOST)

describe.skipIf(!run)('Projects repo (emulator)', () => {
  let uid: string

  beforeAll(async () => {
    const cred = await createUserWithEmailAndPassword(
      auth,
      `m9-projects-${Date.now()}@example.com`,
      'test-pass-123',
    )
    uid = cred.user.uid
  })

  afterAll(async () => {
    await signOut(auth)
  })

  it('creates, lists, renames and deletes a project', async () => {
    const created = await createProject(uid, { name: 'Acme flows', color: 'blue', icon: 'briefcase' })
    expect(created.name).toBe('Acme flows')

    const list = await listProjects(uid)
    expect(list.some((p) => p.id === created.id)).toBe(true)

    await renameProject(uid, created.id, 'Acme 2.0')
    const updated = await getProject(uid, created.id)
    expect(updated?.name).toBe('Acme 2.0')

    const diagram = await createDiagram(uid, created.id, 'One flow')
    expect(diagram.id).toBeTruthy()

    const emptyProject = await createProject(uid, { name: 'Empty' })
    await deleteProject(uid, emptyProject.id)

    await deleteProject(uid, created.id)
    expect(await getProject(uid, created.id)).toBeNull()
    expect(await listDiagrams(uid, created.id)).toEqual([])
  })

  it('ensureDefaultProject creates exactly one default when none exist', async () => {
    const fresh = await createUserWithEmailAndPassword(
      auth,
      `m9-default-${Date.now()}@example.com`,
      'test-pass-123',
    )
    const freshUid = fresh.user.uid
    const first = await ensureDefaultProject(freshUid)
    expect(first.name).toBe('My first project')
    const second = await ensureDefaultProject(freshUid)
    expect(second.id).toBe(first.id)
    await signOut(auth)
  })
})