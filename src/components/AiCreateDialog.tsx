import { useEffect } from 'react'
import type { AiCreateHandler } from '../ai/createFromPrompt'
import { AiCreateForm } from './AiCreateForm'

type AiCreateDialogProps = {
  open: boolean
  onClose: () => void
  onGenerate?: AiCreateHandler
  defaultProjectId?: string
}

/** Shared "Ask AI to create a diagram" dialog. The AI agent panel can replace `onGenerate`. */
export function AiCreateDialog({ open, onClose, onGenerate, defaultProjectId }: AiCreateDialogProps) {
  useEffect(() => {
    if (!open) return
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="dialog-backdrop" role="presentation" onClick={onClose}>
      <div
        className="dialog dialog-wide"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ai-create-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="ai-create-title">Ask AI to create a diagram</h2>
        <AiCreateForm
          variant="dialog"
          autoFocus
          onGenerate={onGenerate}
          defaultProjectId={defaultProjectId}
          onDone={onClose}
          onCancel={onClose}
        />
      </div>
    </div>
  )
}
