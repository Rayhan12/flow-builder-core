import { expect, test } from '@playwright/test'

test.describe('Auth split layout', () => {
  test('sign in shows split layout and password toggle', async ({ page }) => {
    await page.goto('/login')
    await expect(page.getByTestId('auth-split')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeVisible()
    await expect(page.getByRole('complementary', { name: 'Product overview' })).toBeVisible()

    const password = page.locator('input[name="password"]')
    await expect(password).toHaveAttribute('type', 'password')
    await page.getByRole('button', { name: 'Show password' }).click()
    await expect(password).toHaveAttribute('type', 'text')
    await page.getByRole('button', { name: 'Hide password' }).click()
    await expect(password).toHaveAttribute('type', 'password')
  })

  test('forgot password sends a reset email on the emulator', async ({ page }) => {
    const email = `reset-${Date.now()}@example.com`
    const password = 'test-pass-123'

    await page.goto('/signup')
    await page.getByLabel('Email').fill(email)
    await page.locator('input[name="password"]').fill(password)
    await page.getByRole('button', { name: 'Create account' }).click()
    await expect(page.getByRole('heading', { level: 1 })).toContainText(
      /Good (morning|afternoon|evening)/,
      { timeout: 15_000 },
    )

    await page.getByRole('button', { name: 'Sign out' }).click()
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible({
      timeout: 15_000,
    })

    await page.getByLabel('Email').fill(email)
    await page.getByRole('button', { name: 'Forgot password?' }).click()
    await expect(page.getByRole('status')).toContainText(/reset email sent/i, {
      timeout: 10_000,
    })
  })

  test('sign up shows split layout and Google button', async ({ page }) => {
    await page.goto('/signup')
    await expect(page.getByTestId('auth-split')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Create account' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Show password' })).toBeVisible()
  })

  test('showcase hides below 900px', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/login')
    await expect(page.getByTestId('auth-split')).toBeVisible()
    await expect(page.getByRole('complementary', { name: 'Product overview' })).toBeHidden()
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
  })
})
