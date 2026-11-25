import { expect, test, type Page } from '@playwright/test'

async function signUp(page: Page, label: string) {
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
  return email
}

test.describe('Dashboard navigation and sidebar', () => {
  test('dashboard to project to diagram with breadcrumbs', async ({ page }) => {
    await signUp(page, 'Nav Tester')

    await expect(page.getByRole('navigation', { name: 'Breadcrumb' })).toContainText('Home')
    await page.locator('.project-card-link', { hasText: 'My first project' }).click()
    await expect(page).toHaveURL(/\/p\/[^/]+$/)
    await expect(page.getByRole('navigation', { name: 'Breadcrumb' })).toContainText('My first project')

    await page.getByRole('button', { name: 'New diagram' }).first().click()
    await expect(page).toHaveURL(/\/p\/[^/]+\/d\/[^/]+$/, { timeout: 15_000 })
    const crumbs = page.getByRole('navigation', { name: 'Breadcrumb' })
    await expect(crumbs).toContainText('Home')
    await expect(crumbs).toContainText('My first project')
    await expect(crumbs).toContainText('Untitled diagram')
  })

  test('sidebar rail toggle by button and shortcut, persisted after reload', async ({ page }) => {
    await signUp(page, 'Rail Tester')

    const nav = page.getByRole('complementary', { name: 'App navigation' })
    await expect(nav).toBeVisible()
    await expect(nav).not.toHaveClass(/is-rail/)

    await nav.getByRole('button', { name: /Collapse navigation|Expand navigation/ }).click()
    await expect(nav).toHaveClass(/is-rail/)

    await page.reload()
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/Good (morning|afternoon|evening)/, {
      timeout: 15_000,
    })
    await expect(page.getByRole('complementary', { name: 'App navigation' })).toHaveClass(/is-rail/)

    await page.keyboard.press('[')
    await expect(page.getByRole('complementary', { name: 'App navigation' })).not.toHaveClass(/is-rail/)

    const modifier = process.platform === 'darwin' ? 'Meta' : 'Control'
    await page.keyboard.press(`${modifier}+\\`)
    await expect(page.getByRole('complementary', { name: 'App navigation' })).toHaveClass(/is-rail/)
  })

  test('palette drag and drop still adds a node where dropped', async ({ page }) => {
    await signUp(page, 'Drop Nav')
    await page.locator('.project-card-link', { hasText: 'My first project' }).click()
    await page.getByRole('button', { name: 'New diagram' }).first().click()
    await page.waitForURL(/\/p\/[^/]+\/d\//, { timeout: 15_000 })
    await expect(page.getByLabel('Node palette')).toBeVisible({ timeout: 15_000 })

    await page.evaluate(() => {
      const item = [...document.querySelectorAll('.palette-item')].find((el) =>
        el.textContent?.includes('Step'),
      )
      const canvas = document.querySelector('.editor-canvas')
      if (!item || !canvas) throw new Error('palette item or canvas missing')
      const rect = canvas.getBoundingClientRect()
      const clientX = rect.left + rect.width / 2
      const clientY = rect.top + rect.height / 2
      const dt = new DataTransfer()
      item.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: dt }))
      canvas.dispatchEvent(
        new DragEvent('dragover', { bubbles: true, cancelable: true, clientX, clientY, dataTransfer: dt }),
      )
      canvas.dispatchEvent(
        new DragEvent('drop', { bubbles: true, cancelable: true, clientX, clientY, dataTransfer: dt }),
      )
      item.dispatchEvent(new DragEvent('dragend', { bubbles: true, cancelable: true, dataTransfer: dt }))
    })

    await expect(page.locator('.react-flow__node')).toHaveCount(1)
    await expect(page.locator('.react-flow__node').first()).toBeVisible()
  })
})
