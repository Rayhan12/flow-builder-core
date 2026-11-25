import { FileText, Palette, Pencil, Plus, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import type { AiCreateHandler } from '../ai/createFromPrompt'
import { useAppData } from '../app/useAppData'
import { useAuth } from '../auth/useAuth'
import { AiCreateForm } from '../components/AiCreateForm'
import { EmptyState } from '../components/EmptyState'
import { KebabMenu } from '../components/KebabMenu'
import {
  ProjectDeleteDialog,
  ProjectNameDialog,
  ProjectRecolourDialog,
} from '../components/ProjectDialogs'
import { ProjectTile } from '../components/ProjectTile'
import { listRecentDiagrams, type RecentDiagramItem } from '../data/diagrams'
import {
  createProject,
  deleteProject,
  recolourProject,
  renameProject,
  type ProjectListItem,
} from '../data/projects'
import { displayNameFor, editorPath, formatRelative, greetingFor, pluralise } from '../lib/format'

const RECENT_LIMIT = 8

type DialogState =
  | { kind: 'create' }
  | { kind: 'rename'; project: ProjectListItem }
  | { kind: 'recolour'; project: ProjectListItem }
  | { kind: 'delete'; project: ProjectListItem }
  | null

type DashboardProps = {
  /** Override the shared AI create handler (defaults to the one from AppDataProvider). */
  onGenerate?: AiCreateHandler
}

export function DashboardPage({ onGenerate }: DashboardProps) {
  const { user } = useAuth()
  const { hash } = useLocation()
  const { projects, projectsLoading, refreshProjects } = useAppData()
  const uid = user?.uid

  const [recent, setRecent] = useState<RecentDiagramItem[]>([])
  const [recentLoading, setRecentLoading] = useState(true)
  const [dialog, setDialog] = useState<DialogState>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!uid || projectsLoading) return
    let cancelled = false
    void (async () => {
      try {
        const items = await listRecentDiagrams(
          uid,
          RECENT_LIMIT,
          projects.map((p) => ({ id: p.id, name: p.name })),
        )
        if (!cancelled) setRecent(items)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load recent diagrams')
      } finally {
        if (!cancelled) setRecentLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [uid, projects, projectsLoading])

  useEffect(() => {
    if (!hash || projectsLoading || recentLoading) return
    document.getElementById(hash.slice(1))?.scrollIntoView?.({ block: 'start' })
  }, [hash, projectsLoading, recentLoading])

  async function run(action: () => Promise<void>, fallback: string) {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      await action()
      await refreshProjects()
      setDialog(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : fallback)
    } finally {
      setBusy(false)
    }
  }

  const name = displayNameFor(user)

  return (
    <div className="dashboard">
      <header className="dash-greeting">
        <h1>
          {greetingFor()}, {name}
        </h1>
        <p>Pick up where you left off, or describe a new decision flow.</p>
      </header>

      <AiCreateForm onGenerate={onGenerate} />

      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}

      <section id="projects" className="dash-section" aria-labelledby="projects-heading">
        <h2 id="projects-heading" className="section-label">
          Projects
        </h2>
        {projectsLoading ? (
          <p className="page-status">Loading projects...</p>
        ) : projects.length === 0 ? (
          <EmptyState
            title="No projects yet"
            hint="Projects group related diagrams. Create one to get started."
            action={
              <button type="button" className="btn btn-primary" onClick={() => setDialog({ kind: 'create' })}>
                New project
              </button>
            }
          />
        ) : (
          <ul className="project-grid">
            {projects.map((project) => (
              <li key={project.id} className="project-card">
                <Link to={`/p/${project.id}`} className="project-card-link">
                  <ProjectTile color={project.color} icon={project.icon} size="lg" />
                  <span className="project-card-name">{project.name}</span>
                  <span className="project-card-meta">
                    {pluralise(project.diagramCount, 'diagram')}
                    {' · '}
                    Updated {formatRelative(project.updatedAt)}
                  </span>
                </Link>
                <div className="project-card-menu">
                  <KebabMenu
                    label={`Actions for ${project.name}`}
                    items={[
                      {
                        label: 'Rename',
                        icon: <Pencil size={14} />,
                        onSelect: () => setDialog({ kind: 'rename', project }),
                      },
                      {
                        label: 'Recolour',
                        icon: <Palette size={14} />,
                        onSelect: () => setDialog({ kind: 'recolour', project }),
                      },
                      {
                        label: 'Delete',
                        icon: <Trash2 size={14} />,
                        danger: true,
                        onSelect: () => setDialog({ kind: 'delete', project }),
                      },
                    ]}
                  />
                </div>
              </li>
            ))}
            <li className="project-card project-card-new">
              <button
                type="button"
                className="project-card-link"
                onClick={() => setDialog({ kind: 'create' })}
              >
                <span className="project-tile project-tile-lg project-tile-empty" aria-hidden>
                  <Plus size={18} />
                </span>
                <span className="project-card-name">New project</span>
                <span className="project-card-meta">Group related diagrams</span>
              </button>
            </li>
          </ul>
        )}
      </section>

      <section id="recent" className="dash-section" aria-labelledby="recent-heading">
        <h2 id="recent-heading" className="section-label">
          Recent diagrams
        </h2>
        {recentLoading ? (
          <p className="page-status">Loading recent diagrams...</p>
        ) : recent.length === 0 ? (
          <p className="recent-empty">No diagrams yet. Ask AI above or open a project to create one.</p>
        ) : (
          <ul className="recent-list">
            {recent.map((item) => (
              <li key={`${item.projectId}/${item.id}`}>
                <Link to={editorPath(item.projectId, item.id)} className="recent-row">
                  <FileText size={16} aria-hidden className="recent-icon" />
                  <span className="recent-title">{item.title}</span>
                  <span className="recent-project">{item.projectName}</span>
                  <span className="recent-time">{formatRelative(item.updatedAt)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {dialog?.kind === 'create' ? (
        <ProjectNameDialog
          mode="create"
          busy={busy}
          onClose={() => setDialog(null)}
          onSubmit={(projectName) =>
            void run(async () => {
              if (!uid) return
              await createProject(uid, { name: projectName })
            }, 'Could not create project')
          }
        />
      ) : null}

      {dialog?.kind === 'rename' ? (
        <ProjectNameDialog
          mode="rename"
          initialName={dialog.project.name}
          busy={busy}
          onClose={() => setDialog(null)}
          onSubmit={(projectName) =>
            void run(async () => {
              if (uid) await renameProject(uid, dialog.project.id, projectName)
            }, 'Could not rename project')
          }
        />
      ) : null}

      {dialog?.kind === 'recolour' ? (
        <ProjectRecolourDialog
          color={dialog.project.color}
          icon={dialog.project.icon}
          busy={busy}
          onClose={() => setDialog(null)}
          onSubmit={(color, icon) =>
            void run(async () => {
              if (uid) await recolourProject(uid, dialog.project.id, color, icon)
            }, 'Could not update project')
          }
        />
      ) : null}

      {dialog?.kind === 'delete' ? (
        <ProjectDeleteDialog
          name={dialog.project.name}
          diagramCount={dialog.project.diagramCount}
          busy={busy}
          onClose={() => setDialog(null)}
          onConfirm={() =>
            void run(async () => {
              if (uid) await deleteProject(uid, dialog.project.id)
            }, 'Could not delete project')
          }
        />
      ) : null}
    </div>
  )
}
