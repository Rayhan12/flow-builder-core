import { expect, test, type Page } from '@playwright/test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const RUNS = path.join(ROOT, '.cursor-runs')

type StoreApi = {
  getState: () => {
    diagram: {
      nodes: Array<{ id: string; kind: string; position: { x: number; y: number } }>
      edges: Array<{
        id: string
        source: string
        target: string
        style?: { dash?: string; width?: number }
        endMarker?: string
        type?: string
      }>
    } | null
    selectedNodeIds: string[]
    addEdgeFromConnection: (c: {
      source: string
      target: string
      sourceHandle?: string
      targetHandle?: string
    }) => void
    reconnectEdge: (
      edgeId: string,
      c: {
        source: string
        target: string
        sourceHandle?: string
        targetHandle?: string
      },
    ) => void
    addConnectedNode: (sourceId: string, side: string) => string | null
    setSelection: (nodeIds: string[], edgeIds: string[]) => void
    alignSelection: (mode: string) => void
    distributeSelection: (axis: string) => void
    updateEdge: (id: string, patch: Record<string, unknown>) => void
    moveNodes: (
      updates: Array<{ id: string; position: { x: number; y: number } }>,
      recordHistory: boolean,
    ) => void
  }
}

function store(page: Page) {
  return page.evaluate(() => {
    const s = (window as unknown as { __FLOW_BUILDER_STORE__?: StoreApi }).__FLOW_BUILDER_STORE__
    if (!s) throw new Error('store missing')
    return true
  })
}

async function getStoreState(page: Page) {
  return page.evaluate(() => {
    const s = (window as unknown as { __FLOW_BUILDER_STORE__?: StoreApi }).__FLOW_BUILDER_STORE__
    if (!s) throw new Error('store missing')
    const state = s.getState()
    return {
      nodes: state.diagram?.nodes ?? [],
      edges: state.diagram?.edges ?? [],
      selectedNodeIds: state.selectedNodeIds,
    }
  })
}

async function signUpAndOpenEditor(page: Page, label: string) {
  const email = `${label}-${Date.now()}@example.com`
  const password = 'test-pass-123'

  await page.goto('/signup')
  await page.getByLabel('Name (optional)').fill(label)
  await page.getByLabel('Email').fill(email)
  await page.locator('input[name="password"]').fill(password)
  await page.getByRole('button', { name: 'Create account' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toContainText(/Good (morning|afternoon|evening)/, {
    timeout: 15_000,
  })
  await page.locator('.project-card-link', { hasText: 'My first project' }).click({ timeout: 15_000 })
  await page.getByRole('button', { name: 'New diagram' }).first().click()
  await page.waitForURL(/\/p\/[^/]+\/d\//, { timeout: 15_000 })
  await expect(page.getByTestId('properties-panel')).toBeVisible({ timeout: 15_000 })
  await store(page)
}

async function addKind(page: Page, label: string) {
  await page.locator('.palette-item', { hasText: label }).first().click()
  await expect(page.locator('.react-flow__node').last()).toBeVisible()
}

test.describe('UXA Figma-style editor', () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test('connect from side handle and reconnect endpoint', async ({ page }) => {
    await signUpAndOpenEditor(page, 'uxa-connect')
    await addKind(page, 'Step')
    await addKind(page, 'Step')
    await addKind(page, 'End')
    await expect(page.locator('.react-flow__node')).toHaveCount(3)

    await page.evaluate(() => {
      const s = (window as unknown as { __FLOW_BUILDER_STORE__?: StoreApi }).__FLOW_BUILDER_STORE__
      const state = s!.getState()
      const steps = (state.diagram?.nodes ?? []).filter((n) => n.kind === 'step')
      const end = (state.diagram?.nodes ?? []).find((n) => n.kind === 'end')
      if (steps.length < 2 || !end) throw new Error('need 2 steps and end')
      state.addEdgeFromConnection({
        source: steps[0].id,
        target: steps[1].id,
        sourceHandle: 'right',
        targetHandle: 'left',
      })
    })

    await expect(page.locator('.react-flow__edge')).toHaveCount(1)

    await page.evaluate(() => {
      const s = (window as unknown as { __FLOW_BUILDER_STORE__?: StoreApi }).__FLOW_BUILDER_STORE__
      const state = s!.getState()
      const edge = state.diagram?.edges[0]
      const steps = (state.diagram?.nodes ?? []).filter((n) => n.kind === 'step')
      const end = (state.diagram?.nodes ?? []).find((n) => n.kind === 'end')
      if (!edge || !end || steps.length < 2) throw new Error('missing edge')
      state.reconnectEdge(edge.id, {
        source: steps[0].id,
        target: end.id,
        sourceHandle: 'bottom',
        targetHandle: 'top',
      })
    })

    const after = await getStoreState(page)
    expect(after.edges).toHaveLength(1)
    expect(after.edges[0].target).toBe(after.nodes.find((n) => n.kind === 'end')?.id)

    await page.evaluate(() => {
      const s = (window as unknown as { __FLOW_BUILDER_STORE__?: StoreApi }).__FLOW_BUILDER_STORE__
      const state = s!.getState()
      const edge = state.diagram?.edges[0]
      if (!edge) throw new Error('no edge')
      state.setSelection([], [edge.id])
    })
    await expect(page.getByTestId('edge-type')).toBeVisible({ timeout: 5_000 })
    await expect(page.getByTestId('edge-end-marker')).toBeVisible()
    await page.getByTestId('edge-end-marker').selectOption('diamond')
    await page.getByTestId('edge-dash').selectOption('dashed')
    await page.screenshot({ path: path.join(RUNS, 'ux-connectors.png') })
  })

  test('quick-add creates a connected node', async ({ page }) => {
    await signUpAndOpenEditor(page, 'uxa-quickadd')
    await addKind(page, 'Step')
    const before = await getStoreState(page)
    expect(before.nodes).toHaveLength(1)

    await page.evaluate(() => {
      const s = (window as unknown as { __FLOW_BUILDER_STORE__?: StoreApi }).__FLOW_BUILDER_STORE__
      const state = s!.getState()
      const node = state.diagram?.nodes[0]
      if (!node) throw new Error('no node')
      const id = state.addConnectedNode(node.id, 'right')
      if (!id) throw new Error('quick add failed')
    })

    const after = await getStoreState(page)
    expect(after.nodes).toHaveLength(2)
    expect(after.edges).toHaveLength(1)
    expect(after.edges[0].source).toBe(before.nodes[0].id)
  })

  test('alt-hover shows distance measurements between nodes', async ({ page }) => {
    await signUpAndOpenEditor(page, 'uxa-guides')
    await addKind(page, 'Step')
    await addKind(page, 'Step')

    const ids = await page.evaluate(() => {
      const s = (window as unknown as { __FLOW_BUILDER_STORE__?: StoreApi }).__FLOW_BUILDER_STORE__
      const state = s!.getState()
      const nodes = state.diagram?.nodes ?? []
      if (nodes.length < 2) throw new Error('need 2 nodes')
      state.moveNodes(
        [
          { id: nodes[0].id, position: { x: 96, y: 160 } },
          { id: nodes[1].id, position: { x: 400, y: 160 } },
        ],
        true,
      )
      state.setSelection([nodes[0].id], [])
      return { a: nodes[0].id, b: nodes[1].id }
    })

    const other = page.locator(`.react-flow__node[data-id="${ids.b}"]`)
    await expect(other).toBeVisible()
    await page.keyboard.down('Alt')
    await other.hover()
    await expect(page.getByTestId('alignment-guides')).toBeVisible({ timeout: 3_000 })
    await expect(page.getByTestId('distance-measure').first()).toBeVisible()
    await page.screenshot({ path: path.join(RUNS, 'ux-smart-guides.png') })
    await page.keyboard.up('Alt')
  })

  test('marquee select, align left, distribute', async ({ page }) => {
    await signUpAndOpenEditor(page, 'uxa-align')
    await addKind(page, 'Step')
    await addKind(page, 'Step')
    await addKind(page, 'Step')

    await page.evaluate(() => {
      const s = (window as unknown as { __FLOW_BUILDER_STORE__?: StoreApi }).__FLOW_BUILDER_STORE__
      const state = s!.getState()
      const nodes = state.diagram?.nodes ?? []
      if (nodes.length < 3) throw new Error('need 3 nodes')
      state.moveNodes(
        [
          { id: nodes[0].id, position: { x: 40, y: 40 } },
          { id: nodes[1].id, position: { x: 200, y: 120 } },
          { id: nodes[2].id, position: { x: 420, y: 80 } },
        ],
        true,
      )
      state.setSelection(
        nodes.map((n) => n.id),
        [],
      )
    })

    await expect(page.getByTestId('align-toolbar')).toBeVisible()
    await page.screenshot({ path: path.join(RUNS, 'ux-align-toolbar.png') })

    await page.getByTestId('align-left').click()
    let state = await getStoreState(page)
    const xs = state.nodes.map((n) => n.position.x)
    expect(xs.every((x) => x === xs[0])).toBe(true)

    await page.evaluate(() => {
      const s = (window as unknown as { __FLOW_BUILDER_STORE__?: StoreApi }).__FLOW_BUILDER_STORE__
      const state = s!.getState()
      const nodes = state.diagram?.nodes ?? []
      state.moveNodes(
        [
          { id: nodes[0].id, position: { x: 0, y: 0 } },
          { id: nodes[1].id, position: { x: 160, y: 0 } },
          { id: nodes[2].id, position: { x: 500, y: 0 } },
        ],
        true,
      )
      state.setSelection(
        nodes.map((n) => n.id),
        [],
      )
    })

    await page.getByTestId('distribute-horizontal').click()
    state = await getStoreState(page)
    const sorted = [...state.nodes].sort((a, b) => a.position.x - b.position.x)
    const w = 256
    const gap1 = sorted[1].position.x - (sorted[0].position.x + w)
    const gap2 = sorted[2].position.x - (sorted[1].position.x + w)
    expect(Math.abs(gap1 - gap2)).toBeLessThan(2)
  })

  test('edge style dashed and diamond end persists after reload', async ({ page }) => {
    await signUpAndOpenEditor(page, 'uxa-edge-style')
    await addKind(page, 'Step')
    await addKind(page, 'End')
    await expect(page.locator('.react-flow__node')).toHaveCount(2)
    await expect(page.getByText('Saved')).toBeVisible({ timeout: 5_000 })

    await page.evaluate(() => {
      const s = (window as unknown as { __FLOW_BUILDER_STORE__?: StoreApi }).__FLOW_BUILDER_STORE__
      const state = s!.getState()
      const step = state.diagram?.nodes.find((n) => n.kind === 'step')
      const end = state.diagram?.nodes.find((n) => n.kind === 'end')
      if (!step || !end) throw new Error('missing nodes')
      state.addEdgeFromConnection({
        source: step.id,
        target: end.id,
        sourceHandle: 'bottom',
        targetHandle: 'top',
      })
      const after = s!.getState()
      const edge = after.diagram?.edges[0]
      if (!edge) throw new Error('edge missing after connect')
      after.updateEdge(edge.id, {
        type: 'straight',
        endMarker: 'diamond',
        style: { dash: 'dashed', width: 2 },
      })
      s!.getState().setSelection([], [edge.id])
    })

    await expect(page.getByTestId('edge-type')).toHaveValue('straight', { timeout: 5_000 })
    await expect(page.getByText('Saved')).toBeVisible({ timeout: 5_000 })
    // Ensure dirty cycle finished after style write.
    await page.waitForTimeout(1200)
    await expect(page.getByText('Saved')).toBeVisible({ timeout: 5_000 })

    await page.reload()
    await expect(page.getByTestId('properties-panel')).toBeVisible({ timeout: 15_000 })
    await expect(page.locator('.react-flow__node')).toHaveCount(2, { timeout: 10_000 })

    const edges = await page.evaluate(async () => {
      const s = (window as unknown as { __FLOW_BUILDER_STORE__?: StoreApi }).__FLOW_BUILDER_STORE__
      for (let i = 0; i < 40; i += 1) {
        const edges = s!.getState().diagram?.edges ?? []
        if (edges.length) return edges
        await new Promise((r) => setTimeout(r, 100))
      }
      return s!.getState().diagram?.edges ?? []
    })
    expect(edges.length).toBeGreaterThan(0)
    expect(edges[0].style?.dash).toBe('dashed')
    expect(edges[0].endMarker).toBe('diamond')
    expect(edges[0].type).toBe('straight')
  })

  test('zoom menu and minimap toggle', async ({ page }) => {
    await signUpAndOpenEditor(page, 'uxa-zoom')
    await addKind(page, 'Step')

    await page.getByTestId('zoom-chip').click()
    await expect(page.getByRole('menuitem', { name: 'Zoom to fit' })).toBeVisible()
    await page.screenshot({ path: path.join(RUNS, 'ux-zoom-menu.png') })
    await page.getByRole('menuitem', { name: '100%' }).click()
    await expect(page.getByTestId('zoom-chip')).toContainText('100%')

    await page.getByTestId('toggle-minimap').click()
    await page.reload()
    await expect(page.getByTestId('properties-panel')).toBeVisible({ timeout: 15_000 })
    await expect(page.getByTestId('toggle-minimap')).toHaveAttribute('aria-pressed', 'false')
  })

  test('select all with Cmd/Ctrl+A', async ({ page }) => {
    await signUpAndOpenEditor(page, 'uxa-selectall')
    await addKind(page, 'Step')
    await addKind(page, 'Step')
    await addKind(page, 'End')

    await page.locator('.react-flow').first().click({ position: { x: 20, y: 20 } })
    const modifier = process.platform === 'darwin' ? 'Meta' : 'Control'
    await page.keyboard.press(`${modifier}+A`)

    const state = await getStoreState(page)
    expect(state.selectedNodeIds.length).toBe(3)
    await expect(page.getByTestId('align-toolbar')).toBeVisible()
  })
})
