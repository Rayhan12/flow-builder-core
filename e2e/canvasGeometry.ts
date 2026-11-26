/**
 * Port of .cursor-runs/live/geom.mjs canvasGeometry for Playwright e2e.
 * Inspects titles only for truncation (ellipsis / scrollHeight > clientHeight).
 * FLOWFIX5: 8px inflate for through-node, 10px parallel gap, rounded corners, stroke.
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
  /** Coincident shared bus (same channel). */
  shared: string[]
  /** Parallel channels closer than PARALLEL_GAP with a long run. */
  parallelTight: string[]
  missingEdges: string[]
  truncated: string[]
  labelHits: string[]
  labelLabelHits: string[]
  midMarkers: string[]
  sharpCorners: string[]
  badStroke: string[]
}

export type GeometryReport = {
  nodeCount: number
  edgeCount: number
  issues: GeometryIssues
}

const THROUGH_INFLATE = 8
const PARALLEL_GAP = 10

export async function canvasGeometry(page: Page, diagram: GeometryDiagram): Promise<GeometryReport> {
  return page.evaluate(
    ({ d, THROUGH_INFLATE: inflate, PARALLEL_GAP: minGap }) => {
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
            style.textOverflow === 'ellipsis' || (clamp !== '' && clamp !== 'none')
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
        pathD?: string
        strokeW?: number
      }> = []
      for (const e of d.edges) {
        const g = document.querySelector(`[data-testid="rf__edge-${e.id}"]`)
        const p =
          (g?.querySelector('path.react-flow__edge-path') as SVGPathElement | null) ||
          (g?.querySelector('path') as SVGPathElement | null)
        if (!p) {
          edges.push({
            id: e.id,
            source: e.source,
            target: e.target,
            sh: '',
            pts: [],
            missing: true,
          })
          continue
        }
        const L = p.getTotalLength()
        const pts: Array<[number, number]> = []
        for (let s = 0; s <= L; s += 4) {
          const q = p.getPointAtLength(s)
          pts.push([q.x, q.y])
        }
        const markerEnd = p.getAttribute('marker-end')
        const markerMid = p.getAttribute('marker-mid')
        const sw = parseFloat(window.getComputedStyle(p).strokeWidth || '0')
        edges.push({
          id: e.id,
          source: e.source,
          target: e.target,
          sh: e.sourceHandle || '',
          pts,
          markerOk: !markerMid && (Boolean(markerEnd) || markerEnd === null),
          missing: false,
          pathD: p.getAttribute('d') ?? '',
          strokeW: sw,
        })
      }

      const issues: GeometryIssues = {
        overlaps: [],
        through: [],
        shared: [],
        parallelTight: [],
        missingEdges: edges.filter((e) => e.missing).map((e) => e.id),
        truncated: nodes.filter((n) => n.truncated).map((n) => `${n.id}: ${n.label}`),
        labelHits: [],
        labelLabelHits: [],
        midMarkers: edges.filter((e) => e.markerOk === false).map((e) => e.id),
        sharpCorners: [],
        badStroke: [],
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

      // Edge through card: inflate node box by THROUGH_INFLATE (hard failure).
      for (const e of edges) {
        if (e.missing) continue
        for (const n of flat) {
          if (n.id === e.source || n.id === e.target || n.parent) continue
          const left = n.x - inflate
          const right = n.x + n.w + inflate
          const top = n.y - inflate
          const bottom = n.y + n.h + inflate
          const hit = e.pts.filter(([x, y]) => x > left && x < right && y > top && y < bottom).length
          if (hit >= 2) issues.through.push(`${e.id} through ${n.id} (${hit} pts)`)
        }
      }

      const real = edges.filter((e) => !e.missing)
      for (let i = 0; i < real.length; i++) {
        for (let j = i + 1; j < real.length; j++) {
          const a = real[i]
          const b = real[j]
          if (a.source === b.source && a.sh === b.sh) continue
          // Sequential chain A→B→C: arrival and departure share the node axis, not a bus.
          if (a.target === b.source || b.target === a.source) continue
          const tgt = b.target === a.target ? byId[a.target] : null
          const src = a.source === b.source ? byId[a.source] : null
          let sharedRun = 0
          let parallelRun = 0
          let bestShared = 0
          let bestParallel = 0
          for (const [x, y] of a.pts) {
            if (
              src &&
              x > src.x - 8 &&
              x < src.x + src.w + 8 &&
              y > src.y - 8 &&
              y < src.y + src.h + 48
            ) {
              sharedRun = 0
              parallelRun = 0
              continue
            }
            if (
              tgt &&
              Math.abs(x - (tgt.x + tgt.w / 2)) < tgt.w &&
              y > tgt.y - 40 &&
              y < tgt.y + tgt.h + 40
            ) {
              sharedRun = 0
              parallelRun = 0
              continue
            }
            const hitShared = b.pts.some(
              ([u, v]) => Math.abs(u - x) < 2 && Math.abs(v - y) < 2,
            )
            const hitParallel = b.pts.some(([u, v]) => {
              const dx = Math.abs(u - x)
              const dy = Math.abs(v - y)
              return (
                (dx > 0.5 && dx < minGap && dy < 2) ||
                (dy > 0.5 && dy < minGap && dx < 2)
              )
            })
            sharedRun = hitShared ? sharedRun + 1 : 0
            parallelRun = hitParallel ? parallelRun + 1 : 0
            bestShared = Math.max(bestShared, sharedRun)
            bestParallel = Math.max(bestParallel, parallelRun)
          }
          if (bestShared >= 5) issues.shared.push(`${a.id}/${b.id} share ~${bestShared * 4}px`)
          if (bestParallel >= 10) {
            issues.parallelTight.push(`${a.id}/${b.id} parallel ~${bestParallel * 4}px`)
          }
        }
      }

      // Rounded corners: routed elbows should include Q (quadratic) at bends.
      for (const e of real) {
        const dAttr = e.pathD ?? ''
        const hasCurve = dAttr.includes('Q') || dAttr.includes('C') || dAttr.includes('A')
        let turns = 0
        for (let k = 2; k < e.pts.length; k++) {
          const [x0, y0] = e.pts[k - 2]
          const [x1, y1] = e.pts[k - 1]
          const [x2, y2] = e.pts[k]
          const dx1 = Math.abs(x1 - x0) > 2
          const dy1 = Math.abs(y1 - y0) > 2
          const dx2 = Math.abs(x2 - x1) > 2
          const dy2 = Math.abs(y2 - y1) > 2
          if ((dx1 && dy2) || (dy1 && dx2)) turns += 1
        }
        if (turns >= 1 && !hasCurve) issues.sharpCorners.push(e.id)
      }

      for (const e of real) {
        const sw = e.strokeW ?? 0
        // Default stroke is 1.5; allow hover/selected up to 2.5 without failing.
        if (sw > 0 && sw < 1.2) issues.badStroke.push(`${e.id}:${sw}`)
      }

      const labelEls = [...document.querySelectorAll('[data-testid="edge-label"]')] as HTMLElement[]
      for (const label of labelEls) {
        const lr = label.getBoundingClientRect()
        const lcx = lr.left + lr.width / 2
        const lcy = lr.top + lr.height / 2
        for (const n of flat) {
          if (n.parent) continue
          const el = document.querySelector(
            `.react-flow__node[data-id="${n.id}"]`,
          ) as HTMLElement | null
          if (!el) continue
          const nr = el.getBoundingClientRect()
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
      for (let i = 0; i < labelEls.length; i++) {
        for (let j = i + 1; j < labelEls.length; j++) {
          const a = labelEls[i].getBoundingClientRect()
          const b = labelEls[j].getBoundingClientRect()
          if (a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom) {
            issues.labelLabelHits.push(`label~label`)
          }
        }
      }

      return { nodeCount: nodes.length, edgeCount: real.length, issues }
    },
    { d: diagram, THROUGH_INFLATE, PARALLEL_GAP },
  )
}
