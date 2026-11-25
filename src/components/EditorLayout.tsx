import { Outlet } from 'react-router-dom'
import { AppSidebar } from './AppSidebar'

/** Editor route layout: app nav rail (collapsed by default) beside the editor. The palette stays inside the editor. */
export function EditorLayout() {
  return (
    <div className="app-layout is-editor">
      <AppSidebar variant="editor" />
      <div className="app-main-col">
        <Outlet />
      </div>
    </div>
  )
}
