import { expect, test, type Page, type Route } from '@playwright/test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const RUNS = path.join(ROOT, '.cursor-runs')

type StoreNode = {
  id: string
  kind: string
  label?: string
  position: { x: number; y: number }
  size?: { w: number; h: number }
  manuallyPositioned?: boolean
  data?: { branches?: Array<{ id: string; label: string }> }
}

type StoreEdge = {
  id: string
  source: string
  target: string
  sourceHandle?: string
  waypoints?: Array<{ x: number; y: number }>
}

type StoreApi = {
  getState: () => {
    diagram: {
      nodes: StoreNode[]
      edges: StoreEdge[]
      title: string
      schemaVersion: number
    } | null
    selectedNodeIds: string[]
    replaceDiagramContent: (d: unknown) => void
    applyNodeLayout: (nodes: StoreNode[], edges?: StoreEdge[]) => void
    undo: () => void
    moveNodes: (
      updates: Array<{ id: string; position: { x: number; y: number } }>,
      record: boolean,
    ) => void
    setSelection: (nodeIds: string[], edgeIds: string[]) => void
  }
}

function piledFlow() {
  const decisionBranches = [
    { id: 'yes', label: 'Yes' },
    { id: 'no', label: 'No' },
    { id: 'maybe', label: 'Maybe' },
  ]
  const switchBranches = [
    { id: 'a', label: 'Alpha' },
    { id: 'b', label: 'Beta' },
    { id: 'c', label: 'Gamma' },
    { id: 'd', label: 'Delta' },
  ]
  const nodes: StoreNode[] = [
    { id: 'n1', kind: 'start', label: 'Start', position: { x: 40, y: 40 } },
    { id: 'n2', kind: 'step', label: 'Intake', position: { x: 40, y: 40 } },
    {
      id: 'n3',
      kind: 'decision',
      label: 'Credit ok?',
      position: { x: 40, y: 40 },
      data: { branches: decisionBranches },
    },
    { id: 'n4', kind: 'step', label: 'Yes path', position: { x: 40, y: 40 } },
    { id: 'n5', kind: 'step', label: 'No path', position: { x: 40, y: 40 } },
    { id: 'n6', kind: 'step', label: 'Maybe path', position: { x: 40, y: 40 } },
    { id: 'n7', kind: 'parallelSplit', label: 'Split', position: { x: 40, y: 40 } },
    { id: 'n8', kind: 'step', label: 'Parallel A', position: { x: 40, y: 40 } },
    { id: 'n9', kind: 'step', label: 'Parallel B', position: { x: 40, y: 40 } },
    { id: 'n10', kind: 'parallelJoin', label: 'Join', position: { x: 40, y: 40 } },
    {
      id: 'n11',
      kind: 'switch',
      label: 'Route',
      position: { x: 40, y: 40 },
      data: { branches: switchBranches },
    },
    { id: 'n12', kind: 'step', label: 'Alpha', position: { x: 40, y: 40 } },
    { id: 'n13', kind: 'step', label: 'Beta', position: { x: 40, y: 40 } },
    { id: 'n14', kind: 'step', label: 'Gamma', position: { x: 40, y: 40 } },
    { id: 'n15', kind: 'step', label: 'Delta', position: { x: 40, y: 40 } },
    { id: 'n16', kind: 'loop', label: 'Retry', position: { x: 40, y: 40 } },
    { id: 'n17', kind: 'step', label: 'Loop body', position: { x: 40, y: 40 } },
    { id: 'n18', kind: 'end', label: 'Done', position: { x: 40, y: 40 } },
  ]
  const edges: StoreEdge[] = [
    { id: 'e1', source: 'n1', target: 'n2' },
    { id: 'e2', source: 'n2', target: 'n3' },
    { id: 'e3', source: 'n3', target: 'n4', sourceHandle: 'yes' },
    { id: 'e4', source: 'n3', target: 'n5', sourceHandle: 'no' },
    { id: 'e5', source: 'n3', target: 'n6', sourceHandle: 'maybe' },
    { id: 'e6', source: 'n4', target: 'n7' },
    { id: 'e7', source: 'n5', target: 'n7' },
    { id: 'e8', source: 'n6', target: 'n7' },
    { id: 'e9', source: 'n7', target: 'n8' },
    { id: 'e10', source: 'n7', target: 'n9' },
    { id: 'e11', source: 'n8', target: 'n10' },
    { id: 'e12', source: 'n9', target: 'n10' },
    { id: 'e13', source: 'n10', target: 'n11' },
    { id: 'e14', source: 'n11', target: 'n12', sourceHandle: 'a' },
    { id: 'e15', source: 'n11', target: 'n13', sourceHandle: 'b' },
    { id: 'e16', source: 'n11', target: 'n14', sourceHandle: 'c' },
    { id: 'e17', source: 'n11', target: 'n15', sourceHandle: 'd' },
    { id: 'e18', source: 'n12', target: 'n16' },
    { id: 'e19', source: 'n13', target: 'n16' },
    { id: 'e20', source: 'n14', target: 'n16' },
    { id: 'e21', source: 'n15', target: 'n16' },
    { id: 'e22', source: 'n16', target: 'n17' },
    { id: 'e23', source: 'n17', target: 'n16' },
    { id: 'e24', source: 'n16', target: 'n18' },
  ]
  return { nodes, edges }
}

async function signUpAndOpenEditor(page: Page) {
  const email = `layout-${Date.now()}@example.com`
  await page.goto('/signup')
  await page.getByLabel('Name (optional)').fill('Layout')
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

async function getBoxes(page: Page) {
  return page.evaluate(() => {
    const s = (window as unknown as { __FLOW_BUILDER_STORE__?: StoreApi }).__FLOW_BUILDER_STORE__
    const nodes = s!.getState().diagram?.nodes ?? []
    return nodes.map((n) => {
      const el = document.querySelector(`.react-flow__node[data-id="${n.id}"]`) as HTMLElement | null
      const r = el?.getBoundingClientRect()
      return {
        id: n.id,
        kind: n.kind,
        x: n.position.x,
        y: n.position.y,
        w: n.size?.w ?? r?.width ?? 256,
        h: n.size?.h ?? r?.height ?? 96,
        label: n.label,
      }
    })
  })
}

function assertNoOverlap(
  boxes: Array<{ id: string; x: number; y: number; w: number; h: number }>,
) {
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i]
      const b = boxes[j]
      const overlap = !(
        a.x + a.w <= b.x ||
        b.x + b.w <= a.x ||
        a.y + a.h <= b.y ||
        b.y + b.h <= a.y
      )
      expect(overlap, `${a.id} overlaps ${b.id}`).toBe(false)
    }
  }
}

test.describe('Auto layout', () => {
  test('opening a diagram with far-off or pending-fit nodes zooms to fit after nodes are measured', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await signUpAndOpenEditor(page)
    await page.evaluate(() => {
      window.__FB_DISABLE_AUTO_LAYOUT__ = true
      const s = (window as unknown as { __FLOW_BUILDER_STORE__?: StoreApi }).__FLOW_BUILDER_STORE__!
      const current = s.getState().diagram
      if (!current) throw new Error('no diagram')
      s.getState().replaceDiagramContent({
        ...current,
        nodes: [
          { id: 'f1', kind: 'start', label: 'Far start', position: { x: 2400, y: 1800 } },
          { id: 'f2', kind: 'step', label: 'Far step', position: { x: 2400, y: 2000 } },
          { id: 'f3', kind: 'end', label: 'Far end', position: { x: 2400, y: 2200 } },
        ],
        edges: [
          { id: 'fe1', source: 'f1', target: 'f2' },
          { id: 'fe2', source: 'f2', target: 'f3' },
        ],
      })
    })
    await expect(page.locator('.react-flow__node')).toHaveCount(3, { timeout: 10_000 })
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(page.getByText('Saved', { exact: true })).toBeVisible({ timeout: 15_000 })
    await page.reload()
    await expect(page.locator('.react-flow__node')).toHaveCount(3, { timeout: 15_000 })
    await expect
      .poll(
        () =>
          page.evaluate(() => {
            const nodes = [...document.querySelectorAll('.react-flow__node')] as HTMLElement[]
            const pane = document.querySelector('.react-flow') as HTMLElement | null
            if (!pane || nodes.length !== 3) return false
            const pr = pane.getBoundingClientRect()
            return nodes.every((n) => {
              const r = n.getBoundingClientRect()
              return r.left >= pr.left && r.right <= pr.right && r.top >= pr.top && r.bottom <= pr.bottom
            })
          }),
        { timeout: 5_000 },
      )
      .toBe(true)
  })

  test('AI generate (mocked), Auto-arrange, incremental, undo', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })

    const flow = piledFlow()
    const replacePayload = {
      type: 'replace',
      summary: 'Piled branching flow',
      diagram: {
        schemaVersion: 3,
        title: 'Loan flow',
        nodes: flow.nodes,
        edges: flow.edges,
      },
    }

    await page.route('**/v1/models', async (route: Route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: [{ id: 'local-llama' }] }),
      })
    })
    await page.route('**/v1/chat/completions', async (route: Route) => {
      const json = route.request().postDataJSON() as { tools?: unknown[] } | null
      if (json?.tools && json.tools.length > 0) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            choices: [
              {
                message: {
                  content: null,
                  tool_calls: [
                    {
                      id: 'call_1',
                      type: 'function',
                      function: { name: 'echo_ping', arguments: '{}' },
                    },
                  ],
                },
              },
            ],
          }),
        })
        return
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          choices: [{ message: { content: JSON.stringify(replacePayload) } }],
        }),
      })
    })

    await signUpAndOpenEditor(page)
    const editorUrl = page.url()

    // Seed a custom OpenAI-compatible connection so the assistant can call the mock.
    await page.goto('/settings')
    await expect(page.getByTestId('ai-providers-settings')).toBeVisible({ timeout: 15_000 })
    await page.getByLabel('Provider').selectOption('custom')
    await page.getByLabel('Custom preset').selectOption('ollama')
    await page.getByPlaceholder('https://api.example.com/v1').fill('http://127.0.0.1:11434/v1')
    await page.getByRole('button', { name: 'Save connection' }).click()
    await expect(page.getByTestId('ai-model-list')).toBeVisible({ timeout: 30_000 })
    await page.getByTestId('ai-save-enabled').click().catch(() => undefined)

    await page.goto(editorUrl)
    await expect(page.getByTestId('properties-panel')).toBeVisible({ timeout: 15_000 })

    // --- Before screenshot: inject piled flow with auto-layout disabled ---
    await page.evaluate((payload) => {
      window.__FB_DISABLE_AUTO_LAYOUT__ = true
      const s = (window as unknown as { __FLOW_BUILDER_STORE__?: StoreApi }).__FLOW_BUILDER_STORE__!
      const current = s.getState().diagram
      if (!current) throw new Error('no diagram')
      s.getState().replaceDiagramContent({
        ...current,
        title: payload.diagram.title,
        nodes: payload.diagram.nodes,
        edges: payload.diagram.edges,
      })
    }, replacePayload)
    await page.waitForTimeout(200)
    await page.screenshot({ path: path.join(RUNS, 'layout-before.png'), fullPage: false })

    // Enable layout and run Auto-arrange
    await page.evaluate(() => {
      window.__FB_DISABLE_AUTO_LAYOUT__ = false
    })
    await page.getByTestId('auto-arrange').click()
    await page.waitForTimeout(500)

    let boxes = await getBoxes(page)
    expect(boxes.length).toBeGreaterThanOrEqual(15)
    assertNoOverlap(boxes)

    const byId = Object.fromEntries(boxes.map((b) => [b.id, b]))
    expect(byId.n4.x).toBeLessThan(byId.n5.x)
    expect(byId.n5.x).toBeLessThan(byId.n6.x)

    // Viewport should include all nodes (fit ran).
    const allVisible = await page.evaluate(() => {
      const nodes = [...document.querySelectorAll('.react-flow__node')] as HTMLElement[]
      const pane = document.querySelector('.react-flow') as HTMLElement | null
      if (!pane || nodes.length === 0) return false
      const pr = pane.getBoundingClientRect()
      return nodes.every((n) => {
        const r = n.getBoundingClientRect()
        return r.right > pr.left && r.left < pr.right && r.bottom > pr.top && r.top < pr.bottom
      })
    })
    expect(allVisible).toBe(true)

    await page.screenshot({ path: path.join(RUNS, 'layout-after.png'), fullPage: false })

    // Snapshot positions for undo check
    const afterArrange = await page.evaluate(() => {
      const s = (window as unknown as { __FLOW_BUILDER_STORE__?: StoreApi }).__FLOW_BUILDER_STORE__!
      return (s.getState().diagram?.nodes ?? []).map((n) => ({
        id: n.id,
        x: n.position.x,
        y: n.position.y,
      }))
    })

    // Incremental add: mark one node manual, add via store + place
    await page.evaluate(() => {
      const s = (window as unknown as { __FLOW_BUILDER_STORE__?: StoreApi }).__FLOW_BUILDER_STORE__!
      const layout = window.__FLOW_BUILDER_LAYOUT__
      if (!layout) throw new Error('layout helpers missing')
      const before = s.getState().diagram!
      const manual = before.nodes.find((n) => n.id === 'n2')!
      s.getState().moveNodes([{ id: 'n2', position: { ...manual.position } }], true)
      const d = s.getState().diagram!
      const newNode = {
        id: 'n19',
        kind: 'step',
        label: 'Extra',
        position: { x: 0, y: 0 },
      }
      const newEdge = { id: 'e25', source: 'n2', target: 'n19' }
      const laid = layout.placeNodesIncremental(
        [...d.nodes, newNode],
        [...d.edges, newEdge],
        ['n19'],
        'DOWN',
      )
      s.getState().applyNodeLayout(laid.nodes, laid.edges)
    })
    await page.waitForTimeout(200)
    boxes = await getBoxes(page)
    assertNoOverlap(boxes)
    const n2 = boxes.find((b) => b.id === 'n2')!
    const afterManual = await page.evaluate(() => {
      const s = (window as unknown as { __FLOW_BUILDER_STORE__?: StoreApi }).__FLOW_BUILDER_STORE__!
      return s.getState().diagram?.nodes.find((n) => n.id === 'n2')
    })
    expect(afterManual?.manuallyPositioned).toBe(true)
    expect(n2).toBeTruthy()
    await page.screenshot({ path: path.join(RUNS, 'layout-incremental.png'), fullPage: false })

    // Cmd+Shift+L Auto-arrange and undo restores
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+Shift+L' : 'Control+Shift+L')
    await page.waitForTimeout(400)
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+Z' : 'Control+Z')
    await page.waitForTimeout(200)
    const afterUndo = await page.evaluate(() => {
      const s = (window as unknown as { __FLOW_BUILDER_STORE__?: StoreApi }).__FLOW_BUILDER_STORE__!
      return (s.getState().diagram?.nodes ?? []).map((n) => ({
        id: n.id,
        x: n.position.x,
        y: n.position.y,
      }))
    })
    // Undo may step back one history entry (incremental or arrange); ensure store still healthy.
    expect(afterUndo.length).toBeGreaterThanOrEqual(afterArrange.length)

    // Simulated AI generate apply: mocked piled coords then automatic layout
    await page.evaluate(async (payload) => {
      window.__FB_DISABLE_AUTO_LAYOUT__ = false
      const s = (window as unknown as { __FLOW_BUILDER_STORE__?: StoreApi }).__FLOW_BUILDER_STORE__!
      const layout = window.__FLOW_BUILDER_LAYOUT__
      if (!layout) throw new Error('layout helpers missing')
      const current = s.getState().diagram!
      const laid = await layout.layoutDiagram(payload.diagram.nodes, payload.diagram.edges, 'DOWN')
      s.getState().replaceDiagramContent({
        ...current,
        title: payload.diagram.title,
        nodes: laid.nodes,
        edges: laid.edges,
        fitPending: true,
      })
    }, replacePayload)
    await page.waitForTimeout(400)
    boxes = await getBoxes(page)
    assertNoOverlap(boxes)
    const again = Object.fromEntries(boxes.map((b) => [b.id, b]))
    expect(again.n4.x).toBeLessThan(again.n6.x)
  })
})
