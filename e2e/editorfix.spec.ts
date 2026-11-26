import { expect, test, type Page } from '@playwright/test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const RUNS = path.join(ROOT, '.cursor-runs')

type StoreNode = {
  id: string
  kind: string
  label?: string
  position: { x: number; y: number }
  data?: {
    branches?: Array<{ id: string; label: string; color?: string }>
    mode?: string
  }
}

type StoreEdge = {
  id: string
  source: string
  target: string
  sourceHandle?: string
  targetHandle?: string
}

type StoreApi = {
  getState: () => {
    diagram: {
      nodes: StoreNode[]
      edges: StoreEdge[]
    } | null
    selectedNodeIds: string[]
    addEdgeFromConnection: (c: {
      source: string
      target: string
      sourceHandle?: string
      targetHandle?: string
    }) => void
    reconnectEdge: (
      edgeId: string,
      c: {
        source: string
        target: string
        sourceHandle?: string
        targetHandle?: string
      },
    ) => void
    setSelection: (nodeIds: string[], edgeIds: string[]) => void
    moveNodes: (
      updates: Array<{ id: string; position: { x: number; y: number } }>,
      recordHistory: boolean,
    ) => void
    replaceNode: (node: StoreNode) => void
  }
}

function store(page: Page) {
  return page.evaluate(() => {
    const s = (window as unknown as { __FLOW_BUILDER_STORE__?: StoreApi }).__FLOW_BUILDER_STORE__
    if (!s) throw new Error('store missing')
    return true
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
  await expect(page.getByRole('heading', { level: 1 })).toContainText(/Good (morning|afternoon|evening)/, {
    timeout: 15_000,
  })
  await page.locator('.project-card-link', { hasText: 'My first project' }).click({ timeout: 15_000 })
  await page.getByRole('button', { name: 'New diagram' }).first().click()
  await page.waitForURL(/\/p\/[^/]+\/d\//, { timeout: 15_000 })
  await expect(page.getByTestId('properties-panel')).toBeVisible({ timeout: 15_000 })
  await store(page)
}

async function addKind(page: Page, label: string) {
  await page.getByRole('tab', { name: 'Assets' }).click().catch(() => undefined)
  await page.locator('.palette-item', { hasText: label }).first().click()
  await expect(page.locator('.react-flow__node').last()).toBeVisible()
}

async function layoutNodes(
  page: Page,
  positions: Array<{ kind?: string; index?: number; x: number; y: number }>,
) {
  await page.evaluate((specs) => {
    const s = (window as unknown as { __FLOW_BUILDER_STORE__?: StoreApi }).__FLOW_BUILDER_STORE__
    const state = s!.getState()
    const nodes = state.diagram?.nodes ?? []
    const byKind = new Map<string, StoreNode[]>()
    for (const n of nodes) {
      const list = byKind.get(n.kind) ?? []
      list.push(n)
      byKind.set(n.kind, list)
    }
    const updates: Array<{ id: string; position: { x: number; y: number } }> = []
    for (const spec of specs) {
      if (spec.kind) {
        const list = byKind.get(spec.kind) ?? []
        const node = list[spec.index ?? 0]
        if (node) updates.push({ id: node.id, position: { x: spec.x, y: spec.y } })
      }
    }
    state.moveNodes(updates, true)
  }, positions)
}

type AnchorCheck = { edgeId: string; handleId: string; dx: number; dy: number; ok: boolean }

async function measureBranchAnchors(page: Page, sourceId: string): Promise<AnchorCheck[]> {
  // Force RF to remeasure after chip layout / resize.
  await page.evaluate((id) => {
    const s = (window as unknown as { __FLOW_BUILDER_STORE__?: StoreApi }).__FLOW_BUILDER_STORE__
    const node = s!.getState().diagram?.nodes.find((n) => n.id === id)
    if (!node) return
    s!.getState().moveNodes([{ id, position: { x: node.position.x + 0.01, y: node.position.y } }], false)
    s!.getState().moveNodes([{ id, position: { ...node.position } }], false)
  }, sourceId)
  await page.waitForTimeout(100)

  return page.evaluate((id) => {
    const s = (window as unknown as { __FLOW_BUILDER_STORE__?: StoreApi }).__FLOW_BUILDER_STORE__
    const edges = (s!.getState().diagram?.edges ?? []).filter((e) => e.source === id)
    const out: AnchorCheck[] = []
    for (const edge of edges) {
      const handleId = edge.sourceHandle ?? ''
      const handle = document.querySelector(
        `.react-flow__node[data-id="${id}"] .react-flow__handle[data-handleid="${handleId}"]`,
      ) as HTMLElement | null
      const path = document.querySelector(
        `.react-flow__edge[data-id="${edge.id}"] path.react-flow__edge-path`,
      ) as SVGPathElement | null
      if (!handle || !path) {
        out.push({ edgeId: edge.id, handleId, dx: 999, dy: 999, ok: false })
        continue
      }
      const hr = handle.getBoundingClientRect()
      // React Flow anchors Bottom handles at the bottom-centre of the handle box.
      const hx = hr.left + hr.width / 2
      const hy = handle.classList.contains('react-flow__handle-right')
        ? hr.top + hr.height / 2
        : hr.bottom

      // Prefer M x,y from the path `d` (exact source point RF used).
      const dAttr = path.getAttribute('d') ?? ''
      const m = /^M\s*([-\d.]+)[,\s]+([-\d.]+)/.exec(dAttr)
      const ctm = path.getScreenCTM()
      if (!ctm) {
        out.push({ edgeId: edge.id, handleId, dx: 999, dy: 999, ok: false })
        continue
      }
      let screen: { x: number; y: number }
      if (m) {
        screen = new DOMPoint(Number(m[1]), Number(m[2])).matrixTransform(ctm)
      } else {
        const len0 = path.getPointAtLength(0)
        screen = new DOMPoint(len0.x, len0.y).matrixTransform(ctm)
      }
      const dx = Math.abs(screen.x - hx)
      const dy = Math.abs(screen.y - hy)
      out.push({ edgeId: edge.id, handleId, dx, dy, ok: dx <= 3 && dy <= 3 })
    }
    return out
  }, sourceId)
}

function assertEvenChipSpacing(centres: Array<{ x: number; y: number }>) {
  expect(centres.length).toBeGreaterThanOrEqual(2)
  if (centres.length < 3) return
  const gaps: number[] = []
  for (let i = 1; i < centres.length; i += 1) {
    gaps.push(centres[i].x - centres[i - 1].x)
  }
  for (let i = 1; i < gaps.length; i += 1) {
    expect(Math.abs(gaps[i] - gaps[0]), `gap ${i} vs 0`).toBeLessThanOrEqual(2)
  }
}

test.describe('EDITORFIX: connectors, hints, chips, shapes', () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test('side-handle connect via store and pointer drag; reconnect', async ({ page }) => {
    await signUpAndOpenEditor(page, 'fix-connect')
    await addKind(page, 'Step')
    await addKind(page, 'Step')
    await addKind(page, 'End')
    await layoutNodes(page, [
      { kind: 'step', index: 0, x: 80, y: 160 },
      { kind: 'step', index: 1, x: 420, y: 160 },
      { kind: 'end', index: 0, x: 760, y: 160 },
    ])

    await page.evaluate(() => {
      const s = (window as unknown as { __FLOW_BUILDER_STORE__?: StoreApi }).__FLOW_BUILDER_STORE__
      const state = s!.getState()
      const steps = (state.diagram?.nodes ?? []).filter((n) => n.kind === 'step')
      if (steps.length < 2) throw new Error('need 2 steps')
      state.addEdgeFromConnection({
        source: steps[0].id,
        target: steps[1].id,
        sourceHandle: 'right',
        targetHandle: 'left',
      })
    })
    await expect(page.locator('.react-flow__edge')).toHaveCount(1)

    // Real pointer drag from a side handle onto another node body (best-effort).
    const ids = await getStoreState(page)
    const stepA = ids.nodes.filter((n) => n.kind === 'step')[0]
    const end = ids.nodes.find((n) => n.kind === 'end')
    expect(stepA && end).toBeTruthy()

    const handle = page
      .locator(`.react-flow__node[data-id="${stepA!.id}"] .react-flow__handle[data-handleid="bottom"]`)
      .first()
    const targetNode = page.locator(`.react-flow__node[data-id="${end!.id}"]`)
    const hb = await handle.boundingBox()
    const tb = await targetNode.boundingBox()
    if (hb && tb) {
      await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2)
      await page.mouse.down()
      await page.mouse.move(tb.x + tb.width / 2, tb.y + tb.height / 2, { steps: 12 })
      await page.mouse.up()
      await page.waitForTimeout(200)
    }

    await page.evaluate(() => {
      const s = (window as unknown as { __FLOW_BUILDER_STORE__?: StoreApi }).__FLOW_BUILDER_STORE__
      const state = s!.getState()
      const edge = state.diagram?.edges[0]
      const steps = (state.diagram?.nodes ?? []).filter((n) => n.kind === 'step')
      const endNode = (state.diagram?.nodes ?? []).find((n) => n.kind === 'end')
      if (!edge || !endNode || steps.length < 1) throw new Error('missing edge/nodes')
      state.reconnectEdge(edge.id, {
        source: steps[0].id,
        target: endNode.id,
        sourceHandle: 'right',
        targetHandle: 'left',
      })
    })

    const after = await getStoreState(page)
    expect(after.edges.length).toBeGreaterThanOrEqual(1)
    expect(after.edges.some((e) => e.target === end!.id)).toBe(true)
  })

  test('connector tool: click A then B, chain C, Escape returns to select', async ({ page }) => {
    await signUpAndOpenEditor(page, 'fix-connector')
    await addKind(page, 'Step')
    await addKind(page, 'Step')
    await addKind(page, 'End')
    await layoutNodes(page, [
      { kind: 'step', index: 0, x: 100, y: 140 },
      { kind: 'step', index: 1, x: 420, y: 140 },
      { kind: 'end', index: 0, x: 740, y: 140 },
    ])

    const state = await getStoreState(page)
    const a = state.nodes.filter((n) => n.kind === 'step')[0]
    const b = state.nodes.filter((n) => n.kind === 'step')[1]
    const c = state.nodes.find((n) => n.kind === 'end')!
    expect(a && b && c).toBeTruthy()

    const tool = page.getByTestId('connector-tool')
    if (await tool.count()) {
      await tool.click()
    } else {
      await page.keyboard.press('c')
    }
    await expect(page.getByTestId('connector-tool')).toHaveAttribute('aria-pressed', 'true')

    await page.locator(`.react-flow__node[data-id="${a!.id}"]`).click({ position: { x: 40, y: 30 } })
    await page.locator(`.react-flow__node[data-id="${b!.id}"]`).click({ position: { x: 40, y: 30 } })
    await expect(page.locator('.react-flow__edge')).toHaveCount(1)

    // Chained: after A→B the source is B; click C to draw B→C
    await page.locator(`.react-flow__node[data-id="${c.id}"]`).click({ position: { x: 40, y: 30 } })
    await expect(page.locator('.react-flow__edge')).toHaveCount(2)

    await page.keyboard.press('Escape')
    await expect(page.getByTestId('connector-tool')).toHaveAttribute('aria-pressed', 'false')

    await page.screenshot({ path: path.join(RUNS, 'fix-connector-tool.png') })
  })

  test('popover dismiss: properties More, zoom menu; Escape / outside / selection', async ({
    page,
  }) => {
    await signUpAndOpenEditor(page, 'fix-popover')
    await addKind(page, 'Step')
    await addKind(page, 'End')

    await page.getByTestId('properties-more').click()
    await expect(page.locator('.side-panel-overflow-menu')).toBeVisible()
    await page.locator('.editor-canvas').click({ position: { x: 24, y: 24 } })
    await expect(page.locator('.side-panel-overflow-menu')).toHaveCount(0)

    const step = (await getStoreState(page)).nodes.find((n) => n.kind === 'step')!
    await page.locator(`.react-flow__node[data-id="${step.id}"]`).click()
    await page.getByTestId('properties-more').click()
    await expect(page.locator('.side-panel-overflow-menu')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.locator('.side-panel-overflow-menu')).toHaveCount(0)

    await page.getByTestId('properties-more').click()
    await expect(page.locator('.side-panel-overflow-menu')).toBeVisible()
    const end = (await getStoreState(page)).nodes.find((n) => n.kind === 'end')!
    await page.locator(`.react-flow__node[data-id="${end.id}"]`).click()
    await expect(page.locator('.side-panel-overflow-menu')).toHaveCount(0)

    await page.getByTestId('zoom-chip').click()
    await expect(page.getByRole('menuitem', { name: 'Zoom to fit' })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('menuitem', { name: 'Zoom to fit' })).toHaveCount(0)

    const ioTrigger = page.getByRole('button', { name: /Import \/ Export/i })
    if (await ioTrigger.count()) {
      await ioTrigger.click()
      await expect(page.locator('.io-menu-popover')).toBeVisible()
      await page.keyboard.press('Escape')
      await expect(page.locator('.io-menu-popover')).toHaveCount(0)
    }

    await page.screenshot({ path: path.join(RUNS, 'fix-popover-closed.png') })
  })

  test('decision chip layout: 4 and 2 branches evenly spaced', async ({ page }) => {
    await signUpAndOpenEditor(page, 'fix-chips')
    await addKind(page, 'Decision')
    await page.getByRole('tab', { name: 'Settings' }).click()
    await expect(page.getByTestId('decision-branches')).toBeVisible()

    await page.getByRole('button', { name: 'Add branch' }).click()
    await page.getByRole('button', { name: 'Add branch' }).click()
    await expect(page.getByTestId('decision-branch')).toHaveCount(4)
    await expect(page.getByTestId('decision-branch-pill')).toHaveCount(4)

    const pills = page.getByTestId('decision-branch-pill')
    const layout4 = await pills.evaluateAll((els) =>
      els.map((el) => {
        const r = el.getBoundingClientRect()
        const chip = el.querySelector('.flow-branch-chip')?.getBoundingClientRect()
        const handle = el.querySelector('.flow-branch-handle-dot')?.getBoundingClientRect()
        return {
          left: r.left,
          right: r.right,
          top: r.top,
          bottom: r.bottom,
          cx: r.left + r.width / 2,
          cy: r.top + r.height / 2,
          chipBottom: chip?.bottom ?? r.bottom,
          chipCx: chip ? chip.left + chip.width / 2 : r.left + r.width / 2,
          handleCx: handle ? handle.left + handle.width / 2 : r.left + r.width / 2,
          handleCy: handle ? handle.top + handle.height / 2 : r.bottom,
        }
      }),
    )
    assertEvenChipSpacing(layout4.map((p) => ({ x: p.cx, y: p.cy })))

    for (const row of layout4) {
      expect(Math.abs(row.handleCx - row.chipCx)).toBeLessThan(10)
      expect(row.handleCy).toBeGreaterThanOrEqual(row.chipBottom - 6)
    }

    for (let i = 0; i < layout4.length; i += 1) {
      for (let j = i + 1; j < layout4.length; j += 1) {
        const a = layout4[i]
        const b = layout4[j]
        const overlap =
          a.left < b.right - 2 && a.right > b.left + 2 && a.top < b.bottom - 2 && a.bottom > b.top + 2
        expect(overlap, `pill ${i} overlaps ${j}`).toBe(false)
      }
    }

    const quickAdds = page.locator('[data-testid^="quick-add-"]')
    if ((await quickAdds.count()) > 0) {
      const qaBoxes = await quickAdds.evaluateAll((els) =>
        els.map((el) => {
          const r = el.getBoundingClientRect()
          return { left: r.left, right: r.right, top: r.top, bottom: r.bottom }
        }),
      )
      for (const pill of layout4) {
        for (const qa of qaBoxes) {
          const overlap =
            pill.left < qa.right - 2 &&
            pill.right > qa.left + 2 &&
            pill.top < qa.bottom - 2 &&
            pill.bottom > qa.top + 2
          expect(overlap).toBe(false)
        }
      }
    }

    // Also cover the default 2-branch layout
    await page.getByLabel('Remove branch Branch 4').click()
    await page.getByLabel('Remove branch Branch 3').click()
    await expect(page.getByTestId('decision-branch-pill')).toHaveCount(2)
    const layout2 = await pills.evaluateAll((els) =>
      els.map((el) => {
        const r = el.getBoundingClientRect()
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
      }),
    )
    expect(layout2).toHaveLength(2)
    expect(Math.abs(layout2[1].y - layout2[0].y)).toBeLessThan(2)

    await page.screenshot({ path: path.join(RUNS, 'fix-decision-chips.png') })
  })

  test('node hint visible then hidden via view menu', async ({ page }) => {
    await signUpAndOpenEditor(page, 'fix-hints')
    await addKind(page, 'Step')
    await expect(page.getByTestId('node-kind-hint').first()).toBeVisible()
    await expect(page.getByTestId('node-kind-hint').first()).toContainText(/process task/i)

    await page.getByTestId('view-menu').click()
    await page.getByTestId('show-node-hints').click()
    await expect(page.getByTestId('node-kind-hint')).toHaveCount(0)

    await page.screenshot({ path: path.join(RUNS, 'fix-node-hints.png') })
  })

  test('What is this? for Parallel split shows description', async ({ page }) => {
    await signUpAndOpenEditor(page, 'fix-what')
    await addKind(page, 'Parallel split')
    await page.getByTestId('what-is-this').click()
    await expect(page.getByText(/parallel paths|same time|parallel join/i).first()).toBeVisible()
    await page.screenshot({ path: path.join(RUNS, 'fix-what-is-this.png') })
  })

  test('shape icons in palette are nine distinct SVG geometries', async ({ page }) => {
    await signUpAndOpenEditor(page, 'fix-shapes')
    const shapesGroup = page.getByTestId('palette-group-shapes')
    await expect(shapesGroup).toBeVisible()
    const header = page.getByTestId('palette-group-shapes-header')
    if (await header.count()) {
      const open = await shapesGroup.evaluate((el) => el.classList.contains('is-open'))
      if (!open) await header.click()
    }

    const previews = shapesGroup.locator('[data-shape-preview], [data-testid^="shape-preview-"]')
    await expect(previews).toHaveCount(9)

    const signatures = await previews.evaluateAll((els) =>
      els.map((el) => {
        const paths = [...el.querySelectorAll('path')].map((p) => p.getAttribute('d') ?? '')
        const rect = el.querySelector('rect')
        const ellipse = el.querySelector('ellipse')
        if (paths.length) return `path:${paths.join('|')}`
        if (rect) {
          return `rect:${rect.getAttribute('rx')}:${rect.getAttribute('width')}:${rect.getAttribute('height')}`
        }
        if (ellipse) {
          return `ellipse:${ellipse.getAttribute('rx')}:${ellipse.getAttribute('ry')}`
        }
        return el.outerHTML
      }),
    )
    expect(new Set(signatures).size).toBe(9)

    await page.screenshot({ path: path.join(RUNS, 'fix-shape-icons.png') })
  })

  test('branch anchors stay on chip handles after connect, add, rename, reorder', async ({
    page,
  }) => {
    await signUpAndOpenEditor(page, 'fix-anchors')
    await addKind(page, 'Decision')
    await addKind(page, 'Step')
    await addKind(page, 'Step')
    await addKind(page, 'Switch')
    await addKind(page, 'End')
    await addKind(page, 'End')
    await addKind(page, 'End')

    await layoutNodes(page, [
      { kind: 'decision', index: 0, x: 120, y: 80 },
      { kind: 'step', index: 0, x: 40, y: 320 },
      { kind: 'step', index: 1, x: 280, y: 320 },
      { kind: 'switch', index: 0, x: 560, y: 80 },
      { kind: 'end', index: 0, x: 480, y: 340 },
      { kind: 'end', index: 1, x: 640, y: 340 },
      { kind: 'end', index: 2, x: 800, y: 340 },
    ])

    // Switch needs 3 branches (default is 2)
    const switchNode = (await getStoreState(page)).nodes.find((n) => n.kind === 'switch')!
    await page.locator(`.react-flow__node[data-id="${switchNode.id}"]`).click()
    await page.getByRole('tab', { name: 'Settings' }).click()
    await page.getByRole('button', { name: 'Add branch' }).click()
    await expect(page.getByTestId('decision-branch')).toHaveCount(3)

    await page.evaluate(() => {
      const s = (window as unknown as { __FLOW_BUILDER_STORE__?: StoreApi }).__FLOW_BUILDER_STORE__
      const state = s!.getState()
      const nodes = state.diagram?.nodes ?? []
      const decision = nodes.find((n) => n.kind === 'decision')!
      const sw = nodes.find((n) => n.kind === 'switch')!
      const steps = nodes.filter((n) => n.kind === 'step')
      const ends = nodes.filter((n) => n.kind === 'end')
      const dBranches = decision.data?.branches ?? []
      const sBranches = sw.data?.branches ?? []
      if (dBranches.length < 2 || steps.length < 2) throw new Error('decision setup incomplete')
      if (sBranches.length < 3 || ends.length < 3) throw new Error('switch setup incomplete')

      state.addEdgeFromConnection({
        source: decision.id,
        target: steps[0].id,
        sourceHandle: dBranches[0].id,
        targetHandle: 'top',
      })
      state.addEdgeFromConnection({
        source: decision.id,
        target: steps[1].id,
        sourceHandle: dBranches[1].id,
        targetHandle: 'top',
      })
      for (let i = 0; i < 3; i += 1) {
        state.addEdgeFromConnection({
          source: sw.id,
          target: ends[i].id,
          sourceHandle: sBranches[i].id,
          targetHandle: 'top',
        })
      }
    })

    await page.waitForTimeout(300)
    const decisionId = (await getStoreState(page)).nodes.find((n) => n.kind === 'decision')!.id
    const switchId = (await getStoreState(page)).nodes.find((n) => n.kind === 'switch')!.id

    let decisionAnchors = await measureBranchAnchors(page, decisionId)
    expect(decisionAnchors.length).toBe(2)
    for (const a of decisionAnchors) {
      expect(a.ok, `decision edge ${a.edgeId} dx=${a.dx} dy=${a.dy}`).toBe(true)
    }

    let switchAnchors = await measureBranchAnchors(page, switchId)
    expect(switchAnchors.length).toBe(3)
    for (const a of switchAnchors) {
      expect(a.ok, `switch edge ${a.edgeId} dx=${a.dx} dy=${a.dy}`).toBe(true)
    }

    // Add branch on decision, rename long label, reorder — anchors should still hold for existing edges
    await page.locator(`.react-flow__node[data-id="${decisionId}"]`).click()
    await page.getByRole('tab', { name: 'Settings' }).click()
    await page.getByRole('button', { name: 'Add branch' }).click()
    await page.getByLabel('Branch 1 label').fill('Very long approval outcome label')
    await page.getByLabel('Move branch Very long approval outcome label down').click()
    await page.waitForTimeout(300)

    decisionAnchors = await measureBranchAnchors(page, decisionId)
    expect(decisionAnchors.length).toBeGreaterThanOrEqual(2)
    for (const a of decisionAnchors) {
      expect(a.ok, `after mutate decision edge ${a.edgeId} dx=${a.dx} dy=${a.dy}`).toBe(true)
    }

    switchAnchors = await measureBranchAnchors(page, switchId)
    for (const a of switchAnchors) {
      expect(a.ok, `after mutate switch edge ${a.edgeId} dx=${a.dx} dy=${a.dy}`).toBe(true)
    }

    await page.screenshot({ path: path.join(RUNS, 'fix-branch-anchors.png') })
  })
})
