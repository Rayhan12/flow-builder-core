import {
  CURRENT_SCHEMA_VERSION,
  DiagramDocSchema,
  type DiagramDoc,
} from './diagram'
import { matchFromLegacyCondition } from './conditions'

/**
 * Upgrade steps keyed by the version they start from.
 * `migrations[1]` turns a v1 doc into v2, and so on.
 */
export type DiagramMigration = (doc: Record<string, unknown>) => Record<string, unknown>

function migrateNodeV1ToV2(node: Record<string, unknown>): Record<string, unknown> {
  const kind = node.kind
  const data =
    node.data && typeof node.data === 'object'
      ? { ...(node.data as Record<string, unknown>) }
      : {}

  if (kind === 'rule' && Array.isArray(data.rules)) {
    data.rules = data.rules.map((raw, index) => {
      if (!raw || typeof raw !== 'object') return raw
      const rule = { ...(raw as Record<string, unknown>) }
      const condition = typeof rule.condition === 'string' ? rule.condition : ''
      if (!rule.match) {
        rule.match = matchFromLegacyCondition(condition)
      }
      if (!rule.id || typeof rule.id !== 'string') {
        rule.id = `rule_${index + 1}`
      }
      // Keep legacy condition string for older readers; structured match is canonical.
      return rule
    })
  }

  if (kind === 'decision' && Array.isArray(data.branches)) {
    if (data.mode !== 'switch' && data.mode !== 'branches') {
      data.mode = 'branches'
    }
    data.branches = data.branches.map((raw) => {
      if (!raw || typeof raw !== 'object') return raw
      const branch = { ...(raw as Record<string, unknown>) }
      if (
        !branch.match &&
        typeof branch.condition === 'string' &&
        branch.condition.trim()
      ) {
        branch.match = {
          combinator: 'and',
          conditions: [
            {
              field: branch.condition,
              operator: 'eq',
              value: '',
            },
          ],
        }
      }
      return branch
    })
  }

  return { ...node, data: Object.keys(data).length ? data : node.data }
}

function migrateV1ToV2(doc: Record<string, unknown>): Record<string, unknown> {
  const nodes = Array.isArray(doc.nodes)
    ? doc.nodes.map((n) =>
        n && typeof n === 'object'
          ? migrateNodeV1ToV2(n as Record<string, unknown>)
          : n,
      )
    : doc.nodes

  return {
    ...doc,
    schemaVersion: 2,
    nodes,
  }
}

export const migrations: Record<number, DiagramMigration> = {
  1: migrateV1ToV2,
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
