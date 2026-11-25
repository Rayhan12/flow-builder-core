import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createEmptyDiagramDoc } from '../schema'
import { useEditorStore } from '../store/editorStore'
import { ThemeProvider } from '../theme/ThemeProvider'
import { makeAppData, TestProviders } from '../test/appData'
import { EditorPage } from './Editor'

const getDiagram = vi.fn()
const saveDiagram = vi.fn()

vi.mock('../data/diagrams', () => ({
  getDiagram: (...args: unknown[]) => getDiagram(...args),
  saveDiagram: (...args: unknown[]) => saveDiagram(...args),
}))

function renderEditor() {
  return render(
    <ThemeProvider>
      <TestProviders
        appData={makeAppData({
          projects: [
            {
              id: 'p1',
              name: 'My first project',
              color: 'blue',
              icon: 'folder',
              diagramCount: 1,
              createdAt: null,
              updatedAt: null,
            },
          ],
        })}
      >
        <MemoryRouter initialEntries={['/p/p1/d/d1']}>
          <Routes>
            <Route path="/p/:projectId/d/:diagramId" element={<EditorPage />} />
          </Routes>
        </MemoryRouter>
      </TestProviders>
    </ThemeProvider>,
  )
}

describe('EditorPage', () => {
  beforeEach(() => {
    getDiagram.mockReset()
    saveDiagram.mockReset()
    useEditorStore.getState().reset()
    // React Flow needs layout measurements in jsdom
    if (!globalThis.ResizeObserver) {
      globalThis.ResizeObserver = class {
        observe() {}
        unobserve() {}
        disconnect() {}
      } as unknown as typeof ResizeObserver
    }
  })

  it('loads a diagram and shows the editor chrome', async () => {
    getDiagram.mockResolvedValue({
      id: 'd1',
      ownerId: 'u1',
      title: 'BNPL flow',
      schemaVersion: 1,
      doc: { ...createEmptyDiagramDoc('BNPL flow') },
      nodeCount: 0,
      revision: 2,
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    renderEditor()

    expect(await screen.findByRole('button', { name: 'BNPL flow' })).toBeInTheDocument()
    expect(screen.getByLabelText('Node palette')).toBeInTheDocument()
    expect(screen.getByText('Nothing selected')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Auto layout' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Import / Export' })).toBeInTheDocument()
  })

  it('adds a node from the palette and marks the diagram dirty', async () => {
    getDiagram.mockResolvedValue({
      id: 'd1',
      ownerId: 'u1',
      title: 'Draft',
      schemaVersion: 1,
      doc: { ...createEmptyDiagramDoc('Draft') },
      nodeCount: 0,
      revision: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    saveDiagram.mockResolvedValue(1)

    const user = userEvent.setup()
    renderEditor()

    expect(await screen.findByRole('button', { name: 'Draft' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Decision/i }))

    await waitFor(() => {
      expect(useEditorStore.getState().diagram?.nodes).toHaveLength(1)
      expect(useEditorStore.getState().saveStatus).toBe('dirty')
    })

    expect(screen.getByText('Unsaved changes')).toBeInTheDocument()
  })
})
