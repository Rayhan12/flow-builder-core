import { Copy, FilePlus2, Pencil, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import { EmptyState } from '../components/EmptyState'
import {
  createDiagram,
  deleteDiagram,
  duplicateDiagram,
  listDiagrams,
  renameDiagram,
  type DiagramListItem,
} from '../data/diagrams'
import { ensureDefaultProject } from '../data/projects'

function formatUpdatedAt(value: Date | null): string {
  if (!value) return 'Just now'
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(value)
}

function editorPath(projectId: string, diagramId: string): string {
  return `/p/${projectId}/d/${diagramId}`
}

export function DiagramsPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const { projectId: routeProjectId } = useParams<{ projectId?: string }>()
  const uid = user?.uid

  const [projectId, setProjectId] = useState<string | null>(routeProjectId ?? null)
  const [items, setItems] = useState<DiagramListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const [renameTarget, setRenameTarget] = useState<DiagramListItem | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<DiagramListItem | null>(null)

  useEffect(() => {
    if (!uid) return
    let cancelled = false
    void (async () => {
      try {
        let pid = routeProjectId
        if (!pid) {
          const project = await ensureDefaultProject(uid)
          pid = project.id
        }
        if (cancelled) return
        setProjectId(pid)
      } catch (err) {
        if (cancelled) return
        setError(err instanceof Error ? err.message : 'Could not load project')
        setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [uid, routeProjectId])

  const refresh = useCallback(async () => {
    if (!uid || !projectId) return
    const next = await listDiagrams(uid, projectId)
    setItems(next)
  }, [uid, projectId])

  useEffect(() => {
    if (!uid || !projectId) return
    let cancelled = false

    void (async () => {
      try {
        const next = await listDiagrams(uid, projectId)
        if (cancelled) return
        setItems(next)
        setError(null)
        setLoading(false)
      } catch (err) {
        if (cancelled) return
        setError(err instanceof Error ? err.message : 'Could not load diagrams')
        setLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [uid, projectId])

  async function onCreate() {
    if (!uid || !projectId || busy) return
    setBusy(true)
    setError(null)
    try {
      const created = await createDiagram(uid, projectId, 'Untitled diagram')
      navigate(editorPath(projectId, created.id))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create diagram')
      setBusy(false)
    }
  }

  async function onDuplicate(item: DiagramListItem) {
    if (!uid || !projectId || busy) return
    setBusy(true)
    setError(null)
    try {
      await duplicateDiagram(uid, projectId, item.id)
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not duplicate diagram')
    } finally {
      setBusy(false)
    }
  }

  async function onRenameSubmit(e: FormEvent) {
    e.preventDefault()
    if (!uid || !projectId || !renameTarget || busy) return
    const title = renameValue.trim()
    if (!title) return
    setBusy(true)
    setError(null)
    try {
      await renameDiagram(uid, projectId, renameTarget.id, title)
      setRenameTarget(null)
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not rename diagram')
    } finally {
      setBusy(false)
    }
  }

  async function onDeleteConfirm() {
    if (!uid || !projectId || !deleteTarget || busy) return
    setBusy(true)
    setError(null)
    try {
      await deleteDiagram(uid, projectId, deleteTarget.id)
      setDeleteTarget(null)
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete diagram')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="diagrams-page">
      <div className="page-heading page-heading-row">
        <div>
          <h1>Your diagrams</h1>
          <p>Create, rename, duplicate and delete decision flows.</p>
        </div>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => void onCreate()}
          disabled={busy || !uid || !projectId}
        >
          <FilePlus2 size={16} aria-hidden />
          New diagram
        </button>
      </div>

      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}

      {loading ? (
        <p className="page-status">Loading diagrams...</p>
      ) : items.length === 0 ? (
        <EmptyState
          icon={FilePlus2}
          title="No diagrams yet"
          hint="Create your first flow to get started."
          action={
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => void onCreate()}
              disabled={busy || !uid || !projectId}
            >
              New diagram
            </button>
          }
        />
      ) : (
        <ul className="diagram-list">
          {items.map((item) => (
            <li key={item.id} className="diagram-row">
              <Link
                to={projectId ? editorPath(projectId, item.id) : '/'}
                className="diagram-row-main"
              >
                <h2 className="diagram-title">{item.title}</h2>
                <p className="diagram-meta">
                  {item.nodeCount} {item.nodeCount === 1 ? 'node' : 'nodes'}
                  {' · '}
                  Updated {formatUpdatedAt(item.updatedAt)}
                </p>
              </Link>
              <div className="diagram-row-actions">
                <button
                  type="button"
                  className="btn btn-ghost btn-icon"
                  aria-label={`Rename ${item.title}`}
                  title="Rename"
                  disabled={busy}
                  onClick={() => {
                    setRenameTarget(item)
                    setRenameValue(item.title)
                  }}
                >
                  <Pencil size={16} />
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-icon"
                  aria-label={`Duplicate ${item.title}`}
                  title="Duplicate"
                  disabled={busy}
                  onClick={() => void onDuplicate(item)}
                >
                  <Copy size={16} />
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-icon btn-danger-icon"
                  aria-label={`Delete ${item.title}`}
                  title="Delete"
                  disabled={busy}
                  onClick={() => setDeleteTarget(item)}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {renameTarget ? (
        <div className="dialog-backdrop" role="presentation" onClick={() => setRenameTarget(null)}>
          <div
            className="dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="rename-dialog-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="rename-dialog-title">Rename diagram</h2>
            <form className="auth-form" onSubmit={(e) => void onRenameSubmit(e)}>
              <label className="field">
                <span>Title</span>
                <input
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  maxLength={200}
                  required
                  autoFocus
                />
              </label>
              <div className="dialog-actions">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setRenameTarget(null)}
                  disabled={busy}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={busy}>
                  Save
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {deleteTarget ? (
        <div className="dialog-backdrop" role="presentation" onClick={() => setDeleteTarget(null)}>
          <div
            className="dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-dialog-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="delete-dialog-title">Delete diagram</h2>
            <p className="dialog-body">
              Delete "{deleteTarget.title}"? This cannot be undone.
            </p>
            <div className="dialog-actions">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setDeleteTarget(null)}
                disabled={busy}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-danger"
                onClick={() => void onDeleteConfirm()}
                disabled={busy}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}