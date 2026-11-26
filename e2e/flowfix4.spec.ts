/**
 * FLOWFIX4: view-mode layout/safety/highlight, handle vs quick-add, TeachAI buses.
 * Uses real mouse/keyboard (page.mouse), not store mutation helpers for the gestures.
 */
import { expect, test, type Page } from '@playwright/test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildTeachAiDomainFixture } from '../shared/layout/teachAiDomainFixture.ts'
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
}

type StoreApi = {
  getState: () => {
    diagram: { nodes: StoreNode[]; edges: StoreEdge[]; title?: string } | null
    readOnly: boolean
    selectedNodeIds: string[]
    moveNodes: (
      updates: Array<{ id: string; position: { x: number; y: number } }>,
      recordHistory: boolean,
    ) => void
    removeNodes: (ids: string[]) => void
    addNode: (kind: string, position: { x: number; y: number }) => string | null
    addEdgeFromConnection: (c: {
      source: string
      target: string
      sourceHandle?: string
      targetHandle?: string
    }) => void
    undo: () => void
    pasteClipboard: () => boolean
    duplicateSelection: () => boolean
    groupSelection: () => string | null
    nudgeSelection: (dx: number, dy: number, record: boolean) => void
    replaceDiagramContent: (diagram: unknown) => void
    applyNodeLayout: (nodes: unknown[], edges?: unknown[]) => void
  }
}

async function signUpAndOpenEditor(page: Page, label: string) {
  const email = `${label}-${Date.now()}@example.com`
  await page.goto('/signup')
  await page.getByLabel('Name (optional)').fill(label)
  await page.getByLabel('Email').fill(email)
  await page.locator('input[name="password"]').fill('test-pass-123')
  await page.getByRole('button', { name: 'Create account' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    /Good (morning|afternoon|evening)/,
    { timeout: 15_000 },
  )
  await page.locator('.project-card-link', { hasText: 'My first project' }).click({ timeout: 15_000 })
  await page.getByRole('button', { name: 'New diagram' }).first().click()
  await page.waitForURL(/\/p\/[^/]+\/d\//, { timeout: 15_000 })
  await expect(page.getByTestId('properties-panel')).toBeVisible({ timeout: 15_000 })
}

async function addKind(page: Page, label: string) {
  await page.getByRole('tab', { name: 'Assets' }).click().catch(() => undefined)
  await page.locator('.palette-item', { hasText: label }).first().click()
  await expect(page.locator('.react-flow__node').last()).toBeVisible()
}

async function getStore(page: Page) {
  return page.evaluate(() => {
    const s = (window as unknown as { __FLOW_BUILDER_STORE__?: StoreApi }).__FLOW_BUILDER_STORE__
    if (!s) throw new Error('store missing')
    const state = s.getState()
    return {
      nodes: state.diagram?.nodes ?? [],
      edges: state.diagram?.edges ?? [],
      readOnly: state.readOnly,
      selectedNodeIds: state.selectedNodeIds,
    }
  })
}

async function seedTwoSteps(page: Page) {
  await addKind(page, 'Step')
  await addKind(page, 'Step')
  await page.evaluate(() => {
    const s = (window as unknown as { __FLOW_BUILDER_STORE__?: StoreApi }).__FLOW_BUILDER_STORE__!
    const steps = (s.getState().diagram?.nodes ?? []).filter((n) => n.kind === 'step')
    s.getState().moveNodes(
      [
        { id: steps[0]!.id, position: { x: 140, y: 160 } },
        { id: steps[1]!.id, position: { x: 520, y: 160 } },
      ],
      true,
    )
  })
  const state = await getStore(page)
  const steps = state.nodes.filter((n) => n.kind === 'step')
  return { a: steps[0]!, b: steps[1]! }
}

async function seedTenNodeFlow(page: Page) {
  // Seed via store for speed; the highlight gesture itself uses page.mouse.
  await page.evaluate(() => {
    const s = (window as unknown as { __FLOW_BUILDER_STORE__?: StoreApi }).__FLOW_BUILDER_STORE__!
    const ids: string[] = []
    for (let i = 0; i < 10; i += 1) {
      const id = s.getState().addNode('step', {
        x: 80 + (i % 5) * 220,
        y: 80 + Math.floor(i / 5) * 180,
      })
      if (id) ids.push(id)
    }
    for (let i = 0; i < ids.length - 1; i += 1) {
      s.getState().addEdgeFromConnection({
        source: ids[i]!,
        target: ids[i + 1]!,
        sourceHandle: 'bottom',
        targetHandle: 'top',
      })
    }
  })
  await expect(page.locator('.react-flow__node')).toHaveCount(10, { timeout: 10_000 })
  const state = await getStore(page)
  return state.nodes.filter((n) => n.kind === 'step')
}

test.describe('FLOWFIX4: view mode layout and safety', () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test('view mode canvas fills width; keyboard shortcuts are inert', async ({ page }) => {
    await signUpAndOpenEditor(page, 'fx4-view-layout')
    const { a, b } = await seedTwoSteps(page)

    // Make an edge so delete has something to try.
    await page.getByTestId('connector-tool').click()
    await page.locator(`.react-flow__node[data-id="${a.id}"]`).click({ position: { x: 40, y: 28 } })
    await page.locator(`.react-flow__node[data-id="${b.id}"]`).click({ position: { x: 40, y: 28 } })
    await page.keyboard.press('Escape')
    await page.keyboard.press('v')

    await page.getByTestId('view-only-toggle').click()
    await expect(page.getByTestId('editor-body')).toHaveAttribute('data-view-only', 'true')
    await expect(page.getByTestId('node-palette')).toHaveCount(0)
    await expect(page.getByTestId('properties-panel')).toHaveCount(0)

    const metrics = await page.evaluate(() => {
      const flow = document.querySelector('.react-flow') as HTMLElement | null
      if (!flow) return null
      const r = flow.getBoundingClientRect()
      return { width: r.width, left: r.left, vw: window.innerWidth }
    })
    expect(metrics).toBeTruthy()
    expect(metrics!.width / metrics!.vw).toBeGreaterThanOrEqual(0.7)
    expect(metrics!.left / metrics!.vw).toBeLessThan(0.3)

    const before = await getStore(page)
    expect(before.readOnly).toBe(true)
    const nodeCount = before.nodes.length
    const edgeCount = before.edges.length

    await page.locator(`.react-flow__node[data-id="${a.id}"]`).click({ position: { x: 40, y: 28 } })

    const keys = [
      'Delete',
      'Backspace',
      'Meta+d',
      'Meta+v',
      'Meta+x',
      'Meta+z',
      'Shift+Meta+z',
      'ArrowRight',
      'ArrowDown',
      'Meta+g',
      'c',
    ]
    for (const key of keys) {
      await page.keyboard.press(key)
    }

    const after = await getStore(page)
    expect(after.nodes.length).toBe(nodeCount)
    expect(after.edges.length).toBe(edgeCount)
    expect(after.nodes.find((n) => n.id === a.id)?.position).toEqual(
      before.nodes.find((n) => n.id === a.id)?.position,
    )

    // Store-level guard: direct mutators must no-op.
    await page.evaluate((id) => {
      const s = (window as unknown as { __FLOW_BUILDER_STORE__?: StoreApi }).__FLOW_BUILDER_STORE__!
      s.getState().removeNodes([id])
      s.getState().duplicateSelection()
      s.getState().groupSelection()
      s.getState().nudgeSelection(40, 40, true)
      s.getState().undo()
    }, a.id)
    const guarded = await getStore(page)
    expect(guarded.nodes.length).toBe(nodeCount)
  })

  test('view mode click highlights edges with marching ants and dims others', async ({
    page,
  }) => {
    await signUpAndOpenEditor(page, 'fx4-view-hl')
    const steps = await seedTenNodeFlow(page)
    expect(steps.length).toBeGreaterThanOrEqual(10)

    await page.getByTestId('view-only-toggle').click()
    await expect(page.getByTestId('editor-body')).toHaveAttribute('data-view-only', 'true')

    const focus = steps[2]!
    const box = await page.locator(`.react-flow__node[data-id="${focus.id}"]`).boundingBox()
    expect(box).toBeTruthy()
    await page.mouse.click(box!.x + box!.width / 2, box!.y + 24)
    await page.waitForTimeout(400)

    await expect(page.locator(`.react-flow__node[data-id="${focus.id}"]`)).toHaveClass(
      /is-view-focus/,
    )
    await expect(page.locator('.react-flow__edge.is-view-flow').first()).toBeVisible()

    const styles = await page.evaluate(() => {
      const paths = [...document.querySelectorAll('.react-flow__edge-path.is-view-flow-path')]
      const animated = paths.filter((p) => {
        const cs = getComputedStyle(p)
        return cs.animationName && cs.animationName !== 'none'
      })
      const dimmed = [...document.querySelectorAll('.react-flow__node.is-view-dimmed')].filter(
        (n) => {
          const opacity = Number(getComputedStyle(n).opacity)
          return opacity > 0 && opacity <= 0.35
        },
      )
      const flow = document.querySelector('.react-flow') as HTMLElement
      const r = flow.getBoundingClientRect()
      return {
        animated: animated.length,
        dimmed: dimmed.length,
        widthRatio: r.width / window.innerWidth,
        leftRatio: r.left / window.innerWidth,
      }
    })
    expect(styles.animated).toBeGreaterThanOrEqual(1)
    expect(styles.dimmed).toBeGreaterThanOrEqual(1)
    expect(styles.widthRatio).toBeGreaterThanOrEqual(0.7)
    expect(styles.leftRatio).toBeLessThan(0.3)

    await page.screenshot({
      path: path.join(RUNS, 'flowfix4-view-mode.png'),
      fullPage: false,
    })
  })
})

test.describe('FLOWFIX4: handle drag vs quick-add', () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test('press-and-drag from handle creates edge without a new node; V clears connect toast', async ({
    page,
  }) => {
    await signUpAndOpenEditor(page, 'fx4-handle-drag')
    const { a, b } = await seedTwoSteps(page)
    const before = await getStore(page)

    // Force the connector hint so V can clear it.
    await page.evaluate(() => {
      try {
        localStorage.removeItem('flow-builder-connector-hint')
      } catch {
        /* ignore */
      }
    })
    await page.keyboard.press('c')
    await expect(page.getByTestId('connector-hint-toast')).toBeVisible({ timeout: 3_000 })
    await page.keyboard.press('Escape')
    await page.keyboard.press('Escape')
    await page.keyboard.press('v')
    await expect(page.getByTestId('connector-tool')).toHaveAttribute('aria-pressed', 'false')
    await expect(page.getByTestId('connector-hint-toast')).toHaveCount(0)

    await page.locator(`.react-flow__node[data-id="${a.id}"]`).hover()
    const handle = page.locator(
      `.react-flow__node[data-id="${a.id}"] .react-flow__handle.source[data-handleid="bottom"]`,
    )
    await expect(handle).toBeAttached()
    // Hover briefly only - do not wait for delayed quick-add.
    await page.waitForTimeout(80)
    const handleBox = await handle.boundingBox()
    const targetBox = await page.locator(`.react-flow__node[data-id="${b.id}"]`).boundingBox()
    expect(handleBox && targetBox).toBeTruthy()

    await page.mouse.move(
      handleBox!.x + handleBox!.width / 2,
      handleBox!.y + handleBox!.height / 2,
    )
    await page.mouse.down()
    await page.mouse.move(
      targetBox!.x + targetBox!.width / 2,
      targetBox!.y + targetBox!.height / 2,
      { steps: 14 },
    )
    await page.mouse.up()
    await page.waitForTimeout(300)

    const after = await getStore(page)
    expect(after.nodes.length).toBe(before.nodes.length)
    expect(after.edges.length).toBe(before.edges.length + 1)
    expect(after.edges.some((e) => e.source === a.id && e.target === b.id)).toBe(true)
  })
})

test.describe('FLOWFIX4: TeachAI domain geometry', () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test('TeachAI fixture has no shared buses in the browser', async ({ page }) => {
    process.env.FIREBASE_PROJECT_ID = 'demo-flow-builder'
    resetFirebaseAdminForTests()

    const email = `fx4-teachai-${Date.now()}@example.com`
    await page.goto('/signup')
    await page.getByLabel('Name (optional)').fill('TeachAI')
    await page.getByLabel('Email').fill(email)
    await page.locator('input[name="password"]').fill('test-pass-123')
    await page.getByRole('button', { name: 'Create account' }).click()
    await expect(page.getByRole('heading', { level: 1 })).toContainText(
      /Good (morning|afternoon|evening)/,
      { timeout: 15_000 },
    )
    await page.locator('.project-card-link', { hasText: 'My first project' }).waitFor({
      timeout: 15_000,
    })

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
    expect(uid).toBeTruthy()

    const port = createAdminDataPort(uid!)
    let projects = await port.listProjects()
    if (projects.length === 0) {
      await port.createProject({ name: 'My first project' })
      projects = await port.listProjects()
    }
    const projectId = projects[0]!.id
    const fixture = buildTeachAiDomainFixture()
    const created = await port.createDiagram(projectId, fixture.title, {
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
        ...(e.label ? { label: e.label } : {}),
      })),
      groups: [],
      viewport: { x: 0, y: 0, zoom: 1 },
      theme: { palette: 'default' },
    })

    await page.goto(`/p/${projectId}/d/${created.id}`)
    await page.locator('.react-flow__node').first().waitFor({ timeout: 20_000 })
    await page.waitForTimeout(2500)
    // Normal open never auto-moves cards; Fix layout is the explicit opt-in.
    const badge = page.getByTestId('layout-conflict-badge')
    if ((await badge.count()) > 0) {
      await page.getByRole('button', { name: 'Fix layout' }).click()
      await page.waitForTimeout(1200)
    }
    await expect(badge).toHaveCount(0, { timeout: 20_000 })

    const report = await canvasGeometry(page, {
      nodes: fixture.nodes.map((n) => ({
        id: n.id,
        kind: n.kind,
        label: n.label,
      })),
      edges: fixture.edges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        label: e.label,
      })),
    })
    expect(report.issues.shared, JSON.stringify(report.issues.shared)).toEqual([])
    expect(report.issues.overlaps, JSON.stringify(report.issues.overlaps)).toEqual([])
  })
})
