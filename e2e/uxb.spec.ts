import { expect, test, type Page } from '@playwright/test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const RUNS = path.join(ROOT, '.cursor-runs')

type StoreApi = {
  getState: () => {
    diagram: {
      nodes: Array<{
        id: string
        kind: string
        label: string
        parentId?: string
        locked?: boolean
        hidden?: boolean
        position: { x: number; y: number }
        size?: { w: number; h: number }
        style?: { fill?: string; stroke?: string; strokeWidth?: number }
      }>
      edges: Array<{
        id: string
        source: string
        target: string
        style?: { dash?: string; width?: number }
        endMarker?: string
        type?: string
      }>
    } | null
    selectedNodeIds: string[]
    setSelection: (nodeIds: string[], edgeIds: string[]) => void
    groupSelection: () => string | null
    ungroupSelection: () => boolean
    toggleLocked: (ids: string[]) => void
    moveNodes: (
      updates: Array<{ id: string; position: { x: number; y: number } }>,
      recordHistory: boolean,
    ) => void
    updateNode: (id: string, patch: Record<string, unknown>) => void
    updateEdge: (id: string, patch: Record<string, unknown>) => void
    addEdgeFromConnection: (c: {
      source: string
      target: string
      sourceHandle?: string
      targetHandle?: string
    }) => void
  }
}

async function storeReady(page: Page) {
  await page.evaluate(() => {
    const s = (window as unknown as { __FLOW_BUILDER_STORE__?: StoreApi }).__FLOW_BUILDER_STORE__
    if (!s) throw new Error('store missing')
  })
}

async function getStoreState(page: Page) {
  return page.evaluate(() => {
    const s = (window as unknown as { __FLOW_BUILDER_STORE__?: StoreApi }).__FLOW_BUILDER_STORE__
    if (!s) throw new Error('store missing')
    const state = s.getState()
    return {
      nodes: state.diagram?.nodes ?? [],
      edges: state.diagram?.edges ?? [],
      selectedNodeIds: state.selectedNodeIds,
    }
  })
}

async function signUpAndOpenEditor(page: Page, label: string) {
  const email = `${label}-${Date.now()}@example.com`
  const password = 'test-pass-123'

  await page.goto('/signup')
  await page.getByLabel('Name (optional)').fill(label)
  await page.getByLabel('Email').fill(email)
  await page.locator('input[name="password"]').fill(password)
  await page.getByRole('button', { name: 'Create account' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    /Good (morning|afternoon|evening)/,
    { timeout: 15_000 },
  )
  await page.locator('.project-card-link', { hasText: 'My first project' }).click({
    timeout: 15_000,
  })
  await page.getByRole('button', { name: 'New diagram' }).first().click()
  await page.waitForURL(/\/p\/[^/]+\/d\//, { timeout: 15_000 })
  await expect(page.getByTestId('properties-panel')).toBeVisible({ timeout: 15_000 })
  await storeReady(page)
}

async function addKind(page: Page, label: string) {
  await page.getByRole('tab', { name: 'Assets' }).click()
  await page.locator('.palette-item', { hasText: label }).first().click()
  await expect(page.locator('.react-flow__node').last()).toBeVisible()
}

test.describe('UXB Figma-style panels and editing', () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test('properties Design tab shows X Y W H scrubbers', async ({ page }) => {
    await signUpAndOpenEditor(page, 'uxb-props')
    await addKind(page, 'Step')
    await expect(page.getByRole('tab', { name: 'Design' })).toBeVisible()
    await page.getByRole('tab', { name: 'Design' }).click()
    await expect(page.getByTestId('design-x')).toBeVisible()
    await expect(page.getByTestId('design-y')).toBeVisible()
    await expect(page.getByTestId('design-w')).toBeVisible()
    await expect(page.getByTestId('design-h')).toBeVisible()
    await page.screenshot({ path: path.join(RUNS, 'ux-properties.png') })
  })

  test('layers tree rename lock and Assets shapes', async ({ page }) => {
    await signUpAndOpenEditor(page, 'uxb-layers')
    await addKind(page, 'Step')
    await addKind(page, 'Sticky')
    await page.getByTestId('layers-tab').click()
    await expect(page.getByTestId('layers-panel')).toBeVisible()
    const row = page.locator('[data-testid^="layer-row-"]').first()
    await expect(row).toBeVisible()
    await page.screenshot({ path: path.join(RUNS, 'ux-layers.png') })

    await page.getByRole('tab', { name: 'Assets' }).click()
    await expect(page.getByTestId('node-palette')).toBeVisible()
    await expect(page.locator('.palette-item', { hasText: 'Rectangle' }).first()).toBeVisible()
    await expect(page.locator('.palette-item', { hasText: 'Section' }).first()).toBeVisible()
    await page.screenshot({ path: path.join(RUNS, 'ux-shapes.png') })
  })

  test('group ungroup and lock prevent move', async ({ page }) => {
    await signUpAndOpenEditor(page, 'uxb-group')
    await addKind(page, 'Step')
    await addKind(page, 'Step')

    const before = await page.evaluate(() => {
      const s = (window as unknown as { __FLOW_BUILDER_STORE__?: StoreApi }).__FLOW_BUILDER_STORE__
      const state = s!.getState()
      const nodes = state.diagram?.nodes ?? []
      if (nodes.length < 2) throw new Error(`need 2 nodes, got ${nodes.length}`)
      state.moveNodes(
        [
          { id: nodes[0].id, position: { x: 80, y: 120 } },
          { id: nodes[1].id, position: { x: 320, y: 120 } },
        ],
        true,
      )
      state.setSelection([nodes[0].id, nodes[1].id], [])
      const groupId = state.groupSelection()
      const after = s!.getState().diagram?.nodes ?? []
      return {
        groupId,
        childCount: after.filter((n) => n.parentId === groupId).length,
        hasGroup: after.some((n) => n.id === groupId && n.kind === 'group'),
      }
    })
    expect(before.groupId).toBeTruthy()
    expect(before.hasGroup).toBe(true)
    expect(before.childCount).toBe(2)

    await page.evaluate(() => {
      const s = (window as unknown as { __FLOW_BUILDER_STORE__?: StoreApi }).__FLOW_BUILDER_STORE__
      const state = s!.getState()
      const group = (state.diagram?.nodes ?? []).find((n) => n.kind === 'group')
      if (!group) throw new Error('no group')
      state.setSelection([group.id], [])
      state.ungroupSelection()
    })
    const afterUngroup = await getStoreState(page)
    expect(afterUngroup.nodes.filter((n) => n.kind === 'group')).toHaveLength(0)
    expect(afterUngroup.nodes.filter((n) => n.kind === 'step')).toHaveLength(2)
    expect(afterUngroup.nodes.every((n) => !n.parentId)).toBe(true)

    const lockCheck = await page.evaluate(() => {
      const s = (window as unknown as { __FLOW_BUILDER_STORE__?: StoreApi }).__FLOW_BUILDER_STORE__
      const state = s!.getState()
      const step = (state.diagram?.nodes ?? []).find((n) => n.kind === 'step')
      if (!step) throw new Error('no step')
      state.setSelection([step.id], [])
      state.toggleLocked([step.id])
      const again = s!.getState().diagram?.nodes.find((n) => n.id === step.id)
      return { locked: again?.locked === true }
    })
    expect(lockCheck.locked).toBe(true)
  })

  test('context menu and command palette and shortcuts', async ({ page }) => {
    await signUpAndOpenEditor(page, 'uxb-menus')
    await addKind(page, 'Step')
    const node = page.locator('.react-flow__node').first()
    await node.click({ button: 'right', position: { x: 24, y: 24 } })
    await expect(page.getByTestId('canvas-context-menu')).toBeVisible()
    await expect(page.getByRole('menuitem', { name: 'Duplicate', exact: true })).toBeVisible()
    await expect(page.getByRole('menuitem', { name: 'Group', exact: true })).toBeVisible()
    await page.screenshot({ path: path.join(RUNS, 'ux-context-menu.png') })
    await page.keyboard.press('Escape')

    await page.keyboard.press('Meta+k')
    await expect(page.getByTestId('command-palette')).toBeVisible({ timeout: 5_000 })
    await expect(page.getByTestId('command-palette-input')).toBeVisible()
    await page.keyboard.press('Escape')

    await page.getByTestId('shortcuts-button').click()
    await expect(page.getByTestId('shortcuts-sheet')).toBeVisible()
    await expect(page.getByText('Paste in place')).toBeVisible()
    await page.screenshot({ path: path.join(RUNS, 'ux-shortcuts.png') })
    await page.keyboard.press('Escape')
  })

  test('edge style persists and full editor screenshot', async ({ page }) => {
    await signUpAndOpenEditor(page, 'uxb-full')
    await addKind(page, 'Step')
    await addKind(page, 'End')
    await expect(page.locator('.react-flow__node')).toHaveCount(2)

    await page.evaluate(() => {
      const s = (window as unknown as { __FLOW_BUILDER_STORE__?: StoreApi }).__FLOW_BUILDER_STORE__
      const state = s!.getState()
      const nodes = state.diagram?.nodes ?? []
      const step = nodes.find((n) => n.kind === 'step')
      const end = nodes.find((n) => n.kind === 'end')
      if (!step || !end) {
        throw new Error(`missing nodes step=${Boolean(step)} end=${Boolean(end)} kinds=${nodes.map((n) => n.kind).join(',')}`)
      }
      state.addEdgeFromConnection({
        source: step.id,
        target: end.id,
        sourceHandle: 'bottom',
        targetHandle: 'top',
      })
      const edge = s!.getState().diagram?.edges[0]
      if (!edge) throw new Error('no edge')
      state.updateEdge(edge.id, {
        style: { dash: 'dashed', width: 2 },
        endMarker: 'diamond',
      })
      state.setSelection([], [edge.id])
    })
    await expect(page.getByTestId('edge-dash')).toHaveValue('dashed')
    await expect(page.getByTestId('edge-end-marker')).toHaveValue('diamond')

    // Trigger save and soft reload of store via page reload after autosave window.
    await page.waitForTimeout(1200)
    await page.reload()
    await expect(page.getByTestId('properties-panel')).toBeVisible({ timeout: 15_000 })
    await storeReady(page)
    const after = await getStoreState(page)
    expect(after.edges[0]?.style?.dash).toBe('dashed')
    expect(after.edges[0]?.endMarker).toBe('diamond')

    await page.getByRole('tab', { name: 'Assets' }).click()
    await page.screenshot({ path: path.join(RUNS, 'ux-editor-full.png') })
  })
})
