import { expect, test, type Page, type Route } from '@playwright/test'

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

function modelsPayload(extra?: { id: string }[]) {
  return {
    data: [
      { id: 'local-llama' },
      { id: 'local-mistral' },
      { id: 'local-blocked' },
      ...(extra ?? []),
    ],
  }
}

test.describe('AI providers', () => {
  test('save key, enable models, no /models after reload; refresh marks New', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await signUp(page)

    let modelsHits = 0
    let listPhase: 'initial' | 'refresh' = 'initial'

    await page.route('**/v1/models', async (route: Route) => {
      modelsHits += 1
      const body =
        listPhase === 'refresh'
          ? modelsPayload([{ id: 'local-new' }])
          : modelsPayload()
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(body),
      })
    })
    await page.route('**/v1/chat/completions', async (route) => {
      const req = route.request()
      const json = req.postDataJSON() as {
        model?: string
        tools?: unknown[]
        messages?: unknown[]
      } | null
      if (json?.model === 'local-blocked') {
        await route.fulfill({
          status: 403,
          contentType: 'application/json',
          body: JSON.stringify({ error: { message: 'no access' } }),
        })
        return
      }
      // Tool-support probe and agent chat: return a tool call when tools are present.
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
                      function: { name: 'echo_ping', arguments: '{"ok":true}' },
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
          choices: [{ message: { content: 'Hello from the agent.' } }],
        }),
      })
    })

    await page.goto('/settings')
    await expect(page.getByTestId('ai-providers-settings')).toBeVisible({ timeout: 15_000 })

    await page.getByLabel('Provider').selectOption('custom')
    await page.getByLabel('Custom preset').selectOption('ollama')
    await page.getByPlaceholder('https://api.example.com/v1').fill('http://127.0.0.1:11434/v1')
    await page.getByRole('button', { name: 'Save connection' }).click()

    await expect(page.getByTestId('ai-model-list')).toBeVisible({ timeout: 30_000 })
    await expect(page.getByTestId('ai-model-row-local-llama')).toBeVisible()
    await expect(page.getByTestId('ai-model-row-local-mistral')).toBeVisible()
    await expect(page.getByTestId('ai-model-row-local-blocked')).toContainText(/No access|Usable/i)

    const hitsAfterSave = modelsHits
    expect(hitsAfterSave).toBeGreaterThanOrEqual(1)

    // Uncheck one usable model, then save enabled.
    const mistralBox = page.getByTestId('ai-model-row-local-mistral').getByRole('checkbox')
    if (await mistralBox.isChecked()) {
      await mistralBox.uncheck()
    }
    await page.getByTestId('ai-save-enabled').click()
    await expect(page.getByText(/Saved .* enabled model/i)).toBeVisible()

    await page.screenshot({
      path: '.cursor-runs/models-list-after-save.png',
      fullPage: true,
    })

    // Reload: /models must not be hit again until Refresh.
    modelsHits = 0
    await page.reload()
    await expect(page.getByTestId('ai-providers-settings')).toBeVisible({ timeout: 15_000 })
    await expect(page.getByTestId('ai-model-list')).toBeVisible()
    expect(modelsHits).toBe(0)

    // Open AI panel switcher on home and assert only enabled models.
    await page.goto('/')
    await expect(page.getByTestId('ai-model-switcher')).toBeVisible({ timeout: 15_000 })
    await page.getByTestId('ai-model-switcher').getByRole('button').click()
    await expect(page.getByRole('option', { name: /local-llama/i })).toBeVisible()
    await expect(page.getByRole('option', { name: /local-mistral/i })).not.toBeVisible()
    expect(modelsHits).toBe(0)

    // Send a chat (completions only).
    const composer = page.getByPlaceholder(/Ask the agent/i)
    if (await composer.isVisible()) {
      await composer.fill('hello')
      await page.getByRole('button', { name: /^Send$/i }).click()
      await page.waitForTimeout(500)
    }
    expect(modelsHits).toBe(0)

    await page.screenshot({
      path: '.cursor-runs/models-switcher-enabled.png',
      fullPage: true,
    })

    // Refresh models: one new /models call, prior selection preserved, New badge.
    await page.goto('/settings')
    await expect(page.getByTestId('ai-providers-settings')).toBeVisible({ timeout: 15_000 })
    listPhase = 'refresh'
    const beforeRefresh = modelsHits
    await page.getByTestId('ai-refresh-models').click()
    await expect(page.getByText(/Refreshed .* models/i)).toBeVisible({ timeout: 30_000 })
    expect(modelsHits).toBe(beforeRefresh + 1)

    await expect(page.getByTestId('ai-model-row-local-new')).toBeVisible()
    await expect(page.getByTestId('ai-model-row-local-new').getByTestId('ai-model-new')).toBeVisible()
    await expect(page.getByTestId('ai-model-row-local-new').getByRole('checkbox')).not.toBeChecked()
    // Prior enabled (llama) still checked; mistral still unchecked.
    await expect(page.getByTestId('ai-model-row-local-llama').getByRole('checkbox')).toBeChecked()
    await expect(page.getByTestId('ai-model-row-local-mistral').getByRole('checkbox')).not.toBeChecked()
    await expect(page.getByTestId('ai-last-checked')).toBeVisible()

    await page.screenshot({
      path: '.cursor-runs/models-refresh.png',
      fullPage: true,
    })
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
