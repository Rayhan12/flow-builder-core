import { ReactFlowProvider, useReactFlow, useViewport } from '@xyflow/react'
import {
  ArrowLeft,
  Download,
  FileQuestion,
  Grid3x3,
  Keyboard,
  LayoutTemplate,
  Maximize2,
  Moon,
  Redo2,
  Save,
  Search,
  Sparkles,
  Sun,
  Undo2,
  Upload,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { AssistantPanel } from '../ai/AssistantPanel'
import { useAppData } from '../app/useAppData'
import { useAuth } from '../auth/useAuth'
import { Breadcrumbs } from '../components/Breadcrumbs'
import { EmptyState } from '../components/EmptyState'
import { getDiagram, saveDiagram } from '../data/diagrams'
import {
  cycleGridMode,
  gridModeLabel,
  type GridMode,
} from '../editor/alignment'
import { Canvas } from '../editor/Canvas'
import {
  DIAGRAM_SIZE_WARN_BYTES,
  estimateDiagramBytes,
} from '../editor/fixtures/largeDiagram'
import {
  diagramFilename,
  downloadJsonFile,
  exportDiagramJson,
  mergeImportedDiagram,
  parseImportedJson,
} from '../editor/importExport'
import { isEditableKeyboardTarget } from '../editor/keyboard'
import { autoLayoutDiagram, type LayoutDirection } from '../editor/layout'
import { NodeSearch, type NodeSearchResult } from '../editor/NodeSearch'
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
  const { projectId, diagramId } = useParams<{
    projectId?: string
    diagramId?: string
  }>()
  const { user } = useAuth()
  const { projects } = useAppData()
  const { theme, toggleTheme } = useTheme()
  const { fitView, zoomIn, zoomOut } = useReactFlow()
  const { zoom } = useViewport()
  const projectName = projects.find((p) => p.id === projectId)?.name ?? 'Project'

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
  const applyNodeLayout = useEditorStore((s) => s.applyNodeLayout)
  const replaceDiagramContent = useEditorStore((s) => s.replaceDiagramContent)
  const copySelection = useEditorStore((s) => s.copySelection)
  const pasteClipboard = useEditorStore((s) => s.pasteClipboard)
  const duplicateSelection = useEditorStore((s) => s.duplicateSelection)
  const clearSelection = useEditorStore((s) => s.clearSelection)
  const setSelection = useEditorStore((s) => s.setSelection)

  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState('')
  const [layoutBusy, setLayoutBusy] = useState(false)
  const [ioMenuOpen, setIoMenuOpen] = useState(false)
  const [ioError, setIoError] = useState<string | null>(null)
  const [assistantOpen, setAssistantOpen] = useState(false)
  const [nodeSearchOpen, setNodeSearchOpen] = useState(false)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const [gridMode, setGridMode] = useState<GridMode>('dots')
  const savingRef = useRef(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const ioMenuRef = useRef<HTMLDivElement>(null)
  const uid = user?.uid

  const sizeWarning = useMemo(() => {
    if (!diagram) return null
    const bytes = estimateDiagramBytes(diagram)
    if (bytes < DIAGRAM_SIZE_WARN_BYTES) return null
    const kb = Math.round(bytes / 1024)
    return `This diagram is about ${kb} KB. Firestore docs max out near 1 MB. Consider splitting it.`
  }, [diagram])

  useEffect(() => {
    if (!uid || !projectId || !diagramId) return
    let cancelled = false

    void (async () => {
      try {
        const record = await getDiagram(uid, projectId, diagramId)
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
  }, [uid, projectId, diagramId, load, reset])

  const persist = useCallback(async () => {
    const state = useEditorStore.getState()
    if (!uid || !projectId || !diagramId || !state.diagram) return
    if (state.saveStatus !== 'dirty' && state.saveStatus !== 'error') return
    if (savingRef.current) return
    savingRef.current = true
    markSaving()
    try {
      const nextRevision = await saveDiagram(
        uid,
        projectId,
        diagramId,
        state.diagram,
        state.revision,
      )
      markSaved(nextRevision)
    } catch (err) {
      markSaveError(err instanceof Error ? err.message : 'Could not save')
    } finally {
      savingRef.current = false
    }
  }, [uid, projectId, diagramId, markSaving, markSaved, markSaveError])

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
      const key = e.key.toLowerCase()
      const typing = isEditableKeyboardTarget(e.target)

      if (key === 'escape') {
        if (nodeSearchOpen) {
          setNodeSearchOpen(false)
          return
        }
        if (shortcutsOpen) {
          setShortcutsOpen(false)
          return
        }
        if (assistantOpen) {
          setAssistantOpen(false)
          return
        }
        if (!typing) clearSelection()
        return
      }

      if (meta && key === 'k') {
        e.preventDefault()
        setNodeSearchOpen(true)
        return
      }

      if (meta && key === '/') {
        e.preventDefault()
        setShortcutsOpen(true)
        return
      }

      if (!meta) return
      if (typing && key !== 's') return

      if (key === 'z' && !e.shiftKey) {
        e.preventDefault()
        undo()
      } else if ((key === 'z' && e.shiftKey) || key === 'y') {
        e.preventDefault()
        redo()
      } else if (key === 's') {
        e.preventDefault()
        void persist()
      } else if (key === 'c' && !typing) {
        e.preventDefault()
        copySelection()
      } else if (key === 'v' && !typing) {
        e.preventDefault()
        pasteClipboard()
      } else if (key === 'd' && !typing) {
        e.preventDefault()
        duplicateSelection()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [
    undo,
    redo,
    persist,
    copySelection,
    pasteClipboard,
    duplicateSelection,
    clearSelection,
    nodeSearchOpen,
    shortcutsOpen,
    assistantOpen,
  ])

  useEffect(() => {
    if (!ioMenuOpen) return
    function onDoc(e: MouseEvent) {
      if (!ioMenuRef.current?.contains(e.target as Node)) setIoMenuOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [ioMenuOpen])

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

  const runLayout = useCallback(
    async (direction: LayoutDirection = 'DOWN') => {
      const current = useEditorStore.getState().diagram
      if (!current || layoutBusy) return
      setLayoutBusy(true)
      setIoError(null)
      try {
        const laidOut = await autoLayoutDiagram(current.nodes, current.edges, direction)
        applyNodeLayout(laidOut)
        requestAnimationFrame(() => fitView({ padding: 0.2, duration: 200 }))
      } catch (err) {
        setIoError(err instanceof Error ? err.message : 'Layout failed')
      } finally {
        setLayoutBusy(false)
      }
    },
    [applyNodeLayout, fitView, layoutBusy],
  )

  const onExport = useCallback(() => {
    const current = useEditorStore.getState().diagram
    if (!current) return
    setIoMenuOpen(false)
    downloadJsonFile(diagramFilename(current.title), exportDiagramJson(current))
  }, [])

  const onImportFile = useCallback(
    async (file: File) => {
      const text = await file.text()
      const current = useEditorStore.getState().diagram
      if (!current) return
      const result = parseImportedJson(text, current.id)
      if (!result.ok) {
        setIoError(result.error)
        return
      }
      setIoError(null)
      replaceDiagramContent(mergeImportedDiagram(current.id, result.diagram))
      setTitleDraft(result.diagram.title)
      requestAnimationFrame(() => fitView({ padding: 0.2, duration: 200 }))
    },
    [fitView, replaceDiagramContent],
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

  const onNodeSearchSelect = useCallback(
    (result: NodeSearchResult) => {
      setNodeSearchOpen(false)
      if (result.type === 'add') {
        const offset = useEditorStore.getState().diagram?.nodes.length ?? 0
        addNode(result.kind, { x: 120 + (offset % 5) * 40, y: 80 + (offset % 5) * 40 })
        return
      }
      setSelection([result.nodeId], [])
      requestAnimationFrame(() =>
        fitView({ padding: 0.35, duration: 200, nodes: [{ id: result.nodeId }] }),
      )
    },
    [addNode, fitView, setSelection],
  )

  if (loading) {
    return <div className="page-loading">Opening diagram...</div>
  }

  if (loadError || !diagram) {
    return (
      <div className="page-loading">
        <EmptyState
          icon={FileQuestion}
          title={loadError ?? 'Diagram not found'}
          hint="Go back to your diagrams list and try again."
          action={
            <Link to={projectId ? `/p/${projectId}` : '/'} className="btn btn-primary">
              Back to project
            </Link>
          }
        />
      </div>
    )
  }

  return (
    <div className="editor-shell">
      <header className="editor-topbar">
        <div className="editor-topbar-left">
          <Link
            to={projectId ? `/p/${projectId}` : '/'}
            className="btn btn-ghost btn-icon"
            aria-label="Back to project"
          >
            <ArrowLeft size={18} />
          </Link>
          <Breadcrumbs
            items={[
              { label: 'Home', to: '/' },
              {
                label: projectName,
                to: projectId ? `/p/${projectId}` : undefined,
              },
              { label: diagram.title },
            ]}
          />
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
          {ioError ? <span className="save-status is-error">{ioError}</span> : null}
          {sizeWarning ? (
            <span className="save-status is-warning" role="status">
              {sizeWarning}
            </span>
          ) : null}
        </div>

        <div className="editor-topbar-right">
          <div className="editor-toolbar-group">
            <button
              type="button"
              className="btn btn-ghost btn-icon"
              aria-label="Undo"
              title="Undo"
              disabled={past.length === 0}
              onClick={() => undo()}
            >
              <Undo2 size={16} />
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-icon"
              aria-label="Redo"
              title="Redo"
              disabled={future.length === 0}
              onClick={() => redo()}
            >
              <Redo2 size={16} />
            </button>
          </div>
          <span className="editor-toolbar-divider" aria-hidden />
          <div className="editor-toolbar-group">
            <button
              type="button"
              className="btn btn-ghost btn-icon"
              aria-label="Zoom out"
              title="Zoom out"
              onClick={() => zoomOut({ duration: 120 })}
            >
              <ZoomOut size={16} />
            </button>
            <span className="editor-zoom-label" aria-live="polite">
              {Math.round(zoom * 100)}%
            </span>
            <button
              type="button"
              className="btn btn-ghost btn-icon"
              aria-label="Zoom in"
              title="Zoom in"
              onClick={() => zoomIn({ duration: 120 })}
            >
              <ZoomIn size={16} />
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-icon"
              aria-label="Fit view"
              title="Fit view"
              onClick={() => fitView({ padding: 0.2, duration: 200 })}
            >
              <Maximize2 size={16} />
            </button>
          </div>
          <span className="editor-toolbar-divider" aria-hidden />
          <div className="editor-toolbar-group">
            <button
              type="button"
              className="btn btn-ghost btn-icon"
              aria-label="Auto layout"
              title="Auto layout"
              disabled={layoutBusy || diagram.nodes.length === 0}
              onClick={() => void runLayout('DOWN')}
            >
              <LayoutTemplate size={16} />
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-icon"
              aria-label={`Grid: ${gridModeLabel(gridMode)}. Click to change.`}
              title={`Grid: ${gridModeLabel(gridMode)}`}
              onClick={() => setGridMode((m) => cycleGridMode(m))}
            >
              <Grid3x3 size={16} />
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-icon"
              aria-label="Search nodes"
              title="Search nodes (Ctrl/Cmd+K)"
              onClick={() => setNodeSearchOpen(true)}
            >
              <Search size={16} />
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-icon"
              aria-label="Keyboard shortcuts"
              title="Keyboard shortcuts (Ctrl/Cmd+/)"
              onClick={() => setShortcutsOpen(true)}
            >
              <Keyboard size={16} />
            </button>
          </div>
          <span className="editor-toolbar-divider" aria-hidden />
          <div className="editor-toolbar-group">
            <div className="io-menu" ref={ioMenuRef}>
              <button
                type="button"
                className="btn btn-ghost"
                aria-expanded={ioMenuOpen}
                aria-haspopup="menu"
                onClick={() => setIoMenuOpen((v) => !v)}
              >
                Import / Export
              </button>
              {ioMenuOpen ? (
                <div className="io-menu-popover" role="menu">
                  <button
                    type="button"
                    className="io-menu-item"
                    role="menuitem"
                    onClick={() => {
                      setIoMenuOpen(false)
                      fileInputRef.current?.click()
                    }}
                  >
                    <Upload size={16} aria-hidden />
                    Import JSON
                  </button>
                  <button
                    type="button"
                    className="io-menu-item"
                    role="menuitem"
                    onClick={onExport}
                  >
                    <Download size={16} aria-hidden />
                    Export JSON
                  </button>
                </div>
              ) : null}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json,.json"
              className="sr-only"
              aria-label="Import diagram JSON"
              onChange={(e) => {
                const file = e.target.files?.[0]
                e.target.value = ''
                if (file) void onImportFile(file)
              }}
            />
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
              className="btn btn-ghost"
              aria-pressed={assistantOpen}
              onClick={() => setAssistantOpen((v) => !v)}
            >
              <Sparkles size={16} aria-hidden />
              AI
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-icon"
              onClick={toggleTheme}
              aria-label={theme === 'light' ? 'Switch to dark theme' : 'Switch to light theme'}
            >
              {theme === 'light' ? <Moon size={16} /> : <Sun size={16} />}
            </button>
          </div>
        </div>
      </header>

      <div className={`editor-body ${assistantOpen ? 'has-ai-panel' : ''}`}>
        <NodePalette onAdd={onAddKind} diagramTitle={diagram.title} />
        <Canvas
          gridMode={gridMode}
          onDropKind={onDropKind}
          emptyAction={
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setNodeSearchOpen(true)}
            >
              Add a node
            </button>
          }
        />
        {assistantOpen && projectId && diagramId ? (
          <AssistantPanel
            open={assistantOpen}
            onClose={() => setAssistantOpen(false)}
            projectId={projectId}
            diagramId={diagramId}
          />
        ) : (
          <NodeSidePanel />
        )}
      </div>

      <NodeSearch
        open={nodeSearchOpen}
        nodes={diagram.nodes}
        onClose={() => setNodeSearchOpen(false)}
        onSelect={onNodeSearchSelect}
      />

      {shortcutsOpen ? (
        <div
          className="dialog-backdrop"
          role="presentation"
          onClick={() => setShortcutsOpen(false)}
        >
          <div
            className="dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="shortcuts-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="shortcuts-title">Keyboard shortcuts</h2>
            <ul className="shortcuts-list">
              <li>
                <kbd>Ctrl/Cmd</kbd>+<kbd>Z</kbd> Undo
              </li>
              <li>
                <kbd>Ctrl/Cmd</kbd>+<kbd>Shift</kbd>+<kbd>Z</kbd> Redo
              </li>
              <li>
                <kbd>Ctrl/Cmd</kbd>+<kbd>S</kbd> Save
              </li>
              <li>
                <kbd>Ctrl/Cmd</kbd>+<kbd>C</kbd> / <kbd>V</kbd> Copy / Paste
              </li>
              <li>
                <kbd>Ctrl/Cmd</kbd>+<kbd>D</kbd> Duplicate selection
              </li>
              <li>
                <kbd>Ctrl/Cmd</kbd>+<kbd>K</kbd> Search or add nodes
              </li>
              <li>
                <kbd>Delete</kbd> Remove selection
              </li>
              <li>
                <kbd>Esc</kbd> Clear selection or close panels
              </li>
            </ul>
            <div className="dialog-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setShortcutsOpen(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
