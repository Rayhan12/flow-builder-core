import {
  CURRENT_SCHEMA_VERSION,
  DiagramDocSchema,
  type DiagramDoc,
} from './diagram'

/**
 * Upgrade steps keyed by the version they start from.
 * `migrations[1]` would turn a v1 doc into v2, and so on.
 * With only v1 in the wild, the map is empty.
 */
export type DiagramMigration = (doc: Record<string, unknown>) => Record<string, unknown>

export const migrations: Record<number, DiagramMigration> = {
  // Example for later: 1: (doc) => ({ ...doc, schemaVersion: 2, ... })
}

function readSchemaVersion(raw: unknown): number {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Diagram doc must be an object')
  }
  const version = (raw as { schemaVersion?: unknown }).schemaVersion
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    throw new Error('Diagram doc is missing a valid schemaVersion')
  }
  return version
}

/**
 * Run migrations until the doc matches CURRENT_SCHEMA_VERSION, then zod-parse.
 */
export function migrateDiagramDoc(raw: unknown): DiagramDoc {
  let version = readSchemaVersion(raw)
  let current: Record<string, unknown> = {
    ...(raw as Record<string, unknown>),
  }

  if (version > CURRENT_SCHEMA_VERSION) {
    throw new Error(
      `Diagram schemaVersion ${version} is newer than this app (${CURRENT_SCHEMA_VERSION})`,
    )
  }

  while (version < CURRENT_SCHEMA_VERSION) {
    const step = migrations[version]
    if (!step) {
      throw new Error(`No migration from schemaVersion ${version}`)
    }
    current = step(current)
    version = readSchemaVersion(current)
  }

  return DiagramDocSchema.parse(current)
}
