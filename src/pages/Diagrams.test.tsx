import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthContext, type AuthContextValue } from '../auth/authContext'
import { DiagramsPage } from './Diagrams'

const listDiagrams = vi.fn()
const createDiagram = vi.fn()
const renameDiagram = vi.fn()
const duplicateDiagram = vi.fn()
const deleteDiagram = vi.fn()

vi.mock('../data/diagrams', () => ({
  listDiagrams: (...args: unknown[]) => listDiagrams(...args),
  createDiagram: (...args: unknown[]) => createDiagram(...args),
  renameDiagram: (...args: unknown[]) => renameDiagram(...args),
  duplicateDiagram: (...args: unknown[]) => duplicateDiagram(...args),
  deleteDiagram: (...args: unknown[]) => deleteDiagram(...args),
}))

const authValue: AuthContextValue = {
  user: { uid: 'u1', email: 'a@b.com' } as AuthContextValue['user'],
  loading: false,
  signIn: vi.fn(),
  signUp: vi.fn(),
  signOut: vi.fn(),
}

function renderPage() {
  return render(
    <AuthContext.Provider value={authValue}>
      <MemoryRouter>
        <DiagramsPage />
      </MemoryRouter>
    </AuthContext.Provider>,
  )
}

describe('DiagramsPage', () => {
  beforeEach(() => {
    listDiagrams.mockReset()
    createDiagram.mockReset()
    renameDiagram.mockReset()
    duplicateDiagram.mockReset()
    deleteDiagram.mockReset()
  })

  it('shows empty state and creates a diagram', async () => {
    listDiagrams
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: 'd1',
          title: 'Untitled diagram',
          nodeCount: 0,
          schemaVersion: 1,
          revision: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ])
    createDiagram.mockResolvedValue({
      id: 'd1',
      title: 'Untitled diagram',
    })

    const user = userEvent.setup()
    renderPage()

    expect(await screen.findByText('No diagrams yet')).toBeInTheDocument()
    await user.click(screen.getAllByRole('button', { name: 'New diagram' })[0])

    await waitFor(() => {
      expect(createDiagram).toHaveBeenCalledWith('u1', 'Untitled diagram')
    })
    expect(await screen.findByText('Untitled diagram')).toBeInTheDocument()
  })

  it('lists diagrams and can open rename dialog', async () => {
    listDiagrams.mockResolvedValue([
      {
        id: 'd1',
        title: 'Loan flow',
        nodeCount: 3,
        schemaVersion: 1,
        revision: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ])

    const user = userEvent.setup()
    renderPage()

    expect(await screen.findByText('Loan flow')).toBeInTheDocument()
    expect(screen.getByText(/3 nodes/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Rename Loan flow' }))
    expect(screen.getByRole('dialog', { name: 'Rename diagram' })).toBeInTheDocument()
  })
})
