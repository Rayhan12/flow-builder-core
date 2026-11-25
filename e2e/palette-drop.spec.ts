import { expect, test, type Page } from '@playwright/test'

async function signUpAndOpenEditor(page: Page) {
  const email = `drop-${Date.now()}@example.com`
  const password = 'test-pass-123'

  await page.goto('/signup')
  await page.getByLabel('Name (optional)').fill('Drop Tester')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Create account' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toContainText(/Good (morning|afternoon|evening)/, {
    timeout: 15_000,
  })
  await page.locator('.project-card-link', { hasText: 'My first project' }).click({ timeout: 15_000 })
  await page.getByRole('button', { name: 'New diagram' }).first().click()
  await page.waitForURL(/\/p\/[^/]+\/d\//, { timeout: 15_000 })
  await expect(page.getByLabel('Node palette')).toBeVisible({ timeout: 15_000 })
}

/** Playwright dragTo does not reliably fire HTML5 drag events; dispatch them. */
async function html5DropPaletteItem(page: Page, label: string) {
  return page.evaluate((itemLabel) => {
    const item = [...document.querySelectorAll('.palette-item')].find((el) =>
      el.textContent?.includes(itemLabel),
    )
    const canvas = document.querySelector('.editor-canvas')
    if (!item || !canvas) throw new Error('palette item or canvas missing')

    const rect = canvas.getBoundingClientRect()
    const clientX = rect.left + rect.width / 2
    const clientY = rect.top + rect.height / 2

    const dt = new DataTransfer()
    item.dispatchEvent(
      new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: dt }),
    )
    canvas.dispatchEvent(
      new DragEvent('dragenter', {
        bubbles: true,
        cancelable: true,
        clientX,
        clientY,
        dataTransfer: dt,
      }),
    )
    canvas.dispatchEvent(
      new DragEvent('dragover', {
        bubbles: true,
        cancelable: true,
        clientX,
        clientY,
        dataTransfer: dt,
      }),
    )
    canvas.dispatchEvent(
      new DragEvent('drop', {
        bubbles: true,
        cancelable: true,
        clientX,
        clientY,
        dataTransfer: dt,
      }),
    )
    item.dispatchEvent(
      new DragEvent('dragend', { bubbles: true, cancelable: true, dataTransfer: dt }),
    )

    return {
      kind: dt.getData('application/flow-builder-kind') || dt.getData('text/plain'),
      clientX,
      clientY,
    }
  }, label)
}

test.describe('Palette drag and drop', () => {
  test('drag a palette item onto the canvas centre and render a visible node', async ({
    page,
  }) => {
    await signUpAndOpenEditor(page)
    await expect(page.getByText('Empty canvas')).toBeVisible()

    const before = await page.locator('.react-flow__node').count()
    const drop = await html5DropPaletteItem(page, 'Step')
    expect(drop.kind).toBe('step')

    await expect(page.locator('.react-flow__node')).toHaveCount(before + 1, { timeout: 5000 })
    const node = page.locator('.react-flow__node').first()
    await expect(node).toBeVisible()
    await expect(node).toHaveClass(/react-flow__node-step/)

    const box = await node.boundingBox()
    expect(box).toBeTruthy()
    expect(box!.width).toBeGreaterThan(100)
    expect(box!.height).toBeGreaterThan(40)

    // Dropped near the canvas centre (within a generous band of the viewport).
    const canvasBox = await page.locator('.editor-canvas').boundingBox()
    expect(canvasBox).toBeTruthy()
    const nodeCenterX = box!.x + box!.width / 2
    const nodeCenterY = box!.y + box!.height / 2
    expect(nodeCenterX).toBeGreaterThan(canvasBox!.x + canvasBox!.width * 0.25)
    expect(nodeCenterX).toBeLessThan(canvasBox!.x + canvasBox!.width * 0.75)
    expect(nodeCenterY).toBeGreaterThan(canvasBox!.y + canvasBox!.height * 0.15)
    expect(nodeCenterY).toBeLessThan(canvasBox!.y + canvasBox!.height * 0.85)
  })

  test('click-to-add still places a visible node', async ({ page }) => {
    await signUpAndOpenEditor(page)
    await page.locator('.palette-item', { hasText: 'Decision' }).first().click()
    const node = page.locator('.react-flow__node').first()
    await expect(node).toBeVisible({ timeout: 5000 })
    await expect(node).toHaveClass(/react-flow__node-decision/)
  })
})
