import { Sparkles } from 'lucide-react'
import { useId, useState, type FormEvent, type KeyboardEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { MissingKeyCard } from '../ai/components/MissingKeyCard'
import { ModelSwitcher } from '../ai/components/ModelSwitcher'
import type { AiCreateHandler } from '../ai/createFromPrompt'
import { hasApiKey } from '../ai/keyStorage'
import { resolveActiveSelection } from '../ai/providers/selectedModel'
import { useAppData } from '../app/useAppData'
import { useAuth } from '../auth/useAuth'
import { createProject } from '../data/projects'
import { editorPath } from '../lib/format'

const NEW_PROJECT = '__new__'

type AiCreateFormProps = {
  /** Defaults to the shared handler from AppDataProvider. */
  onGenerate?: AiCreateHandler
  defaultProjectId?: string
  /** `box` is the inline dashboard card; `dialog` has no frame of its own. */
  variant?: 'box' | 'dialog'
  autoFocus?: boolean
  onDone?: () => void
  onCancel?: () => void
}

export function AiCreateForm({
  onGenerate: onGenerateProp,
  defaultProjectId,
  variant = 'box',
  autoFocus,
  onDone,
  onCancel,
}: AiCreateFormProps) {
  const { user } = useAuth()
  const navigate = useNavigate()
  const { projects, refreshProjects, loadProjectDiagrams, onGenerate: sharedGenerate } = useAppData()
  const onGenerate = onGenerateProp ?? sharedGenerate
  const uid = user?.uid
  const fieldId = useId()

  const [selected, setSelected] = useState<string | null>(null)
  const [newName, setNewName] = useState('')
  const [prompt, setPrompt] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [keyReady, setKeyReady] = useState(() => (uid ? hasApiKey(uid) : false))
  const [modelRevision, setModelRevision] = useState(0)

  const fallback =
    (defaultProjectId && projects.some((p) => p.id === defaultProjectId) ? defaultProjectId : null) ??
    projects[0]?.id ??
    NEW_PROJECT
  const effective =
    selected && (selected === NEW_PROJECT || projects.some((p) => p.id === selected))
      ? selected
      : fallback
  const creatingProject = effective === NEW_PROJECT

  async function submit() {
    if (!uid || busy) return
    const text = prompt.trim()
    if (!text) {
      setError('Describe the diagram you want first.')
      return
    }
    if (creatingProject && !newName.trim()) {
      setError('Name the new project.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      let projectId = effective
      if (creatingProject) {
        const project = await createProject(uid, { name: newName })
        projectId = project.id
      }
      const result = await onGenerate({ uid, projectId, prompt: text })
      await Promise.all([refreshProjects(), loadProjectDiagrams(result.projectId, true)])
      onDone?.()
      navigate(editorPath(result.projectId, result.diagramId), { state: { aiPrompt: text } })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the diagram')
      setBusy(false)
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    void submit()
  }

  function onPromptKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      void submit()
    }
  }

  return (
    <form
      className={variant === 'box' ? 'ask-ai-box' : 'ask-ai-form'}
      onSubmit={onSubmit}
      aria-label="Ask AI to create a diagram"
    >
      {variant === 'box' ? (
        <div className="ask-ai-head">
          <Sparkles size={15} aria-hidden />
          <span>Ask AI to create a diagram</span>
        </div>
      ) : null}

      <textarea
        className="ask-ai-textarea"
        aria-label="Describe the diagram"
        placeholder="Describe the decision flow, for example: approve a loan if the credit score is above 650, otherwise send it to manual review."
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        onKeyDown={onPromptKeyDown}
        rows={variant === 'box' ? 3 : 5}
        maxLength={4000}
        autoFocus={autoFocus}
      />

      <div className="ask-ai-controls">
        <div className="ask-ai-project">
          <label htmlFor={`${fieldId}-project`}>Project</label>
          <select
            id={`${fieldId}-project`}
            value={effective}
            onChange={(e) => setSelected(e.target.value)}
            disabled={busy}
          >
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
            <option value={NEW_PROJECT}>New project...</option>
          </select>
          {creatingProject ? (
            <input
              aria-label="New project name"
              placeholder="Project name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              maxLength={200}
              disabled={busy}
            />
          ) : null}
        </div>
        <div className="ask-ai-actions">
          {onCancel ? (
            <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={busy}>
              Cancel
            </button>
          ) : null}
          <button type="submit" className="btn btn-primary" disabled={busy || !uid}>
            {busy ? 'Creating...' : 'Create diagram'}
          </button>
        </div>
      </div>

      {!keyReady && uid ? (
        <MissingKeyCard
          uid={uid}
          onReady={() => {
            setKeyReady(true)
            setModelRevision((n) => n + 1)
            setError(null)
          }}
        />
      ) : null}

      {keyReady && uid ? (
        <div className="ask-ai-model">
          <ModelSwitcher
            uid={uid}
            revision={modelRevision}
            value={resolveActiveSelection(uid)}
            onChange={() => setModelRevision((n) => n + 1)}
          />
        </div>
      ) : null}

      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
    </form>
  )
}
