import { useEffect, useState } from 'react'
import { Navigate, useParams } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import { getDiagram } from '../data/diagrams'
import { ensureDefaultProject, listProjects } from '../data/projects'
import { editorPath } from '../lib/format'

/** Legacy `/diagrams/:diagramId` links: find the owning project, else fall back to the default project. */
export function DiagramRedirect() {
  const { diagramId = '' } = useParams<{ diagramId: string }>()
  const { user } = useAuth()
  const uid = user?.uid
  const [target, setTarget] = useState<string | null>(null)

  useEffect(() => {
    if (!uid) return
    let cancelled = false
    void (async () => {
      let projectId: string | null = null
      try {
        const projects = await listProjects(uid)
        for (const project of projects) {
          if (await getDiagram(uid, project.id, diagramId)) {
            projectId = project.id
            break
          }
        }
        if (!projectId) projectId = (await ensureDefaultProject(uid)).id
      } catch {
        // fall through to home
      }
      if (!cancelled) setTarget(projectId ? editorPath(projectId, diagramId) : '/')
    })()
    return () => {
      cancelled = true
    }
  }, [uid, diagramId])

  if (target) return <Navigate to={target} replace />
  return (
    <div className="page-loading" role="status">
      Opening diagram...
    </div>
  )
}
