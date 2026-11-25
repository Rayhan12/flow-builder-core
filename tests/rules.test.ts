/**
 * Firestore security rules tests.
 * Run via: firebase emulators:exec --only auth,firestore --project flow-builder-core "npm test"
 */
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing'
import { doc, getDoc, setDoc, deleteDoc, updateDoc } from 'firebase/firestore'
import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

const run = Boolean(process.env.FIRESTORE_EMULATOR_HOST)

// Separate project id so clearFirestore does not wipe parallel app tests.
const PROJECT_ID = 'flow-builder-rules'
const OWNER = 'owner-uid'
const OTHER = 'other-uid'

const diagramPayload = {
  ownerId: OWNER,
  title: 'Rules test diagram',
  schemaVersion: 1,
  doc: {
    schemaVersion: 1,
    title: 'Rules test diagram',
    nodes: [],
    edges: [],
    groups: [],
    viewport: { x: 0, y: 0, zoom: 1 },
    theme: { palette: 'default' },
  },
  nodeCount: 0,
  revision: 0,
}

describe.skipIf(!run)('Firestore rules', () => {
  let env: RulesTestEnvironment

  beforeAll(async () => {
    const hostPort = String(process.env.FIRESTORE_EMULATOR_HOST)
    const [host, port] = hostPort.split(':')
    env = await initializeTestEnvironment({
      projectId: PROJECT_ID,
      firestore: {
        rules: readFileSync('firestore.rules', 'utf8'),
        host,
        port: Number(port),
      },
    })
  })

  afterAll(async () => {
    await env.cleanup()
  })

  beforeEach(async () => {
    await env.clearFirestore()
  })

  it('lets the owner create and read their diagram', async () => {
    const db = env.authenticatedContext(OWNER).firestore()
    const ref = doc(db, 'users', OWNER, 'diagrams', 'd1')
    await assertSucceeds(setDoc(ref, diagramPayload))
    const snap = await assertSucceeds(getDoc(ref))
    expect(snap.data()?.title).toBe('Rules test diagram')
  })

  it('blocks another user from reading or writing the diagram', async () => {
    await env.withSecurityRulesDisabled(async (context) => {
      const adminDb = context.firestore()
      await setDoc(doc(adminDb, 'users', OWNER, 'diagrams', 'd1'), diagramPayload)
    })

    const other = env.authenticatedContext(OTHER).firestore()
    await assertFails(getDoc(doc(other, 'users', OWNER, 'diagrams', 'd1')))
    await assertFails(
      setDoc(doc(other, 'users', OWNER, 'diagrams', 'd2'), {
        ...diagramPayload,
        ownerId: OWNER,
      }),
    )
    await assertFails(
      updateDoc(doc(other, 'users', OWNER, 'diagrams', 'd1'), { title: 'Hijacked' }),
    )
    await assertFails(deleteDoc(doc(other, 'users', OWNER, 'diagrams', 'd1')))
  })

  it('blocks signed-out users', async () => {
    await env.withSecurityRulesDisabled(async (context) => {
      const adminDb = context.firestore()
      await setDoc(doc(adminDb, 'users', OWNER, 'diagrams', 'd1'), diagramPayload)
    })

    const anon = env.unauthenticatedContext().firestore()
    await assertFails(getDoc(doc(anon, 'users', OWNER, 'diagrams', 'd1')))
    await assertFails(setDoc(doc(anon, 'users', OWNER, 'diagrams', 'd3'), diagramPayload))
  })

  it('rejects create when ownerId does not match the path uid', async () => {
    const db = env.authenticatedContext(OWNER).firestore()
    await assertFails(
      setDoc(doc(db, 'users', OWNER, 'diagrams', 'd-bad'), {
        ...diagramPayload,
        ownerId: OTHER,
      }),
    )
  })

  it('rejects create when title is longer than 200 characters', async () => {
    const db = env.authenticatedContext(OWNER).firestore()
    await assertFails(
      setDoc(doc(db, 'users', OWNER, 'diagrams', 'd-long'), {
        ...diagramPayload,
        title: 'x'.repeat(201),
      }),
    )
  })

  it('rejects create when schemaVersion is missing', async () => {
    const db = env.authenticatedContext(OWNER).firestore()
    const rest: Record<string, unknown> = { ...diagramPayload }
    delete rest.schemaVersion
    await assertFails(setDoc(doc(db, 'users', OWNER, 'diagrams', 'd-nosv'), rest))
  })

  it('lets the owner create and read a project-scoped diagram', async () => {
    const db = env.authenticatedContext(OWNER).firestore()
    await assertSucceeds(
      setDoc(doc(db, 'users', OWNER, 'projects', 'p1'), {
        name: 'Demo',
        color: 'teal',
        icon: 'folder',
        diagramCount: 0,
      }),
    )
    const ref = doc(db, 'users', OWNER, 'projects', 'p1', 'diagrams', 'd1')
    await assertSucceeds(setDoc(ref, diagramPayload))
    const snap = await assertSucceeds(getDoc(ref))
    expect(snap.data()?.title).toBe('Rules test diagram')
  })

  it('blocks another user from project paths', async () => {
    await env.withSecurityRulesDisabled(async (context) => {
      const adminDb = context.firestore()
      await setDoc(doc(adminDb, 'users', OWNER, 'projects', 'p1'), { name: 'X' })
      await setDoc(doc(adminDb, 'users', OWNER, 'projects', 'p1', 'diagrams', 'd1'), diagramPayload)
    })

    const other = env.authenticatedContext(OTHER).firestore()
    await assertFails(getDoc(doc(other, 'users', OWNER, 'projects', 'p1')))
    await assertFails(getDoc(doc(other, 'users', OWNER, 'projects', 'p1', 'diagrams', 'd1')))
    await assertFails(deleteDoc(doc(other, 'users', OWNER, 'projects', 'p1', 'diagrams', 'd1')))
  })

  it('lets the owner read and delete legacy diagrams', async () => {
    await env.withSecurityRulesDisabled(async (context) => {
      const adminDb = context.firestore()
      await setDoc(doc(adminDb, 'users', OWNER, 'diagrams', 'd-legacy'), diagramPayload)
    })

    const owner = env.authenticatedContext(OWNER).firestore()
    await assertSucceeds(getDoc(doc(owner, 'users', OWNER, 'diagrams', 'd-legacy')))
    await assertSucceeds(deleteDoc(doc(owner, 'users', OWNER, 'diagrams', 'd-legacy')))
  })

  it('lets the owner use agentChats and blocks other users', async () => {
    const owner = env.authenticatedContext(OWNER).firestore()
    const ref = doc(owner, 'users', OWNER, 'agentChats', 'c1')
    await assertSucceeds(setDoc(ref, { title: 'Draft', createdAt: new Date() }))
    await assertSucceeds(getDoc(ref))

    const other = env.authenticatedContext(OTHER).firestore()
    await assertFails(getDoc(doc(other, 'users', OWNER, 'agentChats', 'c1')))
    await assertFails(setDoc(doc(other, 'users', OWNER, 'agentChats', 'c2'), { title: 'Nope' }))
  })

  it('lets the owner use agentChats messages and blocks other users', async () => {
    const owner = env.authenticatedContext(OWNER).firestore()
    const ref = doc(owner, 'users', OWNER, 'agentChats', 'c1', 'messages', 'm1')
    await assertSucceeds(setDoc(ref, { role: 'user', text: 'hi', createdAt: new Date() }))
    await assertSucceeds(getDoc(ref))

    const other = env.authenticatedContext(OTHER).firestore()
    await assertFails(getDoc(doc(other, 'users', OWNER, 'agentChats', 'c1', 'messages', 'm1')))
    await assertFails(
      setDoc(doc(other, 'users', OWNER, 'agentChats', 'c1', 'messages', 'm2'), { text: 'no' }),
    )
  })
})
