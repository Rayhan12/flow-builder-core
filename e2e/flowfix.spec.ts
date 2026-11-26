import { expect, test, type Page } from '@playwright/test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildMerchantOnboardingFixture } from '../shared/layout/merchantOnboardingFixture.ts'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const RUNS = path.join(ROOT, '.cursor-runs')

type StoreApi = {
  getState: () => {
    diagram: {
      nodes: Array<{
        id: string
        kind: string
        label?: string
        position: { x: number; y: number }
        size?: { w: number; h: number }
      }>
      edges: Array<{
        id: string
        source: string
        target: string
        sourceHandle?: string
        waypoints?: Array<{ x: number; y: number; routed?: boolean }>
      }>
      title: string
      schemaVersion: number
    } | null
    replaceDiagramContent: (d: unknown) => void
    applyNodeLayout: (nodes: unknown[], edges?: unknown[]) => void
    moveNodes: (
      updates: Array<{ id: string; position: { x: number; y: number } }>,
      record: boolean,
    ) => void
  }
}

async function signUpAndOpenEditor(page: Page) {
  const email = `flowfix-${Date.now()}@example.com`
  await page.goto('/signup')
  await page.getByLabel('Name (optional)').fill('Flowfix')
  await page.getByLabel('Email').fill(email)
  await page.locator('input[name="password"]').fill('test-pass-123')
  await page.getByRole('button', { name: 'Create account' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toContainText(/Good (morning|afternoon|evening)/, {
    timeout: 15_000,
  })
  await page.locator('.project-card-link', { hasText: 'My first project' }).click({ timeout: 15_000 })
  await page.getByRole('button', { name: 'New diagram' }).first().click()
  await page.waitForURL(/\/p\/[^/]+\/d\//, { timeout: 15_000 })
  await expect(page.getByTestId('properties-panel')).toBeVisible({ timeout: 15_000 })
}

test.describe('Flow fix routing and conflicts', () => {
  test('merchant fixture: before/after screenshots and conflict badge', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await signUpAndOpenEditor(page)

    const fixture = buildMerchantOnboardingFixture()

    // Before: legacy bus routing (shared channels) for visual comparison.
    await page.evaluate(async (payload) => {
      window.__FB_DISABLE_AUTO_LAYOUT__ = true
      const s = (window as unknown as { __FLOW_BUILDER_STORE__?: StoreApi }).__FLOW_BUILDER_STORE__!
      const layout = window.__FLOW_BUILDER_LAYOUT__
      if (!layout) throw new Error('layout helpers missing')
      const current = s.getState().diagram
      if (!current) throw new Error('no diagram')
      const laid = await layout.layoutDiagram(payload.nodes as never, payload.edges as never, {
        direction: 'DOWN',
        legacyEdgeRouting: true,
        skipConflictResolve: true,
      } as never)
      s.getState().replaceDiagramContent({
        ...current,
        title: payload.title,
        nodes: laid.nodes,
        edges: laid.edges,
      })
    }, fixture)
    await page.waitForTimeout(500)
    await page.evaluate(() => {
      window.dispatchEvent(new Event('flow-builder:auto-arrange'))
    }).catch(() => undefined)
    await page.waitForTimeout(200)
    await page.screenshot({ path: path.join(RUNS, 'flowfix-before.png'), fullPage: false })

    // After: current routing (independent channels + conflict resolve).
    await page.evaluate(async () => {
      window.__FB_DISABLE_AUTO_LAYOUT__ = false
      const s = (window as unknown as { __FLOW_BUILDER_STORE__?: StoreApi }).__FLOW_BUILDER_STORE__!
      const layout = window.__FLOW_BUILDER_LAYOUT__!
      const d = s.getState().diagram!
      const laid = await layout.layoutDiagram(d.nodes as never, d.edges as never, 'DOWN')
      s.getState().applyNodeLayout(laid.nodes, laid.edges)
    })
    await page.waitForTimeout(400)
    // Stamp measured sizes and resolve again so margin checks use real boxes.
    await page.evaluate(() => {
      const s = (window as unknown as { __FLOW_BUILDER_STORE__?: StoreApi }).__FLOW_BUILDER_STORE__!
      const layout = window.__FLOW_BUILDER_LAYOUT__!
      const d = s.getState().diagram!
      const withSizes = d.nodes.map((n) => {
        const el = document.querySelector(`.react-flow__node[data-id="${n.id}"]`) as HTMLElement | null
        const r = el?.getBoundingClientRect()
        if (!r || r.width < 8 || r.height < 8) return n
        // Convert screen size through zoom so store units match flow coords.
        const zoom =
          (document.querySelector('.react-flow__viewport') as HTMLElement | null)?.style
            .transform?.match(/scale\(([^)]+)\)/)?.[1] ?? '1'
        const z = Number(zoom) || 1
        return { ...n, size: { w: r.width / z, h: r.height / z } }
      })
      const fixed = layout.resolveConflicts(withSizes, d.edges, { direction: 'DOWN' })
      s.getState().applyNodeLayout(fixed.nodes as never, fixed.edges as never)
    })
    await page.waitForTimeout(400)

    // Store-position overlap check with margin (real measured sizes when present).
    const overlapCount = await page.evaluate(() => {
      const s = (window as unknown as { __FLOW_BUILDER_STORE__?: StoreApi }).__FLOW_BUILDER_STORE__!
      const nodes = (s.getState().diagram?.nodes ?? []).filter((n) => n.kind !== 'sticky')
      const margin = 24
      const boxes = nodes.map((n) => {
        const el = document.querySelector(`.react-flow__node[data-id="${n.id}"]`) as HTMLElement | null
        const r = el?.getBoundingClientRect()
        const w = n.size?.w ?? r?.width ?? 256
        const h = n.size?.h ?? r?.height ?? 96
        return {
          id: n.id,
          x: n.position.x - margin,
          y: n.position.y - margin,
          w: w + margin * 2,
          h: h + margin * 2,
        }
      })
      let hits = 0
      for (let i = 0; i < boxes.length; i++) {
        for (let j = i + 1; j < boxes.length; j++) {
          const a = boxes[i]
          const b = boxes[j]
          const overlap =
            a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
          if (overlap) hits += 1
        }
      }
      return hits
    })
    expect(overlapCount).toBe(0)

    // Long labels visible in full (no ellipsis truncation).
    await expect(page.getByText('Account Declined by admin', { exact: true })).toBeVisible()
    await expect(
      page.getByText('Suspended State pending investigation', { exact: true }),
    ).toBeVisible()

    await page.screenshot({ path: path.join(RUNS, 'flowfix-after.png'), fullPage: false })

    // Force overlaps so the conflict badge appears, then Fix layout.
    await page.evaluate(() => {
      const s = (window as unknown as { __FLOW_BUILDER_STORE__?: StoreApi }).__FLOW_BUILDER_STORE__!
      const d = s.getState().diagram!
      const a = d.nodes.find((n) => n.id === 'decl2')
      const b = d.nodes.find((n) => n.id === 'susp')
      if (!a || !b) throw new Error('end nodes missing')
      s.getState().moveNodes(
        [
          { id: 'decl2', position: { x: 100, y: 100 } },
          { id: 'susp', position: { x: 110, y: 110 } },
        ],
        true,
      )
    })
    await page.waitForTimeout(200)
    await expect(page.getByTestId('layout-conflict-badge')).toBeVisible({ timeout: 5_000 })
    await page.screenshot({ path: path.join(RUNS, 'flowfix-conflict-badge.png'), fullPage: false })
    await page.getByTestId('fix-layout').click()
    await page.waitForTimeout(300)
    await expect(page.getByTestId('layout-conflict-badge')).toHaveCount(0)
  })
})
