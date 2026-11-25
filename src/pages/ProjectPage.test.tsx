import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { makeAppData, TestProviders } from '../test/appData'
import { ProjectPage } from './ProjectPage'

const listDiagrams = vi.fn()
const createDiagram = vi.fn()
const renameDiagram = vi.fn()
const duplicateDiagram = vi.fn()
const deleteDiagram = vi.fn()
const getProject = vi.fn()

vi.mock('../data/diagrams', () => ({
  listDiagrams: (...args: unknown[]) => listDiagrams(...args),
  createDiagram: (...args: unknown[]) => createDiagram(...args),
  renameDiagram: (...args: unknown[]) => renameDiagram(...args),
  duplicateDiagram: (...args: unknown[]) => duplicateDiagram(...args),
  deleteDiagram: (...args: unknown[]) => deleteDiagram(...args),
}))

vi.mock('../data/projects', () => ({
  getProject: (...args: unknown[]) => getProject(...args),
}))

function renderPage() {
  const appData = makeAppData()
  render(
    <TestProviders appData={appData}>
      <MemoryRouter initialEntries={['/p/p1']}>
        <Routes>
          <Route path="/p/:projectId" element={<ProjectPage />} />
          <Route path="/p/:projectId/d/:diagramId" element={<div>editor route</div>} />
        </Routes>
      </MemoryRouter>
    </TestProviders>,
  )
  return appData
}

const item = {
  id: 'd1',
  title: 'Loan flow',
  nodeCount: 3,
  schemaVersion: 1,
  revision: 1,
  createdAt: new Date(),
  updatedAt: new Date(),
}

describe('ProjectPage', () => {
  beforeEach(() => {
    for (const fn of [listDiagrams, createDiagram, renameDiagram, duplicateDiagram, deleteDiagram, getProject]) {
      fn.mockReset()
    }
    getProject.mockResolvedValue({ id: 'p1', name: 'Lending', color: 'teal', icon: 'folder', diagramCount: 1 })
  })

  it('shows empty state and creates a diagram in the project', async () => {
    listDiagrams.mockResolvedValueOnce([])
    createDiagram.mockResolvedValue({ id: 'd1', title: 'Untitled diagram' })

    const user = userEvent.setup()
    renderPage()

    expect(await screen.findByText('No diagrams yet')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: 'Lending' })).toBeInTheDocument()
    await user.click(screen.getAllByRole('button', { name: 'New diagram' })[0])

    await waitFor(() => {
      expect(createDiagram).toHaveBeenCalledWith('u1', 'p1', 'Untitled diagram')
    })
    expect(await screen.findByText('editor route')).toBeInTheDocument()
  })

  it('lists diagrams, links to the editor and opens the rename dialog', async () => {
    listDiagrams.mockResolvedValue([item])

    const user = userEvent.setup()
    renderPage()

    const link = await screen.findByRole('link', { name: /Loan flow/ })
    expect(link).toHaveAttribute('href', '/p/p1/d/d1')
    expect(screen.getByText(/3 nodes/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Rename Loan flow' }))
    expect(screen.getByRole('dialog', { name: 'Rename diagram' })).toBeInTheDocument()
  })

  it('duplicates and deletes a diagram', async () => {
    listDiagrams.mockResolvedValue([item])
    duplicateDiagram.mockResolvedValue({ id: 'd2' })
    deleteDiagram.mockResolvedValue(undefined)

    const user = userEvent.setup()
    const appData = renderPage()
    await screen.findByText('Loan flow')

    await user.click(screen.getByRole('button', { name: 'Duplicate Loan flow' }))
    await waitFor(() => expect(duplicateDiagram).toHaveBeenCalledWith('u1', 'p1', 'd1'))
    expect(appData.refreshProjects).toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Delete Loan flow' }))
    await user.click(screen.getByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(deleteDiagram).toHaveBeenCalledWith('u1', 'p1', 'd1'))
  })

  it('shows not found for an unknown project', async () => {
    getProject.mockResolvedValue(null)
    listDiagrams.mockResolvedValue([])
    renderPage()
    expect(await screen.findByText('Project not found')).toBeInTheDocument()
  })
})
