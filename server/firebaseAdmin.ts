/**
 * firebase-admin bootstrap for the MCP serverless function.
 * Credentials come from env only; never commit a key file.
 */
import { applicationDefault, cert, getApps, initializeApp, type App } from 'firebase-admin/app'
import { getFirestore, type Firestore } from 'firebase-admin/firestore'

const PROJECT_ID =
  process.env.FIREBASE_PROJECT_ID?.trim() ||
  process.env.GCLOUD_PROJECT?.trim() ||
  'flow-builder-core'

function parseServiceAccount(raw: string): Record<string, unknown> {
  const trimmed = raw.trim()
  if (!trimmed) throw new Error('Service account env var is empty')
  try {
    return JSON.parse(trimmed) as Record<string, unknown>
  } catch {
    // Fall through to base64.
  }
  try {
    const decoded = Buffer.from(trimmed, 'base64').toString('utf8')
    return JSON.parse(decoded) as Record<string, unknown>
  } catch {
    throw new Error(
      'FIREBASE_SERVICE_ACCOUNT_KEY / FIREBASE_SERVICE_ACCOUNT must be raw JSON or base64 JSON',
    )
  }
}

function resolveCredentialJson(): Record<string, unknown> | null {
  const key = process.env.FIREBASE_SERVICE_ACCOUNT_KEY?.trim()
  if (key) return parseServiceAccount(key)
  const legacy = process.env.FIREBASE_SERVICE_ACCOUNT?.trim()
  if (legacy) return parseServiceAccount(legacy)
  return null
}

let cachedApp: App | null = null
let cachedDb: Firestore | null = null

/** Reset caches between tests. */
export function resetFirebaseAdminForTests(): void {
  cachedApp = null
  cachedDb = null
}

export function getAdminApp(): App {
  if (cachedApp) return cachedApp
  if (getApps().length > 0) {
    cachedApp = getApps()[0]!
    return cachedApp
  }

  const usingEmulator = Boolean(process.env.FIRESTORE_EMULATOR_HOST?.trim())
  if (usingEmulator) {
    cachedApp = initializeApp({ projectId: PROJECT_ID })
    return cachedApp
  }

  const json = resolveCredentialJson()
  if (json) {
    cachedApp = initializeApp({
      credential: cert(json as Parameters<typeof cert>[0]),
      projectId: (typeof json.project_id === 'string' && json.project_id) || PROJECT_ID,
    })
    return cachedApp
  }

  // Last resort (local ADC). Prefer explicit env in production.
  cachedApp = initializeApp({
    credential: applicationDefault(),
    projectId: PROJECT_ID,
  })
  return cachedApp
}

export function getAdminDb(): Firestore {
  if (cachedDb) return cachedDb
  cachedDb = getFirestore(getAdminApp())
  return cachedDb
}

export function getFirebaseProjectId(): string {
  return PROJECT_ID
}
