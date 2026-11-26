import { describe, expect, it } from 'vitest'
import {
  dropPositionFromFlowPoint,
  encodePalettePayload,
  isPaletteDrag,
  PALETTE_MIME,
  PALETTE_MIME_TEXT,
  parsePalettePayload,
  readPaletteDragKind,
  setPaletteDragData,
} from './paletteDrop'

function mockDataTransfer(): DataTransfer {
  const store = new Map<string, string>()
  return {
    dropEffect: 'none',
    effectAllowed: 'uninitialized',
    files: [] as unknown as FileList,
    items: [] as unknown as DataTransferItemList,
    types: [],
    clearData(format?: string) {
      if (format) store.delete(format)
      else store.clear()
      ;(this as { types: string[] }).types = [...store.keys()]
    },
    getData(format: string) {
      return store.get(format) ?? ''
    },
    setData(format: string, data: string) {
      store.set(format, data)
      ;(this as { types: string[] }).types = [...store.keys()]
    },
    setDragImage() {},
  } as DataTransfer
}

describe('paletteDrop', () => {
  it('centres and snaps drop position to the 16px grid', () => {
    expect(dropPositionFromFlowPoint({ x: 100, y: 100 })).toEqual({ x: -32, y: 48 })
    expect(dropPositionFromFlowPoint({ x: 400, y: 300 })).toEqual({ x: 272, y: 256 })
    expect(dropPositionFromFlowPoint({ x: 400, y: 300 }, { snap: false })).toEqual({
      x: 272,
      y: 252,
    })
  })

  it('reads kind from custom MIME or text fallback', () => {
    const dt = mockDataTransfer()
    setPaletteDragData(dt, 'decision')
    expect(dt.getData(PALETTE_MIME)).toBe('decision')
    expect(dt.getData(PALETTE_MIME_TEXT)).toBe('decision')
    expect(dt.effectAllowed).toBe('copyMove')
    expect(readPaletteDragKind(dt)).toBe('decision')
    expect(isPaletteDrag(dt)).toBe(true)

    const textOnly = mockDataTransfer()
    textOnly.setData(PALETTE_MIME_TEXT, 'step')
    expect(readPaletteDragKind(textOnly)).toBe('step')
  })

  it('encodes and parses shape palette payloads', () => {
    expect(encodePalettePayload({ kind: 'shape', shape: 'hexagon' })).toBe('shape:hexagon')
    expect(parsePalettePayload('shape:diamond')).toEqual({ kind: 'shape', shape: 'diamond' })
    expect(parsePalettePayload('loop')).toEqual({ kind: 'loop' })
    expect(parsePalettePayload('shape:nope')).toBeNull()

    const dt = mockDataTransfer()
    setPaletteDragData(dt, { kind: 'shape', shape: 'cylinder' })
    expect(readPaletteDragKind(dt)).toBe('shape:cylinder')
  })
})
