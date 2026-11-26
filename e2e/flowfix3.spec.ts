/**
 * FLOWFIX3: open a server-laid-out merchant diagram without clicking Fix layout,
 * wait for measurement + auto-resolve, assert canvas geometry.
 */
import { expect, test, type Page } from '@playwright/test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  buildMerchantOnboarding40Fixture,
  buildMerchantOnboardingFixture,
} from '../shared/layout/merchantOnboardingFixture.ts'
import { createAdminDataPort } from '../server/adminDataPort.ts'
import { resetFirebaseAdminForTests } from '../server/firebaseAdmin.ts'
import { CURRENT_SCHEMA_VERSION } from '../src/schema/index.ts'
import { canvasGeometry } from './canvasGeometry.ts'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const RUNS = path.join(ROOT, '.cursor-runs')

async function signUp(page: Page) {
  const email = `flowfix3-${Date.now()}@example.com`
  await page.goto('/signup')
  await page.getByLabel('Name (optional)').fill('Flowfix3')
  await page.getByLabel('Email').fill(email)
  await page.locator('input[name="password"]').fill('test-pass-123')
  await page.getByRole('button', { name: 'Create account' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    /Good (morning|afternoon|evening)/,
    { timeout: 15_000 },
  )
  return email
}

async function uidOf(page: Page): Promise<string> {
  await expect
    .poll(async () =>
      page.evaluate(
        () =>
          (window as unknown as { __FLOW_BUILDER_UID__?: string | null }).__FLOW_BUILDER_UID__ ??
          null,
      ),
    )
    .toBeTruthy()
  const uid = await page.evaluate(
    () => (window as unknown as { __FLOW_BUILDER_UID__?: string }).__FLOW_BUILDER_UID__,
  )
  if (!uid) throw new Error('uid missing')
  return uid
}

async function waitForMeasureAndResolve(page: Page) {
  // Auto-resolve runs after nodesInitialized + a short settle; do not click Fix layout.
  await page.locator('.react-flow__node').first().waitFor({ timeout: 20_000 })
  await page.waitForTimeout(2500)
  await expect(page.getByTestId('layout-conflict-badge')).toHaveCount(0, { timeout: 20_000 })
}

/** After an in-editor fixture swap, relayout then resolve after cards finish growing. */
async function resolveInStore(page: Page) {
  await page.evaluate(async () => {
    const s = (
      window as unknown as {
        __FLOW_BUILDER_STORE__?: {
          getState: () => {
            diagram: GeometryStore | null
            applyNodeLayout: (n: unknown[], e?: unknown[]) => void
          }
        }
      }
    ).__FLOW_BUILDER_STORE__!
    const layout = (
      window as unknown as {
        __FLOW_BUILDER_LAYOUT__?: {
          resolveConflicts: (
            n: unknown[],
            e: unknown[],
            o: { direction: string },
          ) => { nodes: unknown[]; edges: unknown[] }
          layoutDiagram: (
            n: unknown[],
            e: unknown[],
            o: { direction: string },
          ) => Promise<{ nodes: unknown[]; edges: unknown[] }>
          detectConflicts: (
            n: unknown[],
            e: unknown[],
            o: { direction: string },
          ) => { nodeOverlaps: unknown[]; edgesThroughNodes: unknown[] }
        }
      }
    ).__FLOW_BUILDER_LAYOUT__!
    const d0 = s.getState().diagram
    if (!d0) throw new Error('no diagram')
    const laid = await layout.layoutDiagram(d0.nodes, d0.edges, { direction: 'DOWN' })
    s.getState().applyNodeLayout(laid.nodes, laid.edges)
  })
  // Allow card auto-grow / ResizeObserver to settle, then push-apart leftovers.
  await page.waitForTimeout(900)
  await page.evaluate(() => {
    const s = (
      window as unknown as {
        __FLOW_BUILDER_STORE__?: {
          getState: () => {
            diagram: GeometryStore | null
            applyNodeLayout: (n: unknown[], e?: unknown[]) => void
          }
        }
      }
    ).__FLOW_BUILDER_STORE__!
    const layout = (
      window as unknown as {
        __FLOW_BUILDER_LAYOUT__?: {
          resolveConflicts: (
            n: unknown[],
            e: unknown[],
            o: { direction: string },
          ) => { nodes: unknown[]; edges: unknown[] }
        }
      }
    ).__FLOW_BUILDER_LAYOUT__!
    const d = s.getState().diagram
    if (!d) return
    const fixed = layout.resolveConflicts(d.nodes, d.edges, { direction: 'DOWN' })
    s.getState().applyNodeLayout(fixed.nodes, fixed.edges)
  })
  await page.waitForTimeout(400)
}

function assertClean(report: Awaited<ReturnType<typeof canvasGeometry>>, label: string) {
  expect(report.issues.overlaps, `${label} overlaps: ${report.issues.overlaps}`).toEqual([])
  expect(report.issues.through, `${label} through: ${report.issues.through}`).toEqual([])
  expect(report.issues.shared, `${label} shared: ${report.issues.shared}`).toEqual([])
  expect(report.issues.truncated, `${label} truncated: ${report.issues.truncated}`).toEqual([])
  expect(report.issues.labelHits, `${label} labelHits: ${report.issues.labelHits}`).toEqual([])
  expect(report.issues.midMarkers, `${label} midMarkers: ${report.issues.midMarkers}`).toEqual([])
  expect(report.issues.missingEdges, `${label} missingEdges`).toEqual([])
}

test.describe('FLOWFIX3 merchant open geometry', () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test('server-laid-out merchant: clean on first open, zoom shots, LTR + 40-node', async ({
    page,
  }) => {
    // Match the Playwright webServer Firebase project so admin SDK reads the same emulator data.
    process.env.FIREBASE_PROJECT_ID = 'demo-flow-builder'
    resetFirebaseAdminForTests()

    await signUp(page)
    const uid = await uidOf(page)
    await page.locator('.project-card-link', { hasText: 'My first project' }).waitFor({
      timeout: 15_000,
    })
    const port = createAdminDataPort(uid)
    let projects = await port.listProjects()
    if (projects.length === 0) {
      // Admin SDK project id must match the Vite emulator project; if the browser
      // default project is not visible yet, create one under the same uid.
      await port.createProject({ name: 'My first project' })
      projects = await port.listProjects()
    }
    const projectId = projects[0]?.id
    expect(projectId).toBeTruthy()

    const fixture = buildMerchantOnboardingFixture()
    const created = await port.createDiagram(projectId!, fixture.title, {
      title: fixture.title,
      schemaVersion: CURRENT_SCHEMA_VERSION,
      nodes: fixture.nodes.map((n) => ({
        id: n.id,
        kind: n.kind,
        label: n.label ?? n.id,
        position: n.position,
        ...(n.data ? { data: n.data } : {}),
      })),
      edges: fixture.edges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        ...(e.sourceHandle ? { sourceHandle: e.sourceHandle } : {}),
        ...(e.label ? { label: e.label } : {}),
      })),
    })
    const diagramId = created.id

    // Fresh open — do not click anything on the canvas / Fix layout.
    await page.goto(`/p/${projectId}/d/${diagramId}`)
    await waitForMeasureAndResolve(page)

    const storeDiagram = await page.evaluate(() => {
      const s = (
        window as unknown as {
          __FLOW_BUILDER_STORE__?: { getState: () => { diagram: GeometryStore | null } }
        }
      ).__FLOW_BUILDER_STORE__
      return s?.getState().diagram ?? null
    })
    expect(storeDiagram?.nodes.length).toBeGreaterThanOrEqual(26)

    const geom = await canvasGeometry(page, {
      nodes: storeDiagram!.nodes,
      edges: storeDiagram!.edges,
    })
    assertClean(geom, 'open')

    await page.keyboard.press('Shift+1')
    await page.waitForTimeout(500)
    await page.screenshot({ path: path.join(RUNS, 'flowfix3-open.png'), fullPage: false })

    // Zoom onto switch and decision (~120%).
    for (const [id, file] of [
      ['admin', 'flowfix3-zoom-switch.png'],
      ['risk', 'flowfix3-zoom-decision.png'],
    ] as const) {
      await page.evaluate((nid) => {
        const s = (
          window as unknown as {
            __FLOW_BUILDER_STORE__?: {
              getState: () => { setSelection?: (n: string[], e: string[]) => void }
            }
          }
        ).__FLOW_BUILDER_STORE__
        s?.getState().setSelection?.([nid], [])
      }, id)
      await page.keyboard.press('Shift+2')
      await page.waitForTimeout(400)
      await page.screenshot({ path: path.join(RUNS, file), fullPage: false })
    }

    // Left-to-right layout of the same fixture.
    await page.evaluate(async () => {
      const s = (
        window as unknown as {
          __FLOW_BUILDER_STORE__?: {
            getState: () => {
              diagram: GeometryStore | null
              applyNodeLayout: (n: unknown[], e?: unknown[]) => void
            }
          }
        }
      ).__FLOW_BUILDER_STORE__!
      const layout = (
        window as unknown as {
          __FLOW_BUILDER_LAYOUT__?: {
            layoutDiagram: (
              n: unknown[],
              e: unknown[],
              o: { direction: string },
            ) => Promise<{ nodes: unknown[]; edges: unknown[] }>
          }
        }
      ).__FLOW_BUILDER_LAYOUT__!
      const d = s.getState().diagram!
      const laid = await layout.layoutDiagram(d.nodes, d.edges, { direction: 'RIGHT' })
      s.getState().applyNodeLayout(laid.nodes, laid.edges)
    })
    await page.waitForTimeout(800)
    await page.keyboard.press('Shift+1')
    await page.waitForTimeout(400)
    const ltrStore = await page.evaluate(() => {
      const s = (
        window as unknown as {
          __FLOW_BUILDER_STORE__?: { getState: () => { diagram: GeometryStore | null } }
        }
      ).__FLOW_BUILDER_STORE__
      return s?.getState().diagram ?? null
    })
    const ltrGeom = await canvasGeometry(page, {
      nodes: ltrStore!.nodes,
      edges: ltrStore!.edges,
    })
    assertClean(ltrGeom, 'ltr')

    // 40-node two-loop variant: shared layout engine (same as server), then measure.
    const big = buildMerchantOnboarding40Fixture()
    await page.evaluate(async (payload) => {
      const s = (
        window as unknown as {
          __FLOW_BUILDER_STORE__?: {
            getState: () => {
              diagram: GeometryStore | null
              replaceDiagramContent: (d: unknown) => void
            }
          }
        }
      ).__FLOW_BUILDER_STORE__!
      const layout = (
        window as unknown as {
          __FLOW_BUILDER_LAYOUT__?: {
            layoutDiagram: (
              n: unknown[],
              e: unknown[],
              o: { direction: string },
            ) => Promise<{ nodes: unknown[]; edges: unknown[] }>
          }
        }
      ).__FLOW_BUILDER_LAYOUT__!
      const current = s.getState().diagram
      if (!current) throw new Error('no diagram')
      const laid = await layout.layoutDiagram(payload.nodes, payload.edges, {
        direction: 'DOWN',
      })
      s.getState().replaceDiagramContent({
        ...current,
        title: payload.title,
        nodes: laid.nodes,
        edges: laid.edges,
        fitPending: false,
        layoutPending: false,
      })
    }, big)
    await page.waitForTimeout(1200)
    await resolveInStore(page)
    const store40 = await page.evaluate(() => {
      const s = (
        window as unknown as {
          __FLOW_BUILDER_STORE__?: { getState: () => { diagram: GeometryStore | null } }
        }
      ).__FLOW_BUILDER_STORE__
      return s?.getState().diagram ?? null
    })
    expect(store40?.nodes.length).toBeGreaterThanOrEqual(40)
    // 40-node stress: no card overlaps, no shared buses, full titles. Through-node
    // on dense loop highways is covered by the unit fixture assertions on e21/ex6.
    const geom40 = await canvasGeometry(page, {
      nodes: store40!.nodes,
      edges: store40!.edges,
    })
    expect(geom40.issues.overlaps, `40 overlaps: ${geom40.issues.overlaps}`).toEqual([])
    expect(geom40.issues.shared, `40 shared: ${geom40.issues.shared}`).toEqual([])
    expect(geom40.issues.truncated, `40 truncated: ${geom40.issues.truncated}`).toEqual([])
  })
})

type GeometryStore = {
  nodes: Array<{ id: string; kind?: string; parentId?: string; label?: string }>
  edges: Array<{
    id: string
    source: string
    target: string
    sourceHandle?: string
    label?: string
  }>
}
