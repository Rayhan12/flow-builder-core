import { expect, test } from '@playwright/test'

test.describe('Flow Builder smoke', () => {
  test('sign up, create a diagram, and add a node', async ({ page }) => {
    const email = `smoke-${Date.now()}@example.com`
    const password = 'test-pass-123'

    await page.goto('/signup')
    await expect(page.getByRole('heading', { name: 'Create account' })).toBeVisible()

    await page.getByLabel('Name (optional)').fill('Smoke Tester')
    await page.getByLabel('Email').fill(email)
    await page.getByLabel('Password').fill(password)
    await page.getByRole('button', { name: 'Create account' }).click()

    await expect(page.getByRole('heading', { name: 'Your diagrams' })).toBeVisible({
      timeout: 15_000,
    })
    await expect(page.getByRole('heading', { name: 'No diagrams yet' })).toBeVisible()

    await page.getByRole('button', { name: 'New diagram' }).first().click()
    await expect(page.getByRole('button', { name: 'Untitled diagram' })).toBeVisible({
      timeout: 15_000,
    })
    await expect(page.getByText('Empty canvas')).toBeVisible()

    await page.locator('.palette-item', { hasText: 'Step' }).first().click()
    await expect(page.getByText('Empty canvas')).toHaveCount(0)
    await expect(page.locator('.react-flow__node')).toHaveCount(1)
    await expect(page.getByRole('heading', { name: 'Node' })).toBeVisible()
    await expect(page.locator('.side-panel input').first()).toHaveValue('Step')
  })

  test('login page is reachable', async ({ page }) => {
    await page.goto('/login')
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible()
  })
})
