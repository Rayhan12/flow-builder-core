import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProjectListItem } from '../data/projects'
import { makeAppData, TestProviders } from '../test/appData'
import { DashboardPage } from './Dashboard'

const listRecentDiagrams = vi.fn()
const createDiagram = vi.fn()
const createProject = vi.fn()
const renameProject = vi.fn()
const recolourProject = vi.fn()
const deleteProject = vi.fn()

vi.mock('../data/diagrams', () => ({
  listRecentDiagrams: (...args: unknown[]) => listRecentDiagrams(...args),
  createDiagram: (...args: unknown[]) => createDiagram(...args),
}))

vi.mock('../data/projects', () => ({
  createProject: (...args: unknown[]) => createProject(...args),
  renameProject: (...args: unknown[]) => renameProject(...args),
  recolourProject: (...args: unknown[]) => recolourProject(...args),
  deleteProject: (...args: unknown[]) => deleteProject(...args),
}))

const alpha: ProjectListItem = {
  id: 'p1',
  name: 'Lending',
  color: 'blue',
  icon: 'folder',
  diagramCount: 3,
  createdAt: new Date(),
  updatedAt: new Date(),
}

function renderDashboard(projects: ProjectListItem[], onGenerate = vi.fn()) {
  const appData = makeAppData({ projects, onGenerate })
  render(
    <TestProviders appData={appData}>
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/p/:projectId/d/:diagramId" element={<div>editor route</div>} />
          <Route path="/p/:projectId" element={<div>project route</div>} />
        </Routes>
      </MemoryRouter>
    </TestProviders>,
  )
  return appData
}

describe('DashboardPage', () => {
  beforeEach(() => {
    listRecentDiagrams.mockReset().mockResolvedValue([])
    createDiagram.mockReset()
    createProject.mockReset()
    renameProject.mockReset()
    recolourProject.mockReset()
    deleteProject.mockReset()
    localStorage.clear()
  })

  it('greets by email local part and shows empty states', async () => {
    renderDashboard([])
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/Good (morning|afternoon|evening), ada/)
    expect(screen.getByText('No projects yet')).toBeInTheDocument()
    expect(await screen.findByText(/No diagrams yet/)).toBeInTheDocument()
  })

  it('lists project cards and recent diagrams', async () => {
    listRecentDiagrams.mockResolvedValue([
      {
        id: 'd1',
        title: 'Loan flow',
        projectId: 'p1',
        projectName: 'Lending',
        nodeCount: 2,
        schemaVersion: 1,
        revision: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ])
    renderDashboard([alpha])

    const card = screen.getByRole('link', { name: /Lending/ })
    expect(card).toHaveAttribute('href', '/p/p1')
    expect(card).toHaveTextContent('3 diagrams')
    const recent = await screen.findByRole('link', { name: /Loan flow/ })
    expect(recent).toHaveAttribute('href', '/p/p1/d/d1')
    expect(listRecentDiagrams).toHaveBeenCalledWith('u1', 8, [{ id: 'p1', name: 'Lending' }])
  })

  it('shows the diagram count in the delete confirmation and deletes', async () => {
    deleteProject.mockResolvedValue(undefined)
    const user = userEvent.setup()
    const appData = renderDashboard([alpha])

    await user.click(screen.getByRole('button', { name: 'Actions for Lending' }))
    await user.click(screen.getByRole('menuitem', { name: 'Delete' }))
    const dialog = screen.getByRole('dialog', { name: 'Delete project' })
    expect(within(dialog).getByText(/permanently delete 3 diagrams/)).toBeInTheDocument()

    await user.click(within(dialog).getByRole('button', { name: 'Delete project' }))
    await waitFor(() => expect(deleteProject).toHaveBeenCalledWith('u1', 'p1'))
    expect(appData.refreshProjects).toHaveBeenCalled()
  })

  it('renames and recolours a project', async () => {
    renameProject.mockResolvedValue(undefined)
    recolourProject.mockResolvedValue(undefined)
    const user = userEvent.setup()
    renderDashboard([alpha])

    await user.click(screen.getByRole('button', { name: 'Actions for Lending' }))
    await user.click(screen.getByRole('menuitem', { name: 'Rename' }))
    const input = screen.getByLabelText('Name')
    await user.clear(input)
    await user.type(input, 'Credit')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(renameProject).toHaveBeenCalledWith('u1', 'p1', 'Credit'))

    await user.click(screen.getByRole('button', { name: 'Actions for Lending' }))
    await user.click(screen.getByRole('menuitem', { name: 'Recolour' }))
    await user.click(screen.getByRole('radio', { name: 'violet' }))
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(recolourProject).toHaveBeenCalledWith('u1', 'p1', 'violet', 'folder'))
  })

  it('creates a project from the new project card', async () => {
    createProject.mockResolvedValue({ id: 'p2' })
    const user = userEvent.setup()
    renderDashboard([alpha])

    await user.click(screen.getByRole('button', { name: /New project/ }))
    await user.type(screen.getByLabelText('Name'), 'Fraud')
    await user.click(screen.getByRole('button', { name: 'Create project' }))
    await waitFor(() => expect(createProject).toHaveBeenCalledWith('u1', { name: 'Fraud' }))
  })

  it('Ask AI creates a diagram in the chosen project and opens the editor', async () => {
    const onGenerate = vi.fn().mockResolvedValue({ projectId: 'p1', diagramId: 'dNew' })
    const user = userEvent.setup()
    renderDashboard([alpha], onGenerate)

    expect(screen.getByLabelText('Gemini API key')).toBeInTheDocument()
    await user.type(screen.getByLabelText('Describe the diagram'), 'Approve loans over 650')
    await user.click(screen.getByRole('button', { name: 'Create diagram' }))

    await waitFor(() =>
      expect(onGenerate).toHaveBeenCalledWith({
        uid: 'u1',
        projectId: 'p1',
        prompt: 'Approve loans over 650',
      }),
    )
    expect(await screen.findByText('editor route')).toBeInTheDocument()
  })

  it('Ask AI can create a new project first', async () => {
    createProject.mockResolvedValue({ id: 'pNew' })
    const onGenerate = vi.fn().mockResolvedValue({ projectId: 'pNew', diagramId: 'd9' })
    const user = userEvent.setup()
    renderDashboard([], onGenerate)

    await user.type(screen.getByLabelText('New project name'), 'Onboarding')
    await user.type(screen.getByLabelText('Describe the diagram'), 'KYC check')
    await user.click(screen.getByRole('button', { name: 'Create diagram' }))

    await waitFor(() => expect(createProject).toHaveBeenCalledWith('u1', { name: 'Onboarding' }))
    await waitFor(() =>
      expect(onGenerate).toHaveBeenCalledWith({ uid: 'u1', projectId: 'pNew', prompt: 'KYC check' }),
    )
  })
})
