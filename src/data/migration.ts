import { doc, getDoc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore'
import { db } from '../lib/firebase'
import {
  copyLegacyDiagramToProject,
  deleteLegacyDiagram,
  listLegacyDiagrams,
} from './diagrams'
import {
  DEFAULT_PROJECT_NAME,
  createProject,
  defaultProjectColor,
  defaultProjectIcon,
  ensureDefaultProject,
  getProject,
  listProjects,
  syncProjectDiagramCount,
  type Project,
} from './projects'

const DEFAULT_USER_SETTINGS = {
  theme: 'light',
  aiProvider: 'gemini',
  aiModel: 'gemini-2.5-flash',
}

export type LegacyMigrationState = {
  legacyDiagramsDone?: boolean
}

/** Ensure profile doc exists (e.g. after Google sign-in) and default project is present. */
export async function ensureUserAndDefaultProject(
  uid: string,
  profile?: { email?: string | null; displayName?: string | null },
): Promise<Project> {
  const userRef = doc(db, 'users', uid)
  const snap = await getDoc(userRef)
  if (!snap.exists()) {
    await setDoc(userRef, {
      email: profile?.email ?? null,
      displayName: profile?.displayName ?? null,
      createdAt: serverTimestamp(),
      settings: DEFAULT_USER_SETTINGS,
    })
  }
  return ensureDefaultProject(uid)
}

async function findOrCreateMigrationProject(uid: string): Promise<Project> {
  const projects = await listProjects(uid)
  const named = projects.find((p) => p.name === DEFAULT_PROJECT_NAME)
  if (named) {
    const full = await getProject(uid, named.id)
    if (full) return full
  }
  return createProject(uid, {
    name: DEFAULT_PROJECT_NAME,
    color: defaultProjectColor(uid),
    icon: defaultProjectIcon(uid),
  })
}

export async function migrateLegacyDiagramsIfNeeded(uid: string): Promise<void> {
  const userRef = doc(db, 'users', uid)
  const userSnap = await getDoc(userRef)
  const migration = (userSnap.data()?.migration ?? {}) as LegacyMigrationState
  if (migration.legacyDiagramsDone === true) {
    const legacyLeft = await listLegacyDiagrams(uid)
    if (legacyLeft.length === 0) return
  }

  const legacy = await listLegacyDiagrams(uid)
  if (legacy.length === 0) {
    if (!migration.legacyDiagramsDone) {
      await updateDoc(userRef, {
        'migration.legacyDiagramsDone': true,
      })
    }
    return
  }

  const project = await findOrCreateMigrationProject(uid)

  for (const item of legacy) {
    await copyLegacyDiagramToProject(uid, project.id, item.id)
    await deleteLegacyDiagram(uid, item.id)
  }

  await syncProjectDiagramCount(uid, project.id)

  await updateDoc(userRef, {
    'migration.legacyDiagramsDone': true,
  })
}