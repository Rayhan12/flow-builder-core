import { expect, test, type Page } from '@playwright/test'

async function signUp(page: Page) {
  const email = `aiprov-${Date.now()}@example.com`
  const password = 'test-pass-123'
  await page.goto('/signup')
  await page.getByLabel('Name (optional)').fill('AI Prov')
  await page.getByLabel('Email').fill(email)
  await page.locator('input[name="password"]').fill(password)
  await page.getByRole('button', { name: 'Create account' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toContainText(/Good (morning|afternoon|evening)/, {
    timeout: 15_000,
  })
}

test.describe('AI providers', () => {
  test('add a Custom provider with mocked models and pick it in the switcher', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await signUp(page)

    await page.route('**/v1/models', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: [{ id: 'local-llama' }, { id: 'local-mistral' }],
        }),
      })
    })
    await page.route('**/v1/chat/completions', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          choices: [{ message: { content: 'yes' } }],
        }),
      })
    })

    await page.goto('/settings')
    await expect(page.getByTestId('ai-providers-settings')).toBeVisible({ timeout: 15_000 })

    await page.getByLabel('Provider').selectOption('custom')
    await page.getByLabel('Custom preset').selectOption('ollama')
    await page.getByPlaceholder('https://api.example.com/v1').fill('http://127.0.0.1:11434/v1')
    await page.getByRole('button', { name: 'Save connection' }).click()

    await expect(page.getByText(/Checked .* models/i)).toBeVisible({ timeout: 20_000 })
    await expect(page.getByTestId('ai-providers-settings').getByText('local-llama')).toBeVisible()

    await page.screenshot({ path: '.cursor-runs/ai-providers-settings.png', fullPage: true })

    const switcher = page.getByTestId('ai-model-switcher')
    await expect(switcher).toBeVisible()
    await switcher.getByRole('button').click()
    await expect(page.getByRole('option', { name: /local-mistral/i })).toBeVisible()
    await page.getByRole('option', { name: /local-mistral/i }).click()
    await expect(switcher.getByText('local-mistral')).toBeVisible()

    await page.screenshot({ path: '.cursor-runs/ai-model-switcher.png', fullPage: true })
  })

  test('missing key card lists provider get-a-key links', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await signUp(page)
    await page.goto('/')

    const card = page.getByTestId('ai-missing-key')
    await expect(card).toBeVisible({ timeout: 15_000 })
    await expect(card.getByRole('link', { name: /Google Gemini/i })).toBeVisible()
    await expect(card.getByRole('link', { name: /OpenRouter/i })).toBeVisible()
    await expect(card.getByRole('link', { name: /Open Settings/i })).toBeVisible()

    await page.screenshot({ path: '.cursor-runs/ai-missing-key.png', fullPage: true })
  })
})
