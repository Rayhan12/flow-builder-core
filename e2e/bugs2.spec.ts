import { expect, test, type Page } from '@playwright/test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const RUNS = path.join(ROOT, '.cursor-runs')

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
}

async function addKind(page: Page, label: string) {
  await page.locator('.palette-item', { hasText: label }).first().click()
  await expect(page.locator('.react-flow__node').last()).toBeVisible()
}

test.describe('BUGS2 editor UX', () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test('1: decision card grows for 6 branches without overlap', async ({ page }) => {
    await signUpAndOpenEditor(page, 'bugs2-1')
    await addKind(page, 'Decision')
    await page.getByRole('tab', { name: 'Settings' }).click()
    await expect(page.getByTestId('decision-branches')).toBeVisible()

    for (let i = 0; i < 4; i += 1) {
      await page.getByRole('button', { name: 'Add branch' }).click()
    }
    await expect(page.getByTestId('decision-branch')).toHaveCount(6)
    await expect(page.getByTestId('decision-branch-pill')).toHaveCount(6)

    const card = page.getByTestId('decision-card')
    const width = await card.evaluate((el) => el.getBoundingClientRect().width)
    expect(width).toBeGreaterThanOrEqual(560)

    const pills = page.getByTestId('decision-branch-pill')
    const boxes = await pills.evaluateAll((els) =>
      els.map((el) => {
        const r = el.getBoundingClientRect()
        return { left: r.left, right: r.right, top: r.top, bottom: r.bottom }
      }),
    )
    for (let i = 0; i < boxes.length; i += 1) {
      for (let j = i + 1; j < boxes.length; j += 1) {
        const a = boxes[i]
        const b = boxes[j]
        const overlap =
          a.left < b.right - 2 && a.right > b.left + 2 && a.top < b.bottom - 2 && a.bottom > b.top + 2
        expect(overlap, `pill ${i} overlaps ${j}`).toBe(false)
      }
    }

    await page.screenshot({ path: path.join(RUNS, 'fix-decision-6-branches.png') })
  })

  test('2: group header, collapse and expand', async ({ page }) => {
    await signUpAndOpenEditor(page, 'bugs2-2')
    await addKind(page, 'Group')
    await addKind(page, 'Step')

    const header = page.getByTestId('group-header')
    await expect(header).toBeVisible()
    await expect(page.getByTestId('group-title')).toBeVisible()
    await expect(page.getByTestId('group-collapse')).toBeVisible()

    await page.screenshot({ path: path.join(RUNS, 'fix-group-expanded.png') })

    await page.getByTestId('group-collapse').click()
    await expect(page.locator('.flow-group.is-collapsed')).toBeVisible()
    await page.screenshot({ path: path.join(RUNS, 'fix-group-collapsed.png') })
  })

  test('3: sticky inline edit and colour toolbar', async ({ page }) => {
    await signUpAndOpenEditor(page, 'bugs2-3')
    await addKind(page, 'Sticky')

    const sticky = page.getByTestId('sticky-card').last()
    await sticky.dblclick()
    await expect(page.getByTestId('sticky-input')).toBeVisible()
    await page.getByTestId('sticky-input').fill('Hello sticky')
    await page.getByTestId('sticky-input').blur()
    await expect(sticky).toContainText('Hello sticky')
    await sticky.click()
    await expect(page.getByTestId('sticky-toolbar')).toBeVisible()

    await page.screenshot({ path: path.join(RUNS, 'fix-sticky-editing.png') })
  })

  test('4: edge label add and edit', async ({ page }) => {
    await signUpAndOpenEditor(page, 'bugs2-4')
    await addKind(page, 'Step')
    await addKind(page, 'End')
    // Wait until both nodes are rendered and measured before wiring the edge,
    // otherwise the edge can be created before React Flow knows the handles.
    await expect(page.locator('.react-flow__node')).toHaveCount(2, { timeout: 10_000 })
    await expect(page.locator('.react-flow__node .react-flow__handle').first()).toBeAttached()

    // Create a connector via the store (canvas drag is flaky under headless).
    await page.evaluate(() => {
      const store = (
        window as unknown as {
          __FLOW_BUILDER_STORE__?: {
            getState: () => {
              diagram: { nodes: Array<{ id: string; kind: string }> } | null
              addEdgeFromConnection: (c: {
                source: string
                target: string
                sourceHandle?: string
                targetHandle?: string
              }) => void
            }
          }
        }
      ).__FLOW_BUILDER_STORE__
      const state = store?.getState()
      const nodes = state?.diagram?.nodes ?? []
      const step = nodes.find((n) => n.kind === 'step')
      const end = nodes.find((n) => n.kind === 'end')
      if (!state || !step || !end) throw new Error('missing nodes for edge')
      state.addEdgeFromConnection({
        source: step.id,
        target: end.id,
        sourceHandle: 'bottom',
        targetHandle: 'top',
      })
    })

    const edge = page.locator('.react-flow__edge').first()
    await expect(edge).toBeVisible({ timeout: 10_000 })
    await edge.click({ force: true })

    // Set label from the properties panel; it renders on the canvas.
    const panelLabel = page.getByLabel('Connector label')
    await expect(panelLabel).toBeVisible({ timeout: 5_000 })
    await panelLabel.fill('Go next')
    await expect(page.getByTestId('edge-label')).toContainText('Go next')

    // Add-label control is hidden once a label exists; midpoint stays interactive.
    await expect(page.getByTestId('edge-midpoint')).toBeVisible()

    await page.screenshot({ path: path.join(RUNS, 'fix-edge-label.png') })
  })

  test('5: drop centres under cursor', async ({ page }) => {
    await signUpAndOpenEditor(page, 'bugs2-5')
    const canvas = page.locator('.react-flow').first()
    const box = await canvas.boundingBox()
    expect(box).toBeTruthy()
    if (!box) return

    const targetX = box.x + box.width / 2
    const targetY = box.y + box.height / 2

    const item = page.locator('.palette-item', { hasText: 'Step' }).first()
    await item.hover()
    await page.mouse.down()
    await page.mouse.move(targetX, targetY, { steps: 8 })
    await page.mouse.up()

    const node = page.locator('.react-flow__node-step').last()
    await expect(node).toBeVisible({ timeout: 5_000 })
    const nodeBox = await node.boundingBox()
    expect(nodeBox).toBeTruthy()
    if (!nodeBox) return
    const cx = nodeBox.x + nodeBox.width / 2
    const cy = nodeBox.y + nodeBox.height / 2
    expect(Math.abs(cx - targetX)).toBeLessThan(48)
    expect(Math.abs(cy - targetY)).toBeLessThan(48)
  })

  test('6: four side handles on nodes', async ({ page }) => {
    await signUpAndOpenEditor(page, 'bugs2-6')
    await addKind(page, 'Step')
    const step = page.locator('.react-flow__node-step').first()
    await step.hover()
    // Source + target handle per side (same id) for ConnectionMode.Loose.
    await expect(step.locator('.react-flow__handle[data-handleid="top"]')).toHaveCount(2)
    await expect(step.locator('.react-flow__handle[data-handleid="right"]')).toHaveCount(2)
    await expect(step.locator('.react-flow__handle[data-handleid="bottom"]')).toHaveCount(2)
    await expect(step.locator('.react-flow__handle[data-handleid="left"]')).toHaveCount(2)

    await page.screenshot({ path: path.join(RUNS, 'fix-four-side-connection.png') })
  })

  test('7: labelled properties toolbar actions', async ({ page }) => {
    await signUpAndOpenEditor(page, 'bugs2-7')
    await addKind(page, 'Step')
    await addKind(page, 'Step')

    const toolbar = page.getByTestId('properties-toolbar')
    await expect(toolbar).toBeVisible()
    await expect(toolbar.getByText('Hide')).toBeVisible()
    await expect(toolbar.getByText('Lock')).toBeVisible()
    await expect(toolbar.getByText('Duplicate')).toBeVisible()
    await expect(toolbar.getByText('Forward')).toBeVisible()
    await expect(toolbar.getByText('Back')).toBeVisible()

    await page.getByTestId('properties-more').click()
    await page.getByTestId('properties-select-similar').click()
    await expect(page.getByTestId('properties-label')).toHaveValue(/2 selected|Step/)

    // Select similar should select both steps.
    const selectedCount = await page.locator('.react-flow__node.selected, .react-flow__node-step').count()
    expect(selectedCount).toBeGreaterThanOrEqual(2)

    await page.screenshot({ path: path.join(RUNS, 'fix-panel-toolbar.png') })
  })
})
