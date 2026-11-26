/**
 * Port of .cursor-runs/live/geom.mjs canvasGeometry for Playwright e2e.
 * Inspects titles only for truncation (ellipsis / scrollHeight > clientHeight).
 */
import type { Page } from '@playwright/test'

export type GeometryDiagram = {
  nodes: Array<{ id: string; kind?: string; parentId?: string; label?: string }>
  edges: Array<{
    id: string
    source: string
    target: string
    sourceHandle?: string
    label?: string
  }>
}

export type GeometryIssues = {
  overlaps: string[]
  through: string[]
  shared: string[]
  missingEdges: string[]
  truncated: string[]
  labelHits: string[]
  midMarkers: string[]
}

export type GeometryReport = {
  nodeCount: number
  edgeCount: number
  issues: GeometryIssues
}

export async function canvasGeometry(page: Page, diagram: GeometryDiagram): Promise<GeometryReport> {
  return page.evaluate((d) => {
    const nodes = [...document.querySelectorAll('.react-flow__node')].map((el) => {
      const html = el as HTMLElement
      const m =
        /translate\(([-\d.]+)px,\s*([-\d.]+)px\)/.exec(html.style.transform) ||
        ([0, '0', '0'] as unknown as RegExpExecArray)
      const id = html.getAttribute('data-id') ?? ''
      const titleEl = html.querySelector('.flow-node-label') as HTMLElement | null
      let truncated = false
      if (titleEl) {
        const style = window.getComputedStyle(titleEl)
        const clamp = style.webkitLineClamp
        const ellipsisActive =
          style.textOverflow === 'ellipsis' ||
          (clamp !== '' && clamp !== 'none')
        truncated =
          (ellipsisActive &&
            (titleEl.scrollWidth > titleEl.clientWidth + 1 ||
              titleEl.scrollHeight > titleEl.clientHeight + 2)) ||
          titleEl.scrollHeight > titleEl.clientHeight + 2
      }
      const meta = d.nodes.find((n) => n.id === id)
      return {
        id,
        x: Number(m[1]),
        y: Number(m[2]),
        w: html.offsetWidth,
        h: html.offsetHeight,
        kind: meta?.kind,
        parent: meta?.parentId,
        truncated,
        label: titleEl?.textContent ?? meta?.label ?? '',
      }
    })
    const byId = Object.fromEntries(nodes.map((n) => [n.id, n]))

    const edges: Array<{
      id: string
      source: string
      target: string
      sh: string
      pts: Array<[number, number]>
      missing?: boolean
      markerOk?: boolean
    }> = []
    for (const e of d.edges) {
      const g = document.querySelector(`[data-testid="rf__edge-${e.id}"]`)
      const p =
        (g?.querySelector('path.react-flow__edge-path') as SVGPathElement | null) ||
        (g?.querySelector('path') as SVGPathElement | null)
      if (!p) {
        edges.push({ id: e.id, source: e.source, target: e.target, sh: '', pts: [], missing: true })
        continue
      }
      const L = p.getTotalLength()
      const pts: Array<[number, number]> = []
      for (let s = 0; s <= L; s += 4) {
        const q = p.getPointAtLength(s)
        pts.push([q.x, q.y])
      }
      // Markers must only appear at path ends (React Flow puts marker-end on the path).
      const markerEnd = p.getAttribute('marker-end')
      const markerStart = p.getAttribute('marker-start')
      const markerMid = p.getAttribute('marker-mid')
      edges.push({
        id: e.id,
        source: e.source,
        target: e.target,
        sh: e.sourceHandle || '',
        pts,
        markerOk: !markerMid && (Boolean(markerEnd) || markerEnd === null),
        missing: false,
      })
      void markerStart
    }

    const issues: GeometryIssues = {
      overlaps: [],
      through: [],
      shared: [],
      missingEdges: edges.filter((e) => e.missing).map((e) => e.id),
      truncated: nodes.filter((n) => n.truncated).map((n) => `${n.id}: ${n.label}`),
      labelHits: [],
      midMarkers: edges.filter((e) => e.markerOk === false).map((e) => e.id),
    }

    const isGroup = (n: (typeof nodes)[0]) => n.kind === 'group' || n.kind === 'section'
    const flat = nodes.filter((n) => !isGroup(n))
    for (let i = 0; i < flat.length; i++) {
      for (let j = i + 1; j < flat.length; j++) {
        const a = flat[i]
        const b = flat[j]
        if (a.parent || b.parent) continue
        if (a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h) {
          issues.overlaps.push(`${a.id}~${b.id}`)
        }
      }
    }

    for (const e of edges) {
      if (e.missing) continue
      for (const n of flat) {
        if (n.id === e.source || n.id === e.target || n.parent) continue
        const hit = e.pts.filter(
          ([x, y]) => x > n.x + 4 && x < n.x + n.w - 4 && y > n.y + 4 && y < n.y + n.h - 4,
        ).length
        if (hit >= 2) issues.through.push(`${e.id} through ${n.id} (${hit} pts)`)
      }
    }

    const real = edges.filter((e) => !e.missing)
    for (let i = 0; i < real.length; i++) {
      for (let j = i + 1; j < real.length; j++) {
        const a = real[i]
        const b = real[j]
        // Same source+handle may share a stub; different handles must diverge.
        if (a.source === b.source && a.sh === b.sh) continue
        const tgt = b.target === a.target ? byId[a.target] : null
        const src = a.source === b.source ? byId[a.source] : null
        let run = 0
        let best = 0
        for (const [x, y] of a.pts) {
          // Ignore fan-out near a shared source (branch chips) and converge near a shared target.
          if (
            src &&
            x > src.x - 8 &&
            x < src.x + src.w + 8 &&
            y > src.y - 8 &&
            y < src.y + src.h + 48
          ) {
            run = 0
            continue
          }
          if (
            tgt &&
            Math.abs(x - (tgt.x + tgt.w / 2)) < tgt.w &&
            y > tgt.y - 40 &&
            y < tgt.y + tgt.h + 40
          ) {
            run = 0
            continue
          }
          const near = b.pts.some(([u, v]) => Math.abs(u - x) < 2 && Math.abs(v - y) < 2)
          run = near ? run + 1 : 0
          best = Math.max(best, run)
        }
        if (best >= 5) issues.shared.push(`${a.id}/${b.id} share ~${best * 4}px`)
      }
    }

    // Edge labels must not cover node interiors (compare centres in screen space).
    for (const label of document.querySelectorAll('[data-testid="edge-label"]')) {
      const lr = (label as HTMLElement).getBoundingClientRect()
      const lcx = lr.left + lr.width / 2
      const lcy = lr.top + lr.height / 2
      for (const n of flat) {
        if (n.parent) continue
        const el = document.querySelector(
          `.react-flow__node[data-id="${n.id}"]`,
        ) as HTMLElement | null
        if (!el) continue
        const nr = el.getBoundingClientRect()
        // Require the label centre to sit clearly inside the card (8px inset).
        if (
          lcx > nr.left + 8 &&
          lcx < nr.right - 8 &&
          lcy > nr.top + 8 &&
          lcy < nr.bottom - 8
        ) {
          issues.labelHits.push(`label~${n.id}`)
        }
      }
    }

    return { nodeCount: nodes.length, edgeCount: real.length, issues }
  }, diagram)
}
