import { useState, type FormEvent, type ReactNode } from 'react'
import {
  PROJECT_COLOUR_KEYS,
  PROJECT_ICON_KEYS,
  projectIcon,
  tileColour,
} from '../lib/projectStyle'
import { pluralise } from '../lib/format'
import { ProjectTile } from './ProjectTile'

function Dialog({
  titleId,
  title,
  onClose,
  children,
}: {
  titleId: string
  title: string
  onClose: () => void
  children: ReactNode
}) {
  return (
    <div className="dialog-backdrop" role="presentation" onClick={onClose}>
      <div
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id={titleId}>{title}</h2>
        {children}
      </div>
    </div>
  )
}

type NameDialogProps = {
  mode: 'create' | 'rename'
  initialName?: string
  busy: boolean
  onSubmit: (name: string) => void
  onClose: () => void
}

export function ProjectNameDialog({ mode, initialName = '', busy, onSubmit, onClose }: NameDialogProps) {
  const [name, setName] = useState(initialName)

  function handle(e: FormEvent) {
    e.preventDefault()
    const trimmed = name.trim()
    if (trimmed) onSubmit(trimmed)
  }

  return (
    <Dialog
      titleId="project-name-title"
      title={mode === 'create' ? 'New project' : 'Rename project'}
      onClose={onClose}
    >
      <form className="auth-form" onSubmit={handle}>
        <label className="field">
          <span>Name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={200}
            required
            autoFocus
          />
        </label>
        <div className="dialog-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={busy || !name.trim()}>
            {mode === 'create' ? 'Create project' : 'Save'}
          </button>
        </div>
      </form>
    </Dialog>
  )
}

type RecolourDialogProps = {
  color: string
  icon: string
  busy: boolean
  onSubmit: (color: string, icon: string) => void
  onClose: () => void
}

export function ProjectRecolourDialog({ color, icon, busy, onSubmit, onClose }: RecolourDialogProps) {
  const [nextColor, setNextColor] = useState(color)
  const [nextIcon, setNextIcon] = useState(icon)

  return (
    <Dialog titleId="project-recolour-title" title="Recolour project" onClose={onClose}>
      <div className="swatch-group" role="radiogroup" aria-label="Colour">
        {PROJECT_COLOUR_KEYS.map((key) => (
          <button
            key={key}
            type="button"
            role="radio"
            aria-checked={nextColor === key}
            aria-label={key}
            title={key}
            className={`swatch ${nextColor === key ? 'is-selected' : ''}`}
            style={{ background: tileColour(key).bg, color: tileColour(key).fg }}
            onClick={() => setNextColor(key)}
          >
            <span className="swatch-dot" style={{ background: tileColour(key).fg }} />
          </button>
        ))}
      </div>
      <div className="swatch-group" role="radiogroup" aria-label="Icon">
        {PROJECT_ICON_KEYS.map((key) => {
          const Icon = projectIcon(key)
          return (
            <button
              key={key}
              type="button"
              role="radio"
              aria-checked={nextIcon === key}
              aria-label={key}
              title={key}
              className={`swatch swatch-icon ${nextIcon === key ? 'is-selected' : ''}`}
              onClick={() => setNextIcon(key)}
            >
              <Icon size={16} />
            </button>
          )
        })}
      </div>
      <div className="recolour-preview">
        <ProjectTile color={nextColor} icon={nextIcon} size="lg" />
        <span>Preview</span>
      </div>
      <div className="dialog-actions">
        <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>
          Cancel
        </button>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => onSubmit(nextColor, nextIcon)}
          disabled={busy}
        >
          Save
        </button>
      </div>
    </Dialog>
  )
}

type DeleteDialogProps = {
  name: string
  diagramCount: number
  busy: boolean
  onConfirm: () => void
  onClose: () => void
}

export function ProjectDeleteDialog({ name, diagramCount, busy, onConfirm, onClose }: DeleteDialogProps) {
  return (
    <Dialog titleId="project-delete-title" title="Delete project" onClose={onClose}>
      <p className="dialog-body">
        This will permanently delete {pluralise(diagramCount, 'diagram')} in &quot;{name}&quot; and
        the project itself. This cannot be undone.
      </p>
      <div className="dialog-actions">
        <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>
          Cancel
        </button>
        <button type="button" className="btn btn-danger" onClick={onConfirm} disabled={busy}>
          Delete project
        </button>
      </div>
    </Dialog>
  )
}
