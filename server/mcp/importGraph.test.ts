import { readFileSync, existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// Vercel runs api/mcp.ts as native Node ESM, which cannot resolve
// extensionless or directory imports. Walk every relative import reachable
// from the function and require an explicit file extension.
const root = resolve(__dirname, '../..')
const importRe = /(?:import|export)\s[^'"]*?from\s+['"](\.{1,2}\/[^'"]+)['"]/g

function walk(file: string, seen: Set<string>, bad: string[]): void {
  if (seen.has(file)) return
  seen.add(file)
  const src = readFileSync(file, 'utf8')
  for (const m of src.matchAll(importRe)) {
    const spec = m[1]
    const stmt = m[0]
    if (/^import\s+type\s/.test(stmt) || /^export\s+type\s/.test(stmt)) continue
    if (!/\.(ts|js|mjs|json)$/.test(spec)) {
      bad.push(`${file.replace(root + '/', '')}: ${spec}`)
      continue
    }
    const target = resolve(dirname(file), spec)
    if (existsSync(target)) walk(target, seen, bad)
  }
}

describe('MCP function import graph', () => {
  it('uses explicit extensions on every runtime relative import', () => {
    const bad: string[] = []
    const seen = new Set<string>()
    walk(resolve(root, 'api/mcp.ts'), seen, bad)
    expect(seen.size).toBeGreaterThan(5)
    expect(bad).toEqual([])
  })
})
