import path from 'node:path'
import { expect, test, type Page } from '@playwright/test'

const RUNS = path.join(process.cwd(), '.cursor-runs')

async function signUp(page: Page) {
  const email = `mcp-${Date.now()}@example.com`
  const password = 'test-pass-123'
  await page.goto('/signup')
  await page.getByLabel('Name (optional)').fill('MCP User')
  await page.getByLabel('Email').fill(email)
  await page.locator('input[name="password"]').fill(password)
  await page.getByRole('button', { name: 'Create account' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toContainText(/Good (morning|afternoon|evening)/, {
    timeout: 15_000,
  })
}

test.describe('MCP connect settings', () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test('create a named token once and show client snippets', async ({ page }) => {
    await signUp(page)
    await page.goto('/settings')

    const section = page.getByTestId('mcp-connect-section')
    await expect(section).toBeVisible({ timeout: 15_000 })
    await expect(section.getByRole('heading', { name: 'Connect your AI agent' })).toBeVisible()
    await expect(page.getByTestId('mcp-url')).toHaveValue(/\/api\/mcp/)

    await page.screenshot({ path: path.join(RUNS, 'mcp-settings-tokens.png'), fullPage: true })

    await page.getByTestId('mcp-token-name').fill('Cursor')
    await page.getByTestId('mcp-create-token').click()

    const created = page.getByTestId('mcp-token-created')
    await expect(created).toBeVisible({ timeout: 15_000 })
    await expect(created.getByText(/Copy it now/i)).toBeVisible()
    const tokenValue = page.getByTestId('mcp-token-value')
    await expect(tokenValue).toHaveValue(/^fbmcp_/)
    await expect(page.getByTestId('mcp-cursor-snippet')).toContainText('Authorization')
    await expect(page.getByTestId('mcp-claude-snippet')).toContainText('mcp-remote')
    await expect(page.getByTestId('mcp-token-row')).toContainText('Cursor')

    await page.screenshot({ path: path.join(RUNS, 'mcp-token-created.png'), fullPage: true })
  })
})
