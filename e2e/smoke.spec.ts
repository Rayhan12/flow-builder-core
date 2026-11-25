import { expect, test } from '@playwright/test'

test.describe('Flow Builder smoke', () => {
  test('sign up, create a diagram, and add a node', async ({ page }) => {
    const email = `smoke-${Date.now()}@example.com`
    const password = 'test-pass-123'

    await page.goto('/signup')
    await expect(page.getByRole('heading', { name: 'Create account' })).toBeVisible()

    await page.getByLabel('Name (optional)').fill('Smoke Tester')
    await page.getByLabel('Email').fill(email)
    await page.locator('input[name="password"]').fill(password)
    await page.getByRole('button', { name: 'Create account' }).click()

    // Dashboard: greeting plus the default project card.
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/Good (morning|afternoon|evening), Smoke Tester/, {
      timeout: 15_000,
    })
    const projectCard = page.locator('.project-card-link', { hasText: 'My first project' })
    await expect(projectCard).toBeVisible({ timeout: 15_000 })
    await projectCard.click()

    // Project page: empty, then create a diagram and land in the editor.
    await expect(page).toHaveURL(/\/p\/[^/]+$/)
    await expect(page.getByRole('heading', { level: 1, name: 'My first project' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'No diagrams yet' })).toBeVisible()

    await page.getByRole('button', { name: 'New diagram' }).first().click()
    await expect(page).toHaveURL(/\/p\/[^/]+\/d\/[^/]+$/, { timeout: 15_000 })
    await expect(page.getByRole('button', { name: 'Untitled diagram' })).toBeVisible({
      timeout: 15_000,
    })
    await expect(page.getByText('Empty canvas')).toBeVisible()

    await page.locator('.palette-item', { hasText: 'Step' }).first().click()
    await expect(page.getByText('Empty canvas')).toHaveCount(0)
    await expect(page.locator('.react-flow__node')).toHaveCount(1)
    await expect(page.locator('.react-flow__node').first()).toBeVisible()
    await expect(page.locator('.side-panel input').first()).toHaveValue('Step')

    // The app nav rail sits beside the palette and expands with "[".
    const nav = page.getByRole('complementary', { name: 'App navigation' })
    await expect(nav).toHaveClass(/is-rail/)
    await page.keyboard.press('[')
    await expect(nav).not.toHaveClass(/is-rail/)
  })

  test('login page is reachable', async ({ page }) => {
    await page.goto('/login')
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible()
  })
})
