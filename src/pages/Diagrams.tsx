import { FilePlus2 } from 'lucide-react'

/**
 * Placeholder home for signed-in users.
 * Full create / rename / duplicate / delete arrives in M2.
 */
export function DiagramsPage() {
  return (
    <div className="diagrams-page">
      <div className="page-heading">
        <h1>Your diagrams</h1>
        <p>Create and open decision flows. Diagram management lands in the next milestone.</p>
      </div>

      <div className="empty-state">
        <FilePlus2 className="empty-state-icon" size={40} strokeWidth={1.5} aria-hidden />
        <h2>No diagrams yet</h2>
        <p>You will create and open flows here in the next milestone.</p>
      </div>
    </div>
  )
}
