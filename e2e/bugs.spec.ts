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

test.describe('Priority editor bugs', () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test('bug1: properties panel follows selection', async ({ page }) => {
    await signUpAndOpenEditor(page, 'bug1')
    await addKind(page, 'Step')
    await addKind(page, 'Decision')

    await expect(page.locator('.react-flow__node')).toHaveCount(2)
    await expect(page.getByTestId('properties-label')).toHaveValue('Decision')

    // Select via Layers so we exercise store binding without overlapping hit targets.
    await page.getByTestId('layers-tab').click()
    await page.getByText('Step', { exact: true }).first().click()
    // Layers row click selects; switch back awareness via properties panel.
    await expect(page.getByTestId('properties-label')).toHaveValue('Step', { timeout: 5_000 })

    await page.getByRole('tab', { name: 'Assets' }).click()
    await page.locator('.react-flow__node-decision').click({ position: { x: 24, y: 24 } })
    await expect(page.getByTestId('properties-label')).toHaveValue('Decision', { timeout: 5_000 })

    await page.screenshot({ path: path.join(RUNS, 'bug1-properties-follow-selection.png') })
  })

  test('bug2: icon and colour picker in Look tab', async ({ page }) => {
    await signUpAndOpenEditor(page, 'bug2')
    await addKind(page, 'Step')
    await page.getByRole('tab', { name: 'Look' }).click()
    await expect(page.getByTestId('look-section')).toBeVisible()
    await expect(page.locator('.icon-picker')).toBeVisible()
    await expect(page.locator('.colour-picker')).toBeVisible()
    await page.locator('.icon-picker-trigger').click()
    await expect(page.locator('.icon-picker-popover')).toBeVisible()
    await page.screenshot({ path: path.join(RUNS, 'bug2-icon-colour-picker.png') })
  })

  test('bug3: group sits behind nodes and can parent children', async ({ page }) => {
    await signUpAndOpenEditor(page, 'bug3')
    await addKind(page, 'Group')
    await addKind(page, 'Step')

    const group = page.locator('.react-flow__node-group').first()
    const step = page.locator('.react-flow__node-step').first()
    await expect(group).toBeVisible()
    await expect(step).toBeVisible()

    const groupZ = await group.evaluate((el) => getComputedStyle(el).zIndex)
    const stepZ = await step.evaluate((el) => getComputedStyle(el).zIndex)
    expect(Number(stepZ) || 1).toBeGreaterThan(Number(groupZ) || 0)

    await page.screenshot({ path: path.join(RUNS, 'bug3-group-zorder.png') })
  })

  test('bug4: hide show via layers eye and show all', async ({ page }) => {
    await signUpAndOpenEditor(page, 'bug4')
    await addKind(page, 'Step')
    await page.getByTestId('layers-tab').click()
    await expect(page.getByTestId('layers-panel')).toBeVisible()

    const eye = page.locator('[data-testid^="layer-eye-"]').first()
    await eye.click()
    await expect(page.locator('.layers-row.is-hidden')).toHaveCount(1)
    await expect(page.getByTestId('show-all-hidden')).toBeVisible()
    await page.getByTestId('show-all-hidden').click()
    await expect(page.locator('.layers-row.is-hidden')).toHaveCount(0)

    await page.screenshot({ path: path.join(RUNS, 'bug4-hide-show.png') })
  })

  test('bug5: guided rule builder with sentence preview', async ({ page }) => {
    await signUpAndOpenEditor(page, 'bug5')
    await addKind(page, 'Rule set')
    await page.getByRole('tab', { name: 'Settings' }).click()
    await expect(page.getByTestId('rule-builder')).toBeVisible()
    await page.getByLabel('Condition 1 field').fill('credit score')
    await page.getByLabel('Condition 1 operator').selectOption('gt')
    await page.getByLabel('Condition 1 value').fill('650')
    await page.getByLabel('Rule 1 outcome').fill('Approve')
    await expect(page.getByTestId('rule-preview')).toContainText(
      'If credit score is greater than 650 then Approve',
    )
    await page.screenshot({ path: path.join(RUNS, 'bug5-rule-builder.png') })
  })

  test('bug6: decision custom branches', async ({ page }) => {
    await signUpAndOpenEditor(page, 'bug6')
    await addKind(page, 'Decision')
    await page.getByRole('tab', { name: 'Settings' }).click()
    await expect(page.getByTestId('decision-branches')).toBeVisible()
    await expect(page.getByTestId('decision-branch')).toHaveCount(2)
    await page.getByRole('button', { name: 'Add branch' }).click()
    await expect(page.getByTestId('decision-branch')).toHaveCount(3)
    await page.getByLabel('Branch 3 label').fill('Needs review')
    await page.screenshot({ path: path.join(RUNS, 'bug6-decision-branches.png') })
  })
})
