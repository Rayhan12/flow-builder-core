/**
 * FLOWFIX5: polished orthogonal edges, zero through-cards (8px inflate),
 * parallel gap, rounded corners, merchant + KYC/BNPL screenshots.
 */
import { expect, test, type Page } from '@playwright/test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildKycBnplFixture } from '../shared/layout/kycBnplFixture.ts'
import { buildMerchantOnboardingFixture } from '../shared/layout/merchantOnboardingFixture.ts'
import { createAdminDataPort } from '../server/adminDataPort.ts'
import { resetFirebaseAdminForTests } from '../server/firebaseAdmin.ts'
import { CURRENT_SCHEMA_VERSION } from '../src/schema/index.ts'
import { canvasGeometry } from './canvasGeometry.ts'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const RUNS = path.join(ROOT, '.cursor-runs')

async function signUp(page: Page) {
  const email = `flowfix5-${Date.now()}@example.com`
  await page.goto('/signup')
  await page.getByLabel('Name (optional)').fill('Flowfix5')
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
  await page.locator('.react-flow__node').first().waitFor({ timeout: 20_000 })
  await page.waitForTimeout(2800)
  const badge = page.getByTestId('layout-conflict-badge')
  if ((await badge.count()) > 0) {
    // Auto-resolve may still be settling; Fix layout is the same shared resolve path.
    await page.getByRole('button', { name: 'Fix layout' }).click()
    await page.waitForTimeout(1200)
  }
  await expect(badge).toHaveCount(0, { timeout: 20_000 })
}

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
        }
      }
    ).__FLOW_BUILDER_LAYOUT__!
    const d0 = s.getState().diagram
    if (!d0) throw new Error('no diagram')
    const laid = await layout.layoutDiagram(d0.nodes, d0.edges, { direction: 'DOWN' })
    s.getState().applyNodeLayout(laid.nodes, laid.edges)
  })
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
  expect(
    report.issues.parallelTight,
    `${label} parallelTight: ${report.issues.parallelTight}`,
  ).toEqual([])
  expect(report.issues.truncated, `${label} truncated: ${report.issues.truncated}`).toEqual([])
  expect(report.issues.labelHits, `${label} labelHits: ${report.issues.labelHits}`).toEqual([])
  expect(
    report.issues.labelLabelHits,
    `${label} labelLabelHits: ${report.issues.labelLabelHits}`,
  ).toEqual([])
  expect(report.issues.midMarkers, `${label} midMarkers: ${report.issues.midMarkers}`).toEqual([])
  expect(report.issues.missingEdges, `${label} missingEdges`).toEqual([])
  expect(
    report.issues.sharpCorners,
    `${label} sharpCorners: ${report.issues.sharpCorners}`,
  ).toEqual([])
  expect(report.issues.badStroke, `${label} badStroke: ${report.issues.badStroke}`).toEqual([])
}

async function loadFixtureInStore(
  page: Page,
  fixture: { title: string; nodes: unknown[]; edges: unknown[] },
) {
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
  }, fixture)
  await page.waitForTimeout(1200)
  await resolveInStore(page)
}

async function storeDiagram(page: Page) {
  return page.evaluate(() => {
    const s = (
      window as unknown as {
        __FLOW_BUILDER_STORE__?: { getState: () => { diagram: GeometryStore | null } }
      }
    ).__FLOW_BUILDER_STORE__
    return s?.getState().diagram ?? null
  })
}

test.describe('FLOWFIX5 edge polish geometry', () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test('merchant + KYC/BNPL: zero through-cards, rounded edges, screenshots', async ({
    page,
  }) => {
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

    await page.goto(`/p/${projectId}/d/${created.id}`)
    await waitForMeasureAndResolve(page)

    let diagram = await storeDiagram(page)
    expect(diagram?.nodes.length).toBeGreaterThanOrEqual(26)
    let geom = await canvasGeometry(page, {
      nodes: diagram!.nodes,
      edges: diagram!.edges,
    })
    assertClean(geom, 'merchant-open')

    await page.keyboard.press('Shift+1')
    await page.waitForTimeout(500)
    await page.screenshot({
      path: path.join(RUNS, 'flowfix5-merchant-fit.png'),
      fullPage: false,
    })

    // Centre on Admin Action switch at ~100%.
    await page.evaluate(() => {
      const s = (
        window as unknown as {
          __FLOW_BUILDER_STORE__?: {
            getState: () => { setSelection?: (n: string[], e: string[]) => void }
          }
        }
      ).__FLOW_BUILDER_STORE__
      s?.getState().setSelection?.(['admin'], [])
    })
    await page.keyboard.press('Shift+2')
    await page.waitForTimeout(400)
    // Force ~100% zoom while keeping the Admin Action switch centred.
    await page.evaluate(() => {
      const store = (
        window as unknown as {
          __FLOW_BUILDER_STORE__?: {
            getState: () => {
              diagram: { nodes: Array<{ id: string; position: { x: number; y: number }; size?: { w: number; h: number } }> } | null
              setViewport?: (v: { x: number; y: number; zoom: number }) => void
            }
          }
        }
      ).__FLOW_BUILDER_STORE__
      const d = store?.getState().diagram
      const admin = d?.nodes.find((n) => n.id === 'admin')
      if (!admin || !store?.getState().setViewport) return
      const w = admin.size?.w ?? 400
      const h = admin.size?.h ?? 160
      const zoom = 1
      const vx = 1440 / 2 - (admin.position.x + w / 2) * zoom
      const vy = 900 / 2 - (admin.position.y + h / 2) * zoom
      store.getState().setViewport!({ x: vx, y: vy, zoom })
    })
    await page.waitForTimeout(300)
    await page.screenshot({
      path: path.join(RUNS, 'flowfix5-merchant-100.png'),
      fullPage: false,
    })

    geom = await canvasGeometry(page, {
      nodes: (await storeDiagram(page))!.nodes,
      edges: (await storeDiagram(page))!.edges,
    })
    assertClean(geom, 'merchant-100')

    // Hover an outgoing Admin Action edge that is on screen at this zoom.
    const adminEdge = page.locator('[data-testid="rf__edge-e16"] [data-testid="edge-hit"]')
    const hoverTarget =
      (await adminEdge.count()) > 0
        ? adminEdge
        : page.locator('[data-testid="rf__edge-e17"] [data-testid="edge-hit"]')
    await hoverTarget.hover({ force: true })
    await page.waitForTimeout(250)
    await page.screenshot({
      path: path.join(RUNS, 'flowfix5-hover.png'),
      fullPage: false,
    })

    // Second 25+ node KYC/BNPL flow.
    const kyc = buildKycBnplFixture()
    expect(kyc.nodes.length).toBeGreaterThanOrEqual(25)
    await loadFixtureInStore(page, kyc)
    diagram = await storeDiagram(page)
    expect(diagram?.nodes.length).toBeGreaterThanOrEqual(25)
    geom = await canvasGeometry(page, {
      nodes: diagram!.nodes,
      edges: diagram!.edges,
    })
    assertClean(geom, 'kyc-fit')

    await page.keyboard.press('Shift+1')
    await page.waitForTimeout(500)
    await page.screenshot({
      path: path.join(RUNS, 'flowfix5-second-fit.png'),
      fullPage: false,
    })

    await page.evaluate(() => {
      const s = (
        window as unknown as {
          __FLOW_BUILDER_STORE__?: {
            getState: () => { setSelection?: (n: string[], e: string[]) => void }
          }
        }
      ).__FLOW_BUILDER_STORE__
      s?.getState().setSelection?.(['uw'], [])
    })
    await page.keyboard.press('Shift+2')
    await page.waitForTimeout(400)
    await page.evaluate(() => {
      const store = (
        window as unknown as {
          __FLOW_BUILDER_STORE__?: {
            getState: () => {
              diagram: { nodes: Array<{ id: string; position: { x: number; y: number }; size?: { w: number; h: number } }> } | null
              setViewport?: (v: { x: number; y: number; zoom: number }) => void
            }
          }
        }
      ).__FLOW_BUILDER_STORE__
      const d = store?.getState().diagram
      const uw = d?.nodes.find((n) => n.id === 'uw')
      if (!uw || !store?.getState().setViewport) return
      const w = uw.size?.w ?? 400
      const h = uw.size?.h ?? 160
      const zoom = 1
      const vx = 1440 / 2 - (uw.position.x + w / 2) * zoom
      const vy = 900 / 2 - (uw.position.y + h / 2) * zoom
      store.getState().setViewport!({ x: vx, y: vy, zoom })
    })
    await page.waitForTimeout(300)
    await page.screenshot({
      path: path.join(RUNS, 'flowfix5-second-100.png'),
      fullPage: false,
    })

    geom = await canvasGeometry(page, {
      nodes: (await storeDiagram(page))!.nodes,
      edges: (await storeDiagram(page))!.edges,
    })
    assertClean(geom, 'kyc-100')
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
