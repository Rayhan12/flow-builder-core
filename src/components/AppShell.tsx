import { Moon, Sun } from 'lucide-react'
import { Outlet, useLocation, useMatch } from 'react-router-dom'
import { useAppData } from '../app/useAppData'
import { useTheme } from '../theme/useTheme'
import { AppSidebar } from './AppSidebar'
import { Breadcrumbs, type Crumb } from './Breadcrumbs'

function useCrumbs(): Crumb[] {
  const { projects } = useAppData()
  const location = useLocation()
  const projectMatch = useMatch('/p/:projectId')
  const crumbs: Crumb[] = [{ label: 'Home', to: '/' }]

  if (projectMatch) {
    const id = projectMatch.params.projectId
    const project = projects.find((p) => p.id === id)
    crumbs.push({ label: project?.name ?? 'Project' })
  } else if (location.pathname === '/settings') {
    crumbs.push({ label: 'Settings' })
  }
  return crumbs
}

/** Dashboard, project and settings pages: nav on the left, header with breadcrumbs on top. */
export function AppShell() {
  const { theme, toggleTheme } = useTheme()
  const crumbs = useCrumbs()

  return (
    <div className="app-layout">
      <AppSidebar variant="app" />
      <div className="app-main-col">
        <header className="app-topbar">
          <Breadcrumbs items={crumbs} />
          <div className="header-actions">
            <button
              type="button"
              className="btn btn-ghost btn-icon"
              onClick={toggleTheme}
              aria-label={theme === 'light' ? 'Switch to dark theme' : 'Switch to light theme'}
            >
              {theme === 'light' ? <Moon size={16} /> : <Sun size={16} />}
            </button>
          </div>
        </header>
        <main className="app-main">
          <div className="app-content">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}
