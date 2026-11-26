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

async function seedStickyLongText(page: Page, text: string) {
  await addKind(page, 'Sticky')
  const sticky = page.getByTestId('sticky-card').last()
  await sticky.dblclick()
  const input = page.getByTestId('sticky-input')
  await expect(input).toBeVisible()
  await input.fill(text)
  await page.locator('.editor-canvas').click({ position: { x: 20, y: 20 } })
}

test.describe('EDITOR3 text, shapes, palette, collapse', () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test('long sticky shows full text and grows', async ({ page }) => {
    await signUpAndOpenEditor(page, 'ed3-sticky')
    const longText = Array.from({ length: 12 }, (_, i) => `Line ${i + 1}: sticky notes must show everything.`).join(
      '\n',
    )
    await seedStickyLongText(page, longText)

    const stickyText = page.getByTestId('sticky-text')
    await expect(stickyText).toBeVisible()
    await expect(stickyText).toContainText('Line 1:')
    await expect(stickyText).toContainText('Line 12:')

    const height = await page
      .getByTestId('sticky-card')
      .last()
      .evaluate((el) => el.getBoundingClientRect().height)
    expect(height).toBeGreaterThan(160)

    await page.screenshot({ path: path.join(RUNS, 'fix-long-sticky.png') })
  })

  test('node description expands inline with Show more', async ({ page }) => {
    await signUpAndOpenEditor(page, 'ed3-expand')
    await addKind(page, 'Step')

    const longDesc =
      'This is a long description that should clamp to two lines on the canvas until the user expands it. ' +
      'It continues with more detail about the step so the overflow detector has enough text to work with. ' +
      'Final sentence keeps the block tall enough for Show more.'

    await page.getByRole('tab', { name: 'Notes' }).click()
    await page.locator('.side-panel textarea').first().fill(longDesc)
    const desc = page.locator('.expandable-text-body').first()
    await expect(desc).toBeVisible()
    const toggle = page.locator('.expandable-text-toggle').first()
    await expect(toggle).toBeVisible({ timeout: 5_000 })
    await expect(toggle).toContainText('Show more')
    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-expanded', 'true')
    await expect(toggle).toContainText('Show less')
    await expect(desc).toContainText('Final sentence')

    await page.screenshot({ path: path.join(RUNS, 'fix-expanded-node.png') })
  })

  test('each shape renders and can swap', async ({ page }) => {
    await signUpAndOpenEditor(page, 'ed3-shapes')

    const shapes = [
      'Rectangle',
      'Rounded',
      'Diamond',
      'Ellipse',
      'Parallelogram',
      'Cylinder',
      'Document',
      'Hexagon',
      'Triangle',
    ]

    for (const label of shapes) {
      await page.getByTestId('palette-search').fill(label)
      await addKind(page, label)
    }

    await expect(page.getByTestId('shape-card')).toHaveCount(9)

    const last = page.getByTestId('shape-card').last()
    await last.click()
    await expect(page.getByTestId('swap-shape')).toBeVisible()
    const before = await last.getAttribute('data-shape')
    await page.getByTestId('swap-shape').selectOption(before === 'diamond' ? 'hexagon' : 'diamond')
    await expect(last).toHaveAttribute('data-shape', before === 'diamond' ? 'hexagon' : 'diamond')

    await page.screenshot({ path: path.join(RUNS, 'fix-shape-set.png') })
  })

  test('palette search finds new types and drag-drop works', async ({ page }) => {
    await signUpAndOpenEditor(page, 'ed3-palette')

    await page.getByTestId('palette-search').fill('Parallel')
    await expect(page.locator('.palette-item', { hasText: 'Parallel split' })).toBeVisible()
    await expect(page.locator('.palette-item', { hasText: 'Parallel join' })).toBeVisible()

    await page.getByTestId('palette-search').fill('Lookup')
    await expect(page.locator('.palette-item', { hasText: 'Lookup table' })).toBeVisible()

    await page.getByTestId('palette-search').fill('')
    await page.screenshot({ path: path.join(RUNS, 'fix-full-palette.png') })

    await page.getByTestId('palette-search').fill('Delay')
    await addKind(page, 'Delay')
    await page.getByTestId('palette-search').fill('Approval')
    await addKind(page, 'Approval')
    await page.getByTestId('palette-search').fill('Database')
    await addKind(page, 'Database')

    await expect(page.locator('.react-flow__node')).toHaveCount(3)

    // HTML5 drag-drop for a couple of new types
    for (const label of ['Loop', 'Notification']) {
      await page.getByTestId('palette-search').fill(label)
      await page.evaluate((itemLabel) => {
        const item = [...document.querySelectorAll('.palette-item')].find((el) =>
          el.textContent?.includes(itemLabel),
        )
        const canvas = document.querySelector('.editor-canvas')
        if (!item || !canvas) throw new Error('palette item or canvas missing')
        const rect = canvas.getBoundingClientRect()
        const clientX = rect.left + rect.width * 0.6
        const clientY = rect.top + rect.height * 0.55
        const dt = new DataTransfer()
        item.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: dt }))
        canvas.dispatchEvent(
          new DragEvent('drop', { bubbles: true, cancelable: true, clientX, clientY, dataTransfer: dt }),
        )
      }, label)
    }

    await expect(page.locator('.react-flow__node')).toHaveCount(5)
  })

  test('collapse animation toggles group state', async ({ page }) => {
    await signUpAndOpenEditor(page, 'ed3-collapse')
    await addKind(page, 'Group')
    await addKind(page, 'Step')

    const toggle = page.getByTestId('group-collapse')
    await expect(toggle).toHaveAttribute('aria-expanded', 'true')
    await page.screenshot({ path: path.join(RUNS, 'fix-collapse-pattern.png') })

    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-expanded', 'false')
    await expect(page.getByTestId('group-card')).toHaveClass(/is-collapsed/)

    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-expanded', 'true')
  })
})
