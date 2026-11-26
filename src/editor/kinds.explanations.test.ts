import { describe, expect, it } from 'vitest'
import type { NodeKind } from '../schema'
import { KIND_META, PALETTE_KINDS, SHAPE_TYPES } from './kinds'
import { shapeSvgContent } from './nodes/shapePaths'

const EM_DASH = '\u2014'

function serializeShapeGeometry(shapeId: (typeof SHAPE_TYPES)[number]['id']): string {
  const svg = shapeSvgContent(shapeId)
  return JSON.stringify({
    rect: svg.rect ?? null,
    ellipse: svg.ellipse ?? null,
    circle: svg.circle ?? null,
    path: svg.path ?? null,
    extra: svg.extra ?? null,
  })
}

describe('KIND_META explanations', () => {
  const kinds = Object.keys(KIND_META) as NodeKind[]

  it('covers every NodeKind', () => {
    expect(kinds.length).toBeGreaterThan(20)
    for (const kind of kinds) {
      expect(KIND_META[kind].kind).toBe(kind)
    }
  })

  for (const kind of kinds) {
    const meta = KIND_META[kind]

    it(`${kind}: hint under 60 chars without em dash`, () => {
      expect(meta.hint.length).toBeGreaterThan(0)
      expect(meta.hint.length).toBeLessThan(60)
      expect(meta.hint.includes(EM_DASH)).toBe(false)
    })

    it(`${kind}: description longer than 40 chars without em dash`, () => {
      expect(meta.description.length).toBeGreaterThan(40)
      expect(meta.description.includes(EM_DASH)).toBe(false)
    })

    it(`${kind}: example without em dash`, () => {
      expect(meta.example.length).toBeGreaterThan(0)
      expect(meta.example.includes(EM_DASH)).toBe(false)
    })
  }

  it('palette KIND_META defaultIcon strings are unique per kind', () => {
    const icons = PALETTE_KINDS.map((kind) => KIND_META[kind].defaultIcon)
    expect(icons.length).toBe(PALETTE_KINDS.length)
    expect(new Set(icons).size).toBe(icons.length)
  })
})

describe('SHAPE_TYPES geometry', () => {
  it('has nine entries with unique serialized path/geometry', () => {
    expect(SHAPE_TYPES).toHaveLength(9)
    const serialized = SHAPE_TYPES.map((s) => serializeShapeGeometry(s.id))
    expect(new Set(serialized).size).toBe(SHAPE_TYPES.length)
  })
})
