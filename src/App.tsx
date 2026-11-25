import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { agentCreateDiagram } from './agent'
import { AuthProvider } from './auth/AuthProvider'
import { AppDataProvider } from './app/AppDataProvider'
import { AppShell } from './components/AppShell'
import { EditorLayout } from './components/EditorLayout'
import { GuestRoute } from './components/GuestRoute'
import { ProtectedRoute } from './components/ProtectedRoute'
import { DashboardPage } from './pages/Dashboard'
import { DiagramRedirect } from './pages/DiagramRedirect'
import { EditorPage } from './pages/Editor'
import { LoginPage } from './pages/Login'
import { ProjectPage } from './pages/ProjectPage'
import { SettingsPage } from './pages/Settings'
import { SignupPage } from './pages/Signup'
import { ThemeProvider } from './theme/ThemeProvider'

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route
              path="/login"
              element={
                <GuestRoute>
                  <LoginPage />
                </GuestRoute>
              }
            />
            <Route
              path="/signup"
              element={
                <GuestRoute>
                  <SignupPage />
                </GuestRoute>
              }
            />
            <Route
              element={
                <ProtectedRoute>
                  <AppDataProvider onGenerate={agentCreateDiagram} />
                </ProtectedRoute>
              }
            >
              <Route element={<AppShell />}>
                <Route index element={<DashboardPage />} />
                <Route path="p/:projectId" element={<ProjectPage />} />
                <Route path="settings" element={<SettingsPage />} />
              </Route>
              <Route element={<EditorLayout />}>
                <Route path="p/:projectId/d/:diagramId" element={<EditorPage />} />
              </Route>
              <Route path="diagrams/:diagramId" element={<DiagramRedirect />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  )
}
