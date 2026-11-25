import {
  CURRENT_SCHEMA_VERSION,
  parseDiagram,
  parseDiagramDoc,
  type Diagram,
  type DiagramDoc,
} from '../schema'
import { migrateDiagramDoc } from '../schema/migrations'

export type ImportResult =
  | { ok: true; diagram: Diagram; source: 'diagram' | 'doc' }
  | { ok: false; error: string }

/** Stable JSON stringify: sorted object keys at every level for exact round trips. */
export function stableStringify(value: unknown, space = 2): string {
  return `${JSON.stringify(sortKeys(value), null, space)}\n`
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys)
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>
    const sorted: Record<string, unknown> = {}
    for (const key of Object.keys(obj).sort()) {
      const v = obj[key]
      if (v === undefined) continue
      sorted[key] = sortKeys(v)
    }
    return sorted
  }
  return value
}

export function exportDiagramJson(diagram: Diagram): string {
  return stableStringify(diagram)
}

export function exportDiagramDocJson(diagram: Diagram): string {
  const { id: _id, ...doc } = diagram
  return stableStringify(doc)
}

export function parseImportedJson(text: string, fallbackId: string): ImportResult {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return { ok: false, error: 'File is not valid JSON' }
  }

  if (!raw || typeof raw !== 'object') {
    return { ok: false, error: 'JSON must be an object' }
  }

  const record = raw as Record<string, unknown>

  try {
    if (typeof record.id === 'string' && record.id.length > 0) {
      const migrated = migrateDiagramDoc({
        ...record,
        schemaVersion: record.schemaVersion ?? CURRENT_SCHEMA_VERSION,
      })
      const diagram = parseDiagram({ ...migrated, id: record.id })
      return { ok: true, diagram, source: 'diagram' }
    }

    const migrated = migrateDiagramDoc({
      ...record,
      schemaVersion: record.schemaVersion ?? CURRENT_SCHEMA_VERSION,
    })
    const doc = parseDiagramDoc(migrated)
    return {
      ok: true,
      diagram: { ...doc, id: fallbackId },
      source: 'doc',
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Invalid diagram JSON'
    return { ok: false, error: message }
  }
}

/** Apply imported content onto the current diagram id (keeps Firestore id). */
export function mergeImportedDiagram(currentId: string, imported: Diagram): Diagram {
  return {
    ...imported,
    id: currentId,
  }
}

export function downloadJsonFile(filename: string, contents: string): void {
  const blob = new Blob([contents], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function diagramFilename(title: string): string {
  const slug = title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
  return `${slug || 'diagram'}.json`
}

export type { DiagramDoc }
