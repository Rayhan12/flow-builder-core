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
import { createEmptyDiagram } from '../schema'
import {
  createDiagram,
  deleteDiagram,
  duplicateDiagram,
  getDiagram,
  listDiagrams,
  renameDiagram,
  saveDiagram,
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

  it(
    'creates, lists, renames, duplicates and deletes diagrams',
    async () => {
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
    },
    15_000,
  )

  it('saves diagram body and reloads the same nodes and edges', async () => {
    const created = await createDiagram(uid, 'Editor save flow')
    const diagram = createEmptyDiagram(created.id, 'Editor save flow')
    diagram.nodes = [
      {
        id: 'n_start',
        kind: 'start',
        label: 'Apply',
        color: 'green',
        position: { x: 0, y: 0 },
        data: {},
      },
      {
        id: 'n_decision',
        kind: 'decision',
        label: 'Credit check',
        color: 'amber',
        position: { x: 0, y: 120 },
        data: {
          branches: [
            { id: 'yes', label: 'Yes', color: 'green' },
            { id: 'no', label: 'No', color: 'red' },
          ],
        },
      },
      {
        id: 'n_end',
        kind: 'end',
        label: 'Approve',
        color: 'red',
        position: { x: 0, y: 260 },
        data: {},
      },
    ]
    diagram.edges = [
      { id: 'e1', source: 'n_start', target: 'n_decision' },
      {
        id: 'e2',
        source: 'n_decision',
        target: 'n_end',
        sourceHandle: 'yes',
        label: 'Yes',
        color: 'green',
      },
    ]

    const revision = await saveDiagram(uid, created.id, diagram, created.revision)
    expect(revision).toBe(created.revision + 1)

    const loaded = await getDiagram(uid, created.id)
    expect(loaded?.revision).toBe(revision)
    expect(loaded?.nodeCount).toBe(3)
    expect(loaded?.doc.nodes.map((n) => n.id)).toEqual(['n_start', 'n_decision', 'n_end'])
    expect(loaded?.doc.edges).toHaveLength(2)
    expect(loaded?.doc.edges[1]?.sourceHandle).toBe('yes')
    expect(loaded?.doc.nodes[1]?.kind).toBe('decision')

    await deleteDiagram(uid, created.id)
  })
})
