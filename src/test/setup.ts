import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// React Flow (auth preview, editor) needs layout observers in jsdom.
if (!globalThis.ResizeObserver) {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver
}

// useUpdateNodeInternals / edge path maths need DOMMatrixReadOnly.
if (typeof globalThis.DOMMatrixReadOnly !== 'function') {
  class DOMMatrixReadOnlyPolyfill {
    a = 1
    b = 0
    c = 0
    d = 1
    e = 0
    f = 0
    m11 = 1
    m12 = 0
    m21 = 0
    m22 = 1
    m41 = 0
    m42 = 0
    is2D = true
    isIdentity = true
    constructor(_init?: string | number[]) {}
    inverse() {
      return this
    }
    multiply() {
      return this
    }
    translate() {
      return this
    }
    scale() {
      return this
    }
    transformPoint(p?: { x?: number; y?: number }) {
      return { x: p?.x ?? 0, y: p?.y ?? 0, z: 0, w: 1 }
    }
  }
  globalThis.DOMMatrixReadOnly =
    DOMMatrixReadOnlyPolyfill as unknown as typeof DOMMatrixReadOnly
}

afterEach(() => {
  cleanup()
})
