import {
  ChevronRight,
  FileText,
  FolderKanban,
  History,
  Home,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  Sparkles,
} from 'lucide-react'
import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { Link, NavLink, useLocation, useMatch } from 'react-router-dom'
import { useAppData } from '../app/useAppData'
import { LogoWordmark } from '../assets/brand'
import { useAuth } from '../auth/useAuth'
import { isEditableKeyboardTarget } from '../editor/keyboard'
import { editorPath } from '../lib/format'
import { ProjectTile } from './ProjectTile'

/** Collapsed flag for dashboard and project pages. */
export const NAV_COLLAPSED_KEY = 'fb-nav-collapsed'
/** Collapsed flag inside the editor (collapsed by default there). */
export const NAV_COLLAPSED_EDITOR_KEY = 'fb-nav-collapsed-editor'

const MAX_DIAGRAMS_IN_TREE = 12

function readCollapsed(key: string, fallback: boolean): boolean {
  try {
    const raw = localStorage.getItem(key)
    if (raw === '1') return true
    if (raw === '0') return false
  } catch {
    // ignore storage errors
  }
  return fallback
}

type AppSidebarProps = {
  variant?: 'app' | 'editor'
}

type NavItemProps = {
  label: string
  icon: ReactNode
  to?: string
  end?: boolean
  onClick?: () => void
}

function NavItem({ label, icon, to, end, onClick }: NavItemProps) {
  const content = (
    <>
      <span className="nav-item-icon">{icon}</span>
      <span className="nav-item-label">{label}</span>
    </>
  )
  const common = { 'aria-label': label, 'data-tooltip': label }
  if (onClick) {
    return (
      <button type="button" className="nav-item" onClick={onClick} {...common}>
        {content}
      </button>
    )
  }
  return (
    <NavLink
      to={to ?? '/'}
      end={end}
      className={({ isActive }) => `nav-item ${isActive ? 'is-active' : ''}`}
      {...common}
    >
      {content}
    </NavLink>
  )
}

export function AppSidebar({ variant = 'app' }: AppSidebarProps) {
  const { user, signOut } = useAuth()
  const location = useLocation()
  const { projects, diagramsByProject, loadProjectDiagrams, openAiCreate } = useAppData()
  const storageKey = variant === 'editor' ? NAV_COLLAPSED_EDITOR_KEY : NAV_COLLAPSED_KEY
  const defaultCollapsed = variant === 'editor'

  const [collapsed, setCollapsed] = useState(() => readCollapsed(storageKey, defaultCollapsed))
  const [projectsOpen, setProjectsOpen] = useState(true)
  const [openProjects, setOpenProjects] = useState<Record<string, boolean>>({})

  const projectMatch = useMatch('/p/:projectId/*')
  const diagramMatch = useMatch('/p/:projectId/d/:diagramId')
  const activeProjectId = projectMatch?.params.projectId
  const activeDiagramId = diagramMatch?.params.diagramId

  const toggle = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev
      try {
        localStorage.setItem(storageKey, next ? '1' : '0')
      } catch {
        // ignore storage errors
      }
      return next
    })
  }, [storageKey])

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && e.key === '\\') {
        e.preventDefault()
        toggle()
        return
      }
      if (e.key === '[' && !e.metaKey && !e.ctrlKey && !e.altKey && !isEditableKeyboardTarget(e.target)) {
        e.preventDefault()
        toggle()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [toggle])

  // Open the tree branch for the project being viewed.
  useEffect(() => {
    if (!activeProjectId) return
    setOpenProjects((prev) => (prev[activeProjectId] ? prev : { ...prev, [activeProjectId]: true }))
  }, [activeProjectId])

  // Lazily load diagrams for every expanded branch while the nav is expanded.
  useEffect(() => {
    if (collapsed || !projectsOpen) return
    for (const [pid, open] of Object.entries(openProjects)) {
      if (open) void loadProjectDiagrams(pid)
    }
  }, [collapsed, projectsOpen, openProjects, loadProjectDiagrams])

  function toggleProject(projectId: string) {
    setOpenProjects((prev) => ({ ...prev, [projectId]: !prev[projectId] }))
  }

  const email = user?.email ?? ''
  const initial = (user?.displayName?.trim() || email || '?').charAt(0).toUpperCase()
  const onDashboard = location.pathname === '/'

  return (
    <aside
      className={`app-nav ${collapsed ? 'is-rail' : ''} ${variant === 'editor' ? 'is-editor' : ''}`}
      aria-label="App navigation"
    >
      <div className="app-nav-head">
        <Link to="/" className="app-nav-brand" aria-label="Flow Builder home" data-tooltip="Flow Builder">
          <LogoWordmark markSize={20} markOnly={collapsed} className="app-nav-logo" />
        </Link>
        <button
          type="button"
          className="btn btn-ghost btn-icon app-nav-toggle"
          onClick={toggle}
          aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}
          aria-expanded={!collapsed}
          data-tooltip={collapsed ? 'Expand ([)' : 'Collapse ([)'}
        >
          {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
        </button>
      </div>

      <nav className="app-nav-body" aria-label="Primary">
        <NavItem label="Home" to="/" end icon={<Home size={16} />} />

        <div className="nav-section-label">Workspace</div>

        <div className="nav-group">
          <div className="nav-item-row">
            <Link
              to="/#projects"
              className="nav-item"
              aria-label="Projects"
              data-tooltip="Projects"
              onClick={() => {
                if (onDashboard) document.getElementById('projects')?.scrollIntoView?.()
              }}
            >
              <span className="nav-item-icon">
                <FolderKanban size={16} />
              </span>
              <span className="nav-item-label">Projects</span>
            </Link>
            {!collapsed ? (
              <button
                type="button"
                className="nav-chevron"
                aria-label={projectsOpen ? 'Collapse projects' : 'Expand projects'}
                aria-expanded={projectsOpen}
                onClick={() => setProjectsOpen((v) => !v)}
              >
                <ChevronRight size={14} className={projectsOpen ? 'is-open' : ''} />
              </button>
            ) : null}
          </div>

          {!collapsed && projectsOpen ? (
            <ul className="nav-tree">
              {projects.length === 0 ? <li className="nav-tree-empty">No projects yet</li> : null}
              {projects.map((project) => {
                const open = Boolean(openProjects[project.id])
                const diagrams = diagramsByProject[project.id]
                return (
                  <li key={project.id}>
                    <div className="nav-item-row">
                      <NavLink
                        to={`/p/${project.id}`}
                        end
                        className={({ isActive }) => `nav-item nav-item-project ${isActive ? 'is-active' : ''}`}
                      >
                        <ProjectTile color={project.color} icon={project.icon} size="sm" />
                        <span className="nav-item-label">{project.name}</span>
                      </NavLink>
                      <button
                        type="button"
                        className="nav-chevron"
                        aria-label={`${open ? 'Collapse' : 'Expand'} ${project.name}`}
                        aria-expanded={open}
                        onClick={() => toggleProject(project.id)}
                      >
                        <ChevronRight size={14} className={open ? 'is-open' : ''} />
                      </button>
                    </div>
                    {open ? (
                      <ul className="nav-tree nav-tree-diagrams">
                        {diagrams === undefined ? (
                          <li className="nav-tree-empty">Loading...</li>
                        ) : diagrams.length === 0 ? (
                          <li className="nav-tree-empty">No diagrams</li>
                        ) : (
                          diagrams.slice(0, MAX_DIAGRAMS_IN_TREE).map((d) => (
                            <li key={d.id}>
                              <Link
                                to={editorPath(project.id, d.id)}
                                className={`nav-item nav-item-diagram ${
                                  project.id === activeProjectId && d.id === activeDiagramId
                                    ? 'is-active'
                                    : ''
                                }`}
                                title={d.title}
                              >
                                <FileText size={13} aria-hidden className="nav-diagram-icon" />
                                <span className="nav-item-label">{d.title}</span>
                              </Link>
                            </li>
                          ))
                        )}
                        {diagrams && diagrams.length > MAX_DIAGRAMS_IN_TREE ? (
                          <li>
                            <Link to={`/p/${project.id}`} className="nav-item nav-item-more">
                              <span className="nav-item-label">
                                View all {diagrams.length} diagrams
                              </span>
                            </Link>
                          </li>
                        ) : null}
                      </ul>
                    ) : null}
                  </li>
                )
              })}
            </ul>
          ) : null}
        </div>

        <Link
          to="/#recent"
          className="nav-item"
          aria-label="Recent"
          data-tooltip="Recent"
          onClick={() => {
            if (onDashboard) document.getElementById('recent')?.scrollIntoView?.()
          }}
        >
          <span className="nav-item-icon">
            <History size={16} />
          </span>
          <span className="nav-item-label">Recent</span>
        </Link>

        <NavItem
          label="AI Create"
          icon={<Sparkles size={16} />}
         
          onClick={() => openAiCreate({ projectId: activeProjectId })}
        />
      </nav>

      <div className="app-nav-foot">
        <NavItem label="Settings" to="/settings" icon={<Settings size={16} />} />
        <div className="nav-account">
          <span className="nav-avatar" aria-hidden data-tooltip={email}>
            {initial}
          </span>
          <span className="nav-account-email" title={email}>
            {email}
          </span>
        </div>
        <button
          type="button"
          className="nav-item nav-signout"
          onClick={() => void signOut()}
          aria-label="Sign out"
          data-tooltip="Sign out"
        >
          <span className="nav-item-icon">
            <LogOut size={16} />
          </span>
          <span className="nav-item-label">Sign out</span>
        </button>
      </div>
    </aside>
  )
}
