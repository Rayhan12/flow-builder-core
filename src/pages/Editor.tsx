import { ReactFlowProvider } from '@xyflow/react'
import { ArrowLeft, Moon, Redo2, Save, Sun, Undo2, Workflow } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import { getDiagram, saveDiagram } from '../data/diagrams'
import { Canvas } from '../editor/Canvas'
import { NodePalette } from '../editor/palette/NodePalette'
import { NodeSidePanel } from '../editor/panels/NodeSidePanel'
import type { NodeKind } from '../schema'
import { NodeKindSchema } from '../schema'
import { useEditorStore } from '../store/editorStore'
import { useTheme } from '../theme/useTheme'

const AUTOSAVE_MS = 1000

function saveLabel(status: string, error: string | null): string {
  if (status === 'saving') return 'Saving...'
  if (status === 'saved') return 'Saved'
  if (status === 'dirty') return 'Unsaved changes'
  if (status === 'error') return error ?? 'Save failed'
  return ''
}

export function EditorPage() {
  return (
    <ReactFlowProvider>
      <EditorInner />
    </ReactFlowProvider>
  )
}

function EditorInner() {
  const { diagramId } = useParams<{ diagramId: string }>()
  const { user } = useAuth()
  const { theme, toggleTheme } = useTheme()

  const diagram = useEditorStore((s) => s.diagram)
  const saveStatus = useEditorStore((s) => s.saveStatus)
  const saveError = useEditorStore((s) => s.saveError)
  const load = useEditorStore((s) => s.load)
  const reset = useEditorStore((s) => s.reset)
  const addNode = useEditorStore((s) => s.addNode)
  const setTitle = useEditorStore((s) => s.setTitle)
  const undo = useEditorStore((s) => s.undo)
  const redo = useEditorStore((s) => s.redo)
  const past = useEditorStore((s) => s.past)
  const future = useEditorStore((s) => s.future)
  const markSaving = useEditorStore((s) => s.markSaving)
  const markSaved = useEditorStore((s) => s.markSaved)
  const markSaveError = useEditorStore((s) => s.markSaveError)

  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState('')
  const savingRef = useRef(false)
  const uid = user?.uid

  useEffect(() => {
    if (!uid || !diagramId) return
    let cancelled = false

    void (async () => {
      try {
        const record = await getDiagram(uid, diagramId)
        if (cancelled) return
        if (!record) {
          setLoadError('Diagram not found')
          setLoading(false)
          return
        }
        load(
          {
            id: record.id,
            ...record.doc,
          },
          record.revision,
        )
        setTitleDraft(record.title)
        setLoading(false)
      } catch (err) {
        if (cancelled) return
        setLoadError(err instanceof Error ? err.message : 'Could not open diagram')
        setLoading(false)
      }
    })()

    return () => {
      cancelled = true
      reset()
    }
  }, [uid, diagramId, load, reset])

  const persist = useCallback(async () => {
    const state = useEditorStore.getState()
    if (!uid || !diagramId || !state.diagram) return
    if (state.saveStatus !== 'dirty' && state.saveStatus !== 'error') return
    if (savingRef.current) return
    savingRef.current = true
    markSaving()
    try {
      const nextRevision = await saveDiagram(uid, diagramId, state.diagram, state.revision)
      markSaved(nextRevision)
    } catch (err) {
      markSaveError(err instanceof Error ? err.message : 'Could not save')
    } finally {
      savingRef.current = false
    }
  }, [uid, diagramId, markSaving, markSaved, markSaveError])

  useEffect(() => {
    if (saveStatus !== 'dirty') return
    const timer = window.setTimeout(() => {
      void persist()
    }, AUTOSAVE_MS)
    return () => window.clearTimeout(timer)
  }, [saveStatus, diagram, persist])

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const meta = e.metaKey || e.ctrlKey
      if (!meta) return
      const key = e.key.toLowerCase()
      if (key === 'z' && !e.shiftKey) {
        e.preventDefault()
        undo()
      } else if ((key === 'z' && e.shiftKey) || key === 'y') {
        e.preventDefault()
        redo()
      } else if (key === 's') {
        e.preventDefault()
        void persist()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [undo, redo, persist])

  const onAddKind = useCallback(
    (kind: NodeKind) => {
      const offset = useEditorStore.getState().diagram?.nodes.length ?? 0
      addNode(kind, { x: 120 + (offset % 5) * 40, y: 80 + (offset % 5) * 40 })
    },
    [addNode],
  )

  const onDropKind = useCallback(
    (kind: string, position: { x: number; y: number }) => {
      const parsed = NodeKindSchema.safeParse(kind)
      if (!parsed.success) return
      addNode(parsed.data, position)
    },
    [addNode],
  )

  function commitTitle() {
    const next = titleDraft.trim()
    if (next && next !== diagram?.title) {
      setTitle(next)
    } else if (diagram) {
      setTitleDraft(diagram.title)
    }
    setEditingTitle(false)
  }

  if (loading) {
    return <div className="page-loading">Opening diagram...</div>
  }

  if (loadError || !diagram) {
    return (
      <div className="page-loading">
        <div className="empty-state" style={{ maxWidth: 420 }}>
          <h2>{loadError ?? 'Diagram not found'}</h2>
          <p>Go back to your diagrams list and try again.</p>
          <Link to="/" className="btn btn-primary">
            Back to diagrams
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="editor-shell">
      <header className="editor-topbar">
        <div className="editor-topbar-left">
          <Link to="/" className="btn btn-ghost btn-icon" aria-label="Back to diagrams">
            <ArrowLeft size={18} />
          </Link>
          <Workflow className="brand-icon" aria-hidden size={20} strokeWidth={2} />
          {editingTitle ? (
            <input
              className="editor-title-input"
              value={titleDraft}
              maxLength={200}
              autoFocus
              onChange={(e) => setTitleDraft(e.target.value)}
              onBlur={commitTitle}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitTitle()
                if (e.key === 'Escape') {
                  setTitleDraft(diagram.title)
                  setEditingTitle(false)
                }
              }}
              aria-label="Diagram title"
            />
          ) : (
            <button
              type="button"
              className="editor-title-btn"
              onClick={() => {
                setTitleDraft(diagram.title)
                setEditingTitle(true)
              }}
              title="Rename"
            >
              {diagram.title}
            </button>
          )}
          <span
            className={`save-status ${saveStatus === 'error' ? 'is-error' : ''} ${saveStatus === 'saved' ? 'is-saved' : ''}`}
          >
            {saveLabel(saveStatus, saveError)}
          </span>
        </div>

        <div className="editor-topbar-right">
          <button
            type="button"
            className="btn btn-ghost btn-icon"
            aria-label="Undo"
            title="Undo"
            disabled={past.length === 0}
            onClick={() => undo()}
          >
            <Undo2 size={18} />
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-icon"
            aria-label="Redo"
            title="Redo"
            disabled={future.length === 0}
            onClick={() => redo()}
          >
            <Redo2 size={18} />
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => void persist()}
            disabled={saveStatus === 'saving' || saveStatus === 'saved' || saveStatus === 'idle'}
          >
            <Save size={16} aria-hidden />
            Save
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-icon"
            onClick={toggleTheme}
            aria-label={theme === 'light' ? 'Switch to dark theme' : 'Switch to light theme'}
          >
            {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
          </button>
        </div>
      </header>

      <div className="editor-body">
        <NodePalette onAdd={onAddKind} />
        <Canvas onDropKind={onDropKind} />
        <NodeSidePanel />
      </div>
    </div>
  )
}
