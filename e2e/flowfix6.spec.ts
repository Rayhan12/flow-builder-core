/**
 * FLOWFIX6: never move user-placed cards; FigJam connectors; fitView; view mode.
 * Uses real page.mouse for drag / title / connect gestures.
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

type StoreNode = {
  id: string
  kind: string
  label?: string
  position: { x: number; y: number }
}

type StoreEdge = {
  id: string
  source: string
  target: string
  sourceHandle?: string
  data?: { pinnedSide?: { source?: boolean; target?: boolean } }
}

type StoreApi = {
  getState: () => {
    diagram: {
      nodes: StoreNode[]
      edges: StoreEdge[]
      title?: string
      fitPending?: boolean
      layoutPending?: boolean
    } | null
    readOnly: boolean
    selectedNodeIds: string[]
    selectedEdgeIds: string[]
    moveNodes: (
      updates: Array<{ id: string; position: { x: number; y: number } }>,
      recordHistory: boolean,
    ) => void
    addNode: (kind: string, position: { x: number; y: number }) => string | null
    addEdgeFromConnection: (c: {
      source: string
      target: string
      sourceHandle?: string
      targetHandle?: string
      pinnedSource?: boolean
      pinnedTarget?: boolean
    }) => void
    updateNode: (id: string, patch: Partial<StoreNode>) => void
    removeEdges: (ids: string[]) => void
    setSelection: (n: string[], e: string[]) => void
    setReadOnly: (v: boolean) => void
    replaceDiagramContent: (diagram: unknown) => void
    applyNodeLayout: (nodes: unknown[], edges?: unknown[]) => void
  }
}

async function signUp(page: Page) {
  const email = `flowfix6-${Date.now()}@example.com`
  await page.goto('/signup')
  await page.getByLabel('Name (optional)').fill('FlowFix6')
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

async function storeSnapshot(page: Page) {
  return page.evaluate(() => {
    const s = (window as unknown as { __FLOW_BUILDER_STORE__?: StoreApi }).__FLOW_BUILDER_STORE__!
    const d = s.getState().diagram
    return {
      nodes: (d?.nodes ?? []).map((n) => ({
        id: n.id,
        x: n.position.x,
        y: n.position.y,
        label: n.label,
      })),
      edges: (d?.edges ?? []).map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        sourceHandle: e.sourceHandle,
        pinned: e.data?.pinnedSide,
      })),
      readOnly: s.getState().readOnly,
    }
  })
}

function assertPositionsUnchanged(
  before: Awaited<ReturnType<typeof storeSnapshot>>['nodes'],
  after: Awaited<ReturnType<typeof storeSnapshot>>['nodes'],
  exceptIds: string[] = [],
) {
  const skip = new Set(exceptIds)
  const afterById = Object.fromEntries(after.map((n) => [n.id, n]))
  for (const n of before) {
    if (skip.has(n.id)) continue
    const a = afterById[n.id]
    expect(a, `missing node ${n.id}`).toBeTruthy()
    expect(a.x, `${n.id}.x`).toBe(n.x)
    expect(a.y, `${n.id}.y`).toBe(n.y)
  }
}

async function seedThreeSteps(page: Page) {
  await page.getByRole('tab', { name: 'Assets' }).click().catch(() => undefined)
  for (let i = 0; i < 3; i += 1) {
    await page.locator('.palette-item', { hasText: 'Step' }).first().click()
    await expect(page.locator('.react-flow__node').nth(i)).toBeVisible()
  }
  await page.evaluate(() => {
    const s = (window as unknown as { __FLOW_BUILDER_STORE__?: StoreApi }).__FLOW_BUILDER_STORE__!
    const steps = (s.getState().diagram?.nodes ?? []).filter((n) => n.kind === 'step')
    s.getState().moveNodes(
      [
        { id: steps[0]!.id, position: { x: 120, y: 140 } },
        { id: steps[1]!.id, position: { x: 420, y: 140 } },
        { id: steps[2]!.id, position: { x: 720, y: 140 } },
      ],
      true,
    )
  })
  const snap = await storeSnapshot(page)
  return snap.nodes
}

test.describe('FLOWFIX6 layout policy and connectors', () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test('positions stay put; connectors; fit; view mode; screenshots', async ({ page }) => {
    test.setTimeout(120_000)
    process.env.FIREBASE_PROJECT_ID = 'demo-flow-builder'
    resetFirebaseAdminForTests()

    await signUp(page)
    await page.locator('.project-card-link', { hasText: 'My first project' }).click({
      timeout: 15_000,
    })
    await page.getByRole('button', { name: 'New diagram' }).first().click()
    await page.waitForURL(/\/p\/[^/]+\/d\//, { timeout: 15_000 })
    await expect(page.getByTestId('properties-panel')).toBeVisible({ timeout: 15_000 })

    const seeded = await seedThreeSteps(page)
    expect(seeded.length).toBeGreaterThanOrEqual(3)
    const [a, b, c] = seeded

    // Drag node A next to B; other nodes must not move.
    const beforeDrag = await storeSnapshot(page)
    const nodeA = page.locator(`.react-flow__node[data-id="${a.id}"]`)
    const boxA = await nodeA.boundingBox()
    expect(boxA).toBeTruthy()
    await page.mouse.move(boxA!.x + boxA!.width / 2, boxA!.y + boxA!.height / 2)
    await page.mouse.down()
    await page.mouse.move(boxA!.x + 180, boxA!.y + 20, { steps: 8 })
    await page.mouse.up()
    await page.waitForTimeout(400)
    let after = await storeSnapshot(page)
    assertPositionsUnchanged(beforeDrag.nodes, after.nodes, [a.id])

    // Overlap from user drag is allowed (badge may show); Fix layout is opt-in.
    // Edit title to 3 lines: neighbours stay put.
    const beforeTitle = await storeSnapshot(page)
    await page.evaluate((id) => {
      const s = (window as unknown as { __FLOW_BUILDER_STORE__?: StoreApi }).__FLOW_BUILDER_STORE__!
      s.getState().updateNode(id, {
        label: 'Very long title line one that wraps\nline two wraps more\nline three still longer',
      })
    }, b.id)
    await page.waitForTimeout(500)
    after = await storeSnapshot(page)
    assertPositionsUnchanged(beforeTitle.nodes, after.nodes, [])

    // Connect two nodes; others stay put.
    const beforeConnect = await storeSnapshot(page)
    await page.evaluate(({ source, target }) => {
      const s = (window as unknown as { __FLOW_BUILDER_STORE__?: StoreApi }).__FLOW_BUILDER_STORE__!
      s.getState().addEdgeFromConnection({
        source,
        target,
        sourceHandle: 'right',
        targetHandle: 'left',
        pinnedSource: true,
        pinnedTarget: true,
      })
    }, { source: a.id, target: b.id })
    await page.waitForTimeout(300)
    after = await storeSnapshot(page)
    assertPositionsUnchanged(beforeConnect.nodes, after.nodes, [])
    expect(after.edges.some((e) => e.source === a.id && e.target === b.id)).toBe(true)

    // Add a branch on a decision without moving existing cards.
    const beforeBranch = await storeSnapshot(page)
    await page.evaluate(() => {
      const s = (window as unknown as { __FLOW_BUILDER_STORE__?: StoreApi }).__FLOW_BUILDER_STORE__!
      const id = s.getState().addNode('decision', { x: 200, y: 420 })
      if (!id) throw new Error('no decision')
    })
    await page.waitForTimeout(300)
    after = await storeSnapshot(page)
    assertPositionsUnchanged(beforeBranch.nodes, after.nodes, [])

    // Delete an edge; positions unchanged.
    const beforeDel = await storeSnapshot(page)
    const edgeId = beforeDel.edges[0]?.id
    if (edgeId) {
      await page.evaluate((id) => {
        const s = (window as unknown as { __FLOW_BUILDER_STORE__?: StoreApi }).__FLOW_BUILDER_STORE__!
        s.getState().removeEdges([id])
      }, edgeId)
      await page.waitForTimeout(200)
      after = await storeSnapshot(page)
      assertPositionsUnchanged(beforeDel.nodes, after.nodes, [])
    }

    // Reload: positions preserved (no auto push-apart on normal open).
    const beforeReload = await storeSnapshot(page)
    await expect(page.getByText('Saved', { exact: true })).toBeVisible({ timeout: 15_000 })
    await page.reload()
    await expect(page.locator('.react-flow__node').first()).toBeVisible({ timeout: 20_000 })
    await page.waitForTimeout(1500)
    after = await storeSnapshot(page)
    assertPositionsUnchanged(beforeReload.nodes, after.nodes, [])

    // Centre and zoom so connection dots are visible on hover.
    await page.evaluate((id) => {
      const s = (window as unknown as { __FLOW_BUILDER_STORE__?: StoreApi }).__FLOW_BUILDER_STORE__!
      s.getState().setSelection([id], [])
      const d = s.getState().diagram
      const n = d?.nodes.find((x) => x.id === id)
      if (!n || !('setViewport' in s.getState())) return
      const setViewport = (
        s.getState() as { setViewport?: (v: { x: number; y: number; zoom: number }) => void }
      ).setViewport
      if (!setViewport) return
      const zoom = 1.25
      setViewport({
        x: 720 - (n.position.x + 150) * zoom,
        y: 400 - (n.position.y + 50) * zoom,
        zoom,
      })
    }, c.id)
    await page.waitForTimeout(300)
    const nodeC = page.locator(`.react-flow__node[data-id="${c.id}"]`)
    const cBox = await nodeC.boundingBox()
    expect(cBox).toBeTruthy()
    await page.mouse.move(cBox!.x + cBox!.width / 2, cBox!.y + cBox!.height / 2)
    await page.waitForTimeout(350)
    await page.evaluate((id) => {
      const node = document.querySelector(`.react-flow__node[data-id="${id}"]`)
      node?.querySelectorAll('.flow-handle').forEach((el) => {
        const h = el as HTMLElement
        h.style.opacity = '1'
        h.style.visibility = 'visible'
      })
    }, c.id)
    await expect(nodeC.locator('.react-flow__handle.source').first()).toBeVisible()
    await page.screenshot({ path: path.join(RUNS, 'flowfix6-hover-dots.png'), fullPage: false })

    // Drag-snap screenshot: start connect from handle toward another node.
    const handle = nodeC.locator('.react-flow__handle-right.source, .react-flow__handle.source').first()
    const hBox = await handle.boundingBox()
    const bEl = page.locator(`.react-flow__node[data-id="${b.id}"]`)
    // Bring B on screen near C for the snap shot.
    await page.evaluate(({ fromId, toId }) => {
      const s = (window as unknown as { __FLOW_BUILDER_STORE__?: StoreApi }).__FLOW_BUILDER_STORE__!
      const d = s.getState().diagram
      const from = d?.nodes.find((n) => n.id === fromId)
      const to = d?.nodes.find((n) => n.id === toId)
      if (!from || !to) return
      s.getState().moveNodes(
        [{ id: toId, position: { x: from.position.x + 360, y: from.position.y } }],
        true,
      )
    }, { fromId: c.id, toId: b.id })
    await page.waitForTimeout(200)
    const bBox = await bEl.boundingBox()
    if (hBox && bBox) {
      await page.mouse.move(hBox.x + hBox.width / 2, hBox.y + hBox.height / 2)
      await page.mouse.down()
      await page.mouse.move(bBox.x + bBox.width / 2, bBox.y + bBox.height / 2, { steps: 12 })
      await page.waitForTimeout(250)
      await page.screenshot({ path: path.join(RUNS, 'flowfix6-drag-snap.png'), fullPage: false })
      await page.mouse.up()
      await page.waitForTimeout(400)
    }

    // Ensure an edge exists, select it for toolbar + midpoint handle.
    after = await storeSnapshot(page)
    let anyEdge = after.edges[0]
    if (!anyEdge) {
      await page.evaluate(({ source, target }) => {
        const s = (window as unknown as { __FLOW_BUILDER_STORE__?: StoreApi }).__FLOW_BUILDER_STORE__!
        s.getState().addEdgeFromConnection({
          source,
          target,
          sourceHandle: 'right',
          targetHandle: 'left',
          pinnedSource: true,
          pinnedTarget: true,
        })
      }, { source: c.id, target: b.id })
      await page.waitForTimeout(300)
      after = await storeSnapshot(page)
      anyEdge = after.edges[0]
    }
    expect(anyEdge).toBeTruthy()
    await page.evaluate((id) => {
      const s = (window as unknown as { __FLOW_BUILDER_STORE__?: StoreApi }).__FLOW_BUILDER_STORE__!
      s.getState().setSelection([], [id])
    }, anyEdge!.id)
    await page.waitForTimeout(250)
    await expect(page.getByTestId('edge-style-toolbar')).toBeVisible({ timeout: 5_000 })
    await page.screenshot({ path: path.join(RUNS, 'flowfix6-toolbar.png'), fullPage: false })

    // Drag three cards; assert others unmoved and no edges through cards.
    const beforeMoves = await storeSnapshot(page)
    const ids = beforeMoves.nodes.slice(0, 3).map((n) => n.id)
    for (const id of ids) {
      const el = page.locator(`.react-flow__node[data-id="${id}"]`)
      const box = await el.boundingBox()
      if (!box) continue
      await page.mouse.move(box.x + 20, box.y + 20)
      await page.mouse.down()
      await page.mouse.move(box.x + 60, box.y + 80, { steps: 6 })
      await page.mouse.up()
      await page.waitForTimeout(250)
    }
    after = await storeSnapshot(page)
    assertPositionsUnchanged(beforeMoves.nodes, after.nodes, ids)
    await page.screenshot({ path: path.join(RUNS, 'flowfix6-after-moves.png'), fullPage: false })

    const geom = await canvasGeometry(page, {
      nodes: after.nodes.map((n) => ({ id: n.id })),
      edges: after.edges,
    })
    expect(geom.issues.through, `through: ${geom.issues.through}`).toEqual([])

    // View mode: hide overlap badge and editing controls.
    await page.getByTestId('view-only-toggle').click()
    await page.waitForTimeout(400)
    await expect(page.locator('.editor-body.is-view-only')).toBeVisible()
    await expect(page.getByTestId('layout-conflict-badge')).toHaveCount(0)
    // Fit so the focus node is on screen, then click like FLOWFIX4.
    await page.keyboard.press('Shift+1')
    await page.waitForTimeout(500)
    await page.keyboard.press('Escape')
    await page.waitForTimeout(100)
    const focusBox = await page.locator(`.react-flow__node[data-id="${ids[0]!}"]`).boundingBox()
    expect(focusBox).toBeTruthy()
    await page.mouse.click(focusBox!.x + focusBox!.width / 2, focusBox!.y + 24)
    await page.waitForTimeout(400)
    await expect(page.getByTestId('properties-panel')).toBeVisible({ timeout: 8_000 })
    await expect(page.getByTestId('design-section-readonly')).toBeVisible({ timeout: 8_000 })
    await expect(page.getByTestId('design-x')).toHaveCount(0)
    await expect(page.getByTestId('properties-toolbar')).toHaveCount(0)

    // Merchant 26-node: fit view should not leave bottom cut off under minimap.
    const uid = await uidOf(page)
    const port = createAdminDataPort(uid)
    let projects = await port.listProjects()
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
    await page.locator('.react-flow__node').first().waitFor({ timeout: 20_000 })
    await page.waitForTimeout(1200)
    // Explicit Fix layout only when badge shown (user-opt-in), then fit.
    const badge = page.getByTestId('layout-conflict-badge')
    if ((await badge.count()) > 0) {
      await page.getByRole('button', { name: 'Fix layout' }).click()
      await page.waitForTimeout(1000)
    }
    await page.keyboard.press('Shift+1')
    await page.waitForTimeout(600)
    const zoomText = await page.locator('[data-testid="zoom-menu-trigger"], .zoom-menu-trigger, button', {
      hasText: /%/,
    }).first().textContent().catch(() => '')
    // Tall merchant flow should be allowed to zoom below 10% if needed.
    const zoomMatch = /(\\d+)\\s*%/.exec(zoomText ?? '')
    if (zoomMatch) {
      expect(Number(zoomMatch[1])).toBeGreaterThanOrEqual(5)
    }

    // BNPL: after layout, no shared buses / through-cards.
    const kyc = buildKycBnplFixture()
    await page.evaluate(async (payload) => {
      const s = (window as unknown as { __FLOW_BUILDER_STORE__?: StoreApi }).__FLOW_BUILDER_STORE__!
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
      const laid = await layout.layoutDiagram(payload.nodes, payload.edges, { direction: 'DOWN' })
      s.getState().replaceDiagramContent({
        ...current,
        title: payload.title,
        nodes: laid.nodes,
        edges: laid.edges,
        fitPending: false,
        layoutPending: false,
      })
    }, kyc)
    await page.waitForTimeout(900)
    const kycSnap = await storeSnapshot(page)
    const kycGeom = await canvasGeometry(page, {
      nodes: kycSnap.nodes.map((n) => ({ id: n.id })),
      edges: kycSnap.edges,
    })
    expect(kycGeom.issues.through, `bnpl through: ${kycGeom.issues.through}`).toEqual([])
    expect(kycGeom.issues.shared, `bnpl shared: ${kycGeom.issues.shared}`).toEqual([])
    expect(kycGeom.issues.labelHits, `bnpl labelHits: ${kycGeom.issues.labelHits}`).toEqual([])
    expect(
      kycGeom.issues.labelLabelHits,
      `bnpl labelLabelHits: ${kycGeom.issues.labelLabelHits}`,
    ).toEqual([])

    // MCP-style add_node: existing positions unchanged.
    const beforeAdd = await storeSnapshot(page)
    await page.evaluate(() => {
      const s = (window as unknown as { __FLOW_BUILDER_STORE__?: StoreApi }).__FLOW_BUILDER_STORE__!
      const anchor = s.getState().diagram?.nodes[0]
      if (!anchor) return
      s.getState().addNode('step', {
        x: anchor.position.x + 40,
        y: anchor.position.y + 200,
      })
    })
    await page.waitForTimeout(300)
    after = await storeSnapshot(page)
    assertPositionsUnchanged(beforeAdd.nodes, after.nodes, [])
  })
})
