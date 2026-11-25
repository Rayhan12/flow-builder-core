import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { makeAppData, TestProviders, testAuth } from '../test/appData'
import { AppSidebar, NAV_COLLAPSED_EDITOR_KEY, NAV_COLLAPSED_KEY } from './AppSidebar'

const projects = [
  {
    id: 'p1',
    name: 'Lending',
    color: 'blue',
    icon: 'folder',
    diagramCount: 1,
    createdAt: null,
    updatedAt: null,
  },
]

function renderSidebar(
  opts: { variant?: 'app' | 'editor'; path?: string; appData?: ReturnType<typeof makeAppData> } = {},
) {
  const appData =
    opts.appData ??
    makeAppData({
      projects,
      diagramsByProject: {
        p1: [
          {
            id: 'd1',
            title: 'Loan flow',
            nodeCount: 1,
            schemaVersion: 1,
            revision: 0,
            createdAt: null,
            updatedAt: null,
          },
        ],
      },
    })
  render(
    <TestProviders appData={appData}>
      <MemoryRouter initialEntries={[opts.path ?? '/']}>
        <AppSidebar variant={opts.variant} />
      </MemoryRouter>
    </TestProviders>,
  )
  return appData
}

describe('AppSidebar', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('is expanded by default in the app and lists the project tree', async () => {
    const user = userEvent.setup()
    const appData = renderSidebar({ path: '/p/p1' })
    const nav = screen.getByRole('complementary', { name: 'App navigation' })
    expect(nav).not.toHaveClass('is-rail')
    expect(within(nav).getByRole('link', { name: 'Home' })).toBeInTheDocument()
    expect(within(nav).getByRole('link', { name: /Lending/ })).toHaveAttribute('href', '/p/p1')
    // the active project branch auto expands
    expect(await within(nav).findByRole('link', { name: 'Loan flow' })).toHaveAttribute(
      'href',
      '/p/p1/d/d1',
    )
    expect(appData.loadProjectDiagrams).toHaveBeenCalledWith('p1')

    await user.click(within(nav).getByRole('button', { name: 'AI Create' }))
    expect(appData.openAiCreate).toHaveBeenCalledWith({ projectId: 'p1' })
  })

  it('is a rail by default in the editor', () => {
    renderSidebar({ variant: 'editor', path: '/p/p1/d/d1' })
    expect(screen.getByRole('complementary', { name: 'App navigation' })).toHaveClass('is-rail')
  })

  it('toggles with the button and persists the choice', async () => {
    const user = userEvent.setup()
    renderSidebar()
    await user.click(screen.getByRole('button', { name: 'Collapse navigation' }))
    expect(screen.getByRole('complementary')).toHaveClass('is-rail')
    expect(localStorage.getItem(NAV_COLLAPSED_KEY)).toBe('1')
    await user.click(screen.getByRole('button', { name: 'Expand navigation' }))
    expect(localStorage.getItem(NAV_COLLAPSED_KEY)).toBe('0')
  })

  it('toggles with [ and Cmd/Ctrl+backslash but not while typing', async () => {
    const user = userEvent.setup()
    renderSidebar({ variant: 'editor', path: '/p/p1/d/d1' })
    const nav = screen.getByRole('complementary')
    expect(nav).toHaveClass('is-rail')

    await user.keyboard('[[')
    expect(nav).not.toHaveClass('is-rail')
    expect(localStorage.getItem(NAV_COLLAPSED_EDITOR_KEY)).toBe('0')

    await user.keyboard('{Control>}\\{/Control}')
    expect(nav).toHaveClass('is-rail')

    const input = document.createElement('input')
    document.body.appendChild(input)
    input.focus()
    await user.keyboard('[[')
    expect(nav).toHaveClass('is-rail')
    input.remove()
  })

  it('signs out from the account area', async () => {
    const signOut = vi.fn()
    const user = userEvent.setup()
    render(
      <TestProviders appData={makeAppData()} auth={{ ...testAuth, signOut }}>
        <MemoryRouter>
          <AppSidebar />
        </MemoryRouter>
      </TestProviders>,
    )
    expect(screen.getByText('ada@example.com')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Sign out' }))
    expect(signOut).toHaveBeenCalled()
  })
})
