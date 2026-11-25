import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Outlet } from 'react-router-dom'
import { stubAiCreate, type AiCreateHandler } from '../ai/createFromPrompt'
import { useAuth } from '../auth/useAuth'
import { AiCreateDialog } from '../components/AiCreateDialog'
import { listDiagrams, type DiagramListItem } from '../data/diagrams'
import { listProjects, type ProjectListItem } from '../data/projects'
import { AppDataContext, type AppDataContextValue } from './appDataContext'

type AppDataProviderProps = {
  /** Swap in the AI agent here; defaults to the empty-diagram stub. */
  onGenerate?: AiCreateHandler
}

/** Shared project and diagram lists for the sidebar, dashboard and AI dialog. Renders an Outlet. */
export function AppDataProvider({ onGenerate = stubAiCreate }: AppDataProviderProps) {
  const { user, migrating } = useAuth()
  const uid = user?.uid

  const [projects, setProjects] = useState<ProjectListItem[]>([])
  const [projectsLoading, setProjectsLoading] = useState(true)
  const [diagramsByProject, setDiagramsByProject] = useState<Record<string, DiagramListItem[]>>({})
  const loadedRef = useRef(new Set<string>())

  const [aiOpen, setAiOpen] = useState(false)
  const [aiProjectId, setAiProjectId] = useState<string | undefined>()

  const refreshProjects = useCallback(async () => {
    if (!uid) return
    try {
      const next = await listProjects(uid)
      setProjects(next)
    } catch (err) {
      console.error('Could not load projects', err)
    } finally {
      setProjectsLoading(false)
    }
  }, [uid])

  useEffect(() => {
    if (!uid) return
    loadedRef.current = new Set()
    // Re-run when post sign-in setup finishes so the default project shows up.
    void refreshProjects()
  }, [uid, migrating, refreshProjects])

  const loadProjectDiagrams = useCallback(
    async (projectId: string, force = false) => {
      if (!uid) return
      if (!force && loadedRef.current.has(projectId)) return
      loadedRef.current.add(projectId)
      try {
        const items = await listDiagrams(uid, projectId)
        setDiagramsByProject((prev) => ({ ...prev, [projectId]: items }))
      } catch (err) {
        loadedRef.current.delete(projectId)
        console.error('Could not load diagrams', err)
      }
    },
    [uid],
  )

  const openAiCreate = useCallback((opts?: { projectId?: string }) => {
    setAiProjectId(opts?.projectId)
    setAiOpen(true)
  }, [])

  const value = useMemo<AppDataContextValue>(
    () => ({
      projects,
      projectsLoading,
      refreshProjects,
      diagramsByProject,
      loadProjectDiagrams,
      onGenerate,
      openAiCreate,
    }),
    [
      projects,
      projectsLoading,
      refreshProjects,
      diagramsByProject,
      loadProjectDiagrams,
      onGenerate,
      openAiCreate,
    ],
  )

  return (
    <AppDataContext.Provider value={value}>
      <Outlet />
      <AiCreateDialog
        open={aiOpen}
        defaultProjectId={aiProjectId}
        onClose={() => setAiOpen(false)}
        onGenerate={onGenerate}
      />
    </AppDataContext.Provider>
  )
}
