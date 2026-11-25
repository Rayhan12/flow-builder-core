import { createContext } from 'react'
import type { AiCreateHandler } from '../ai/createFromPrompt'
import type { DiagramListItem } from '../data/diagrams'
import type { ProjectListItem } from '../data/projects'

export type AppDataContextValue = {
  projects: ProjectListItem[]
  projectsLoading: boolean
  refreshProjects: () => Promise<void>
  diagramsByProject: Record<string, DiagramListItem[]>
  loadProjectDiagrams: (projectId: string, force?: boolean) => Promise<void>
  /** Shared AI create handler; swapped for the agent later. */
  onGenerate: AiCreateHandler
  openAiCreate: (opts?: { projectId?: string }) => void
}

export const AppDataContext = createContext<AppDataContextValue | null>(null)
