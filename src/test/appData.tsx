import { vi } from 'vitest'
import type { ReactNode } from 'react'
import { AppDataContext, type AppDataContextValue } from '../app/appDataContext'
import { AuthContext, type AuthContextValue } from '../auth/authContext'

export const testAuth: AuthContextValue = {
  user: { uid: 'u1', email: 'ada@example.com', displayName: null } as AuthContextValue['user'],
  loading: false,
  signIn: vi.fn(),
  signUp: vi.fn(),
  signOut: vi.fn(),
}

export function makeAppData(overrides: Partial<AppDataContextValue> = {}): AppDataContextValue {
  return {
    projects: [],
    projectsLoading: false,
    refreshProjects: vi.fn().mockResolvedValue(undefined),
    diagramsByProject: {},
    loadProjectDiagrams: vi.fn().mockResolvedValue(undefined),
    onGenerate: vi.fn(),
    openAiCreate: vi.fn(),
    ...overrides,
  }
}

export function TestProviders({
  children,
  appData,
  auth = testAuth,
}: {
  children: ReactNode
  appData: AppDataContextValue
  auth?: AuthContextValue
}) {
  return (
    <AuthContext.Provider value={auth}>
      <AppDataContext.Provider value={appData}>{children}</AppDataContext.Provider>
    </AuthContext.Provider>
  )
}
