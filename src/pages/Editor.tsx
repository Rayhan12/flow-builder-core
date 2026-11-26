import { ReactFlowProvider, useNodesInitialized, useReactFlow, useViewport } from '@xyflow/react'
import {
  AlertTriangle,
  ArrowLeft,
  Download,
  Eye,
  FileQuestion,
  Grid3x3,
  Keyboard,
  LayoutTemplate,
  Magnet,
  Map as MapIcon,
  Moon,
  Redo2,
  Save,
  Search,
  SlidersHorizontal,
  Sparkles,
  Spline,
  Sun,
  Undo2,
  Upload,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useParams, useSearchParams } from 'react-router-dom'
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
import { Canvas, type CanvasTool } from '../editor/Canvas'
import { readShowNodeHints, writeShowNodeHints } from '../editor/nodeHints'
import { useDismiss } from '../hooks/useDismiss'
import {
  DIAGRAM_SIZE_WARN_BYTES,
  estimateDiagramBytes,
} from '../editor/fixtures/largeDiagram'
import { dropPositionFromFlowPoint, parsePalettePayload } from '../editor/paletteDrop'
import { getLastFlowPoint } from '../editor/pointerPosition'
import { DEFAULT_NODE_HEIGHT, DEFAULT_NODE_WIDTH } from '../editor/alignment'
import {
  diagramFilename,
  downloadJsonFile,
  exportDiagramJson,
  mergeImportedDiagram,
  parseImportedJson,
} from '../editor/importExport'
import { isEditableKeyboardTarget } from '../editor/keyboard'
import {
  detectConflicts,
  resolveConflicts,
  summarizeConflicts,
} from '../../shared/layout/index.ts'
import { layoutDiagram, type LayoutDirection } from '../editor/layout'
import { CommandPalette, type CommandPaletteResult } from '../editor/CommandPalette'
import { NodePalette } from '../editor/palette/NodePalette'
import { LayersPanel } from '../editor/panels/LayersPanel'
import { NodeSidePanel } from '../editor/panels/NodeSidePanel'
import { ZoomMenu } from '../editor/ZoomMenu'
import type { NodeKind, ShapeType } from '../schema'
import { useEditorStore } from '../store/editorStore'
import { useTheme } from '../theme/useTheme'

const AUTOSAVE_MS = 1000
const MINIMAP_STORAGE_KEY = 'flow-builder-minimap'
const SNAP_STORAGE_KEY = 'flow-builder-snap-grid'

function readBoolPref(key: string, fallback = true): boolean {
  try {
    const raw = localStorage.getItem(key)
    if (raw === null) return fallback
    return raw !== '0'
  } catch {
    return fallback
  }
}

function writeBoolPref(key: string, value: boolean) {
  try {
    localStorage.setItem(key, value ? '1' : '0')
  } catch {
    /* ignore */
  }
}

function readMinimapPref(): boolean {
  return readBoolPref(MINIMAP_STORAGE_KEY, true)
}

function readSnapPref(): boolean {
  return readBoolPref(SNAP_STORAGE_KEY, true)
}

function saveLabel(status: string, error: string | null): string {
  if (status === 'saving') return 'Saving...'
  if (status === 'saved') return 'Saved'
  if (status === 'dirty') return 'Unsaved changes'
  if (status === 'error') return error ?? 'Save failed'
  return ''
}

/** Rough check: any node sits far outside a typical first viewport. */
function nodesPartlyOffScreen(
  nodes: Array<{ position: { x: number; y: number }; size?: { w: number; h: number } }>,
): boolean {
  if (nodes.length === 0) return false
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const n of nodes) {
    const w = n.size?.w ?? 256
    const h = n.size?.h ?? 96
    minX = Math.min(minX, n.position.x)
    minY = Math.min(minY, n.position.y)
    maxX = Math.max(maxX, n.position.x + w)
    maxY = Math.max(maxY, n.position.y + h)
  }
  const spanX = maxX - minX
  const spanY = maxY - minY
  // Larger than ~1400x800 at zoom 1, or origin far from 0.
  return spanX > 1600 || spanY > 1000 || minX < -200 || minY < -200
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
  const { fitView, zoomIn, zoomOut, setViewport, getViewport } = useReactFlow()
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
  const pasteClipboardInPlace = useEditorStore((s) => s.pasteClipboardInPlace)
  const duplicateSelection = useEditorStore((s) => s.duplicateSelection)
  const clearSelection = useEditorStore((s) => s.clearSelection)
  const setSelection = useEditorStore((s) => s.setSelection)
  const selectAll = useEditorStore((s) => s.selectAll)
  const nudgeSelection = useEditorStore((s) => s.nudgeSelection)
  const selectedNodeIds = useEditorStore((s) => s.selectedNodeIds)
  const selectedEdgeIds = useEditorStore((s) => s.selectedEdgeIds)
  const toggleHidden = useEditorStore((s) => s.toggleHidden)
  const toggleLocked = useEditorStore((s) => s.toggleLocked)
  const showAllHidden = useEditorStore((s) => s.showAllHidden)
  const reorderZ = useEditorStore((s) => s.reorderZ)
  const groupSelection = useEditorStore((s) => s.groupSelection)
  const ungroupSelection = useEditorStore((s) => s.ungroupSelection)
  const alignSelection = useEditorStore((s) => s.alignSelection)
  const distributeSelection = useEditorStore((s) => s.distributeSelection)
  const tidySelection = useEditorStore((s) => s.tidySelection)
  const removeNodes = useEditorStore((s) => s.removeNodes)

  const [loading, setLoading] = useState(true)
  const [fitRequest, setFitRequest] = useState(0)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState('')
  const [layoutBusy, setLayoutBusy] = useState(false)
  const [ioMenuOpen, setIoMenuOpen] = useState(false)
  const [ioError, setIoError] = useState<string | null>(null)
  const [assistantOpen, setAssistantOpen] = useState(false)
  const [commandOpen, setCommandOpen] = useState(false)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const [leftTab, setLeftTab] = useState<'assets' | 'layers'>('assets')
  const [gridMode, setGridMode] = useState<GridMode>('dots')
  const [showMinimap, setShowMinimap] = useState(readMinimapPref)
  const [snapToGridEnabled, setSnapToGridEnabled] = useState(readSnapPref)
  const [tool, setTool] = useState<CanvasTool>('select')
  const [connectFromId, setConnectFromId] = useState<string | null>(null)
  const [connectFromHandle, setConnectFromHandle] = useState<string | null>(null)
  const [connectTargetId, setConnectTargetId] = useState<string | null>(null)
  const [showNodeHints, setShowNodeHints] = useState(readShowNodeHints)
  const [viewMenuOpen, setViewMenuOpen] = useState(false)
  const [connectorHint, setConnectorHint] = useState<string | null>(null)
  const [viewFocusNodeId, setViewFocusNodeId] = useState<string | null>(null)
  const [searchParams, setSearchParams] = useSearchParams()
  const viewOnly = searchParams.get('mode') === 'view'
  const savingRef = useRef(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const ioMenuRef = useRef<HTMLDivElement>(null)
  const viewMenuRef = useRef<HTMLDivElement>(null)
  const nudgeBurstRef = useRef(false)
  const nudgeTimerRef = useRef<number | null>(null)
  const uid = user?.uid
  const location = useLocation()
  const selectionKey = `${selectedNodeIds.join(',')}|${selectedEdgeIds.join(',')}`

  const setReadOnly = useEditorStore((s) => s.setReadOnly)

  const setViewOnly = useCallback(
    (next: boolean) => {
      setSearchParams(
        (prev) => {
          const params = new URLSearchParams(prev)
          if (next) params.set('mode', 'view')
          else params.delete('mode')
          return params
        },
        { replace: true },
      )
      setReadOnly(next)
      if (next) {
        setTool('select')
        setConnectFromId(null)
        setConnectFromHandle(null)
        setConnectTargetId(null)
        setConnectorHint(null)
      } else {
        setViewFocusNodeId(null)
      }
    },
    [setSearchParams, setReadOnly],
  )

  useEffect(() => {
    setReadOnly(viewOnly)
    if (viewOnly) {
      setTool('select')
      setConnectFromId(null)
      setConnectFromHandle(null)
      setConnectTargetId(null)
      setConnectorHint(null)
    } else {
      setViewFocusNodeId(null)
    }
  }, [viewOnly, setReadOnly])

  const dismissViewMenu = useCallback(() => setViewMenuOpen(false), [])
  useDismiss({
    open: viewMenuOpen,
    onDismiss: dismissViewMenu,
    rootRef: viewMenuRef,
    selectionKey,
    routeKey: location.pathname,
  })

  const dismissIoMenu = useCallback(() => setIoMenuOpen(false), [])
  useDismiss({
    open: ioMenuOpen,
    onDismiss: dismissIoMenu,
    rootRef: ioMenuRef,
    selectionKey,
    routeKey: location.pathname,
  })

  function enterConnectTool() {
    if (viewOnly) return
    setTool('connect')
    setConnectFromId(null)
    setConnectFromHandle(null)
    setConnectTargetId(null)
    try {
      if (localStorage.getItem('flow-builder-connector-hint') !== '1') {
        localStorage.setItem('flow-builder-connector-hint', '1')
        setConnectorHint('Click a node, then another to connect. Esc cancels the arrow.')
        window.setTimeout(() => setConnectorHint(null), 4000)
      }
    } catch {
      setConnectorHint('Click a node, then another to connect. Esc cancels the arrow.')
      window.setTimeout(() => setConnectorHint(null), 4000)
    }
  }

  function enterSelectTool() {
    setTool('select')
    setConnectFromId(null)
    setConnectFromHandle(null)
    setConnectTargetId(null)
    setConnectorHint(null)
  }

  const zoomToSelection = useCallback(() => {
    if (!selectedNodeIds.length) return
    void fitView({
      padding: 0.3,
      duration: 200,
      nodes: selectedNodeIds.map((id) => ({ id })),
    })
  }, [fitView, selectedNodeIds])

  const setZoomLevel = useCallback(
    (nextZoom: number) => {
      const vp = getViewport()
      const clamped = Math.max(0.05, Math.min(4, nextZoom))
      void setViewport({ ...vp, zoom: clamped }, { duration: 160 })
    },
    [getViewport, setViewport],
  )

  const toggleMinimap = useCallback(() => {
    setShowMinimap((prev) => {
      const next = !prev
      writeBoolPref(MINIMAP_STORAGE_KEY, next)
      return next
    })
  }, [])

  const toggleSnap = useCallback(() => {
    setSnapToGridEnabled((prev) => {
      const next = !prev
      writeBoolPref(SNAP_STORAGE_KEY, next)
      return next
    })
  }, [])

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
        const doc = {
          id: record.id,
          ...record.doc,
        }
        load(doc, record.revision)
        setTitleDraft(record.title)
        setLoading(false)
        const needsFit =
          record.doc.fitPending === true ||
          record.doc.layoutPending === true ||
          nodesPartlyOffScreen(record.doc.nodes)
        if (needsFit) setFitRequest((n) => n + 1)
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
  }, [uid, projectId, diagramId, load, reset, fitView])

  // Zoom to fit once nodes are measured: on open when the doc asks for it
  // (fitPending/layoutPending or off-screen nodes) and after AI/MCP edits.
  // Fitting before React Flow measures nodes gives a wrong zoom.
  // Measure-and-resolve (push-apart / full layout) runs ONLY for a fresh
  // layoutPending doc from AI/MCP. Normal opens never move user-placed cards.
  const nodesInitialized = useNodesInitialized()
  const handledFitRequest = useRef(0)
  const measureResolveBusy = useRef(false)
  // Reset measure-resolve guards whenever the open diagram changes.
  useEffect(() => {
    measureResolveBusy.current = false
    handledFitRequest.current = 0
  }, [diagramId])
  useEffect(() => {
    const wantsRequest = fitRequest > handledFitRequest.current
    const needsFit = wantsRequest || !!diagram?.fitPending
    // Only AI/MCP-generated layouts (layoutPending) may auto-move nodes.
    const needsMeasureResolve = !!diagram?.layoutPending
    if (!needsFit && !needsMeasureResolve) return
    if (!nodesInitialized) return
    if (measureResolveBusy.current) return
    handledFitRequest.current = fitRequest
    measureResolveBusy.current = true

    let cancelled = false
    const run = async () => {
      // Let ResizeObserver / dimensions changes settle into the store.
      await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())))
      await new Promise((r) => window.setTimeout(r, 120))
      if (cancelled) return

      const relayoutMeasured = async () => {
        const state = useEditorStore.getState()
        const current = state.diagram
        if (!current) return null
        try {
          const laid = await layoutDiagram(current.nodes, current.edges, {
            direction: 'DOWN',
          })
          return { nodes: laid.nodes, edges: laid.edges }
        } catch {
          return resolveConflicts(current.nodes, current.edges, { direction: 'DOWN' })
        }
      }

      if (needsMeasureResolve) {
        try {
          let fixed = await relayoutMeasured()
          if (fixed && !cancelled) {
            applyNodeLayout(fixed.nodes, fixed.edges)
          }
          // Cards may grow once more after the first pass; wait and clear leftovers.
          await new Promise((r) => window.setTimeout(r, 280))
          if (!cancelled) {
            let mid = useEditorStore.getState().diagram
            for (let pass = 0; mid && pass < 4; pass += 1) {
              const still = detectConflicts(mid.nodes, mid.edges, { direction: 'DOWN' })
              if (still.nodeOverlaps.length === 0 && still.edgesThroughNodes.length === 0) {
                break
              }
              if (pass === 2) {
                // Full relayout with measured sizes when push-apart is not enough.
                try {
                  const laid = await layoutDiagram(mid.nodes, mid.edges, {
                    direction: 'DOWN',
                  })
                  applyNodeLayout(laid.nodes, laid.edges)
                } catch {
                  const again = resolveConflicts(mid.nodes, mid.edges, {
                    direction: 'DOWN',
                    maxPasses: 20,
                  })
                  applyNodeLayout(again.nodes, again.edges)
                }
              } else {
                const again = resolveConflicts(mid.nodes, mid.edges, {
                  direction: 'DOWN',
                  maxPasses: 20,
                })
                applyNodeLayout(again.nodes, again.edges)
              }
              await new Promise((r) => window.setTimeout(r, 120))
              mid = useEditorStore.getState().diagram
            }
          }
        } catch {
          // Keep estimated layout; fit still runs below.
        }
      }

      if (cancelled) {
        measureResolveBusy.current = false
        return
      }

      requestAnimationFrame(() => {
        // Tall flows need room for the minimap / controls; allow very low zoom.
        void fitView({ padding: 0.28, duration: 280, maxZoom: 1.25, minZoom: 0.05 })
        useEditorStore.setState((s) => {
          if (!s.diagram?.fitPending && !s.diagram?.layoutPending) return s
          return {
            diagram: { ...s.diagram!, fitPending: false, layoutPending: false },
            saveStatus: 'dirty' as const,
          }
        })
        measureResolveBusy.current = false
      })
    }

    void run()
    return () => {
      cancelled = true
      measureResolveBusy.current = false
    }
  }, [
    fitRequest,
    diagram?.fitPending,
    diagram?.layoutPending,
    nodesInitialized,
    fitView,
    applyNodeLayout,
  ])

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

  const conflictSummary = useMemo(() => {
    if (!diagram || diagram.nodes.length === 0) return null
    const report = detectConflicts(diagram.nodes, diagram.edges, { direction: 'DOWN' })
    const summary = summarizeConflicts(report)
    return summary.hasConflicts ? summary : null
  }, [diagram])

  const runLayout = useCallback(
    async (direction: LayoutDirection = 'DOWN') => {
      const state = useEditorStore.getState()
      const current = state.diagram
      if (!current || layoutBusy) return
      setLayoutBusy(true)
      setIoError(null)
      try {
        document.body.classList.add('is-layout-animating')
        const selected = state.selectedNodeIds
        const options =
          selected.length >= 2
            ? { direction, nodeIds: selected }
            : { direction }
        const laid = await layoutDiagram(current.nodes, current.edges, options)
        applyNodeLayout(laid.nodes, laid.edges)
        requestAnimationFrame(() =>
          fitView({ padding: 0.28, duration: 280, maxZoom: 1.25, minZoom: 0.05 }),
        )
      } catch (err) {
        setIoError(err instanceof Error ? err.message : 'Layout failed')
      } finally {
        window.setTimeout(() => document.body.classList.remove('is-layout-animating'), 320)
        setLayoutBusy(false)
      }
    },
    [applyNodeLayout, fitView, layoutBusy],
  )

  const fixLayoutConflicts = useCallback(() => {
    const state = useEditorStore.getState()
    const current = state.diagram
    if (!current || layoutBusy || state.readOnly) return
    setLayoutBusy(true)
    void (async () => {
      try {
        let fixed = resolveConflicts(current.nodes, current.edges, { direction: 'DOWN' })
        const still = detectConflicts(fixed.nodes, fixed.edges, { direction: 'DOWN' })
        if (still.nodeOverlaps.length > 0 || still.edgesThroughNodes.length > 0) {
          const laid = await layoutDiagram(fixed.nodes, fixed.edges, { direction: 'DOWN' })
          fixed = { nodes: laid.nodes, edges: laid.edges, report: still }
        }
        applyNodeLayout(fixed.nodes, fixed.edges)
        requestAnimationFrame(() =>
          fitView({ padding: 0.28, duration: 200, maxZoom: 1.25, minZoom: 0.05 }),
        )
      } finally {
        setLayoutBusy(false)
      }
    })()
  }, [applyNodeLayout, fitView, layoutBusy])


  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const meta = e.metaKey || e.ctrlKey
      const key = e.key.toLowerCase()
      const typing = isEditableKeyboardTarget(e.target)

      if (key === 'escape') {
        if (commandOpen) {
          setCommandOpen(false)
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
        if (tool === 'connect') {
          if (connectFromId) {
            setConnectFromId(null)
            setConnectFromHandle(null)
            setConnectTargetId(null)
            return
          }
          enterSelectTool()
          return
        }
        if (viewOnly && viewFocusNodeId) {
          setViewFocusNodeId(null)
          return
        }
        if (!typing) clearSelection()
        return
      }

      if (viewOnly) {
        if (meta && (key === 'k' || key === '/')) {
          e.preventDefault()
          setCommandOpen(true)
        }
        return
      }

      if (!typing && !meta && (key === 'c' || key === 'x')) {
        e.preventDefault()
        enterConnectTool()
        return
      }

      if (!typing && !meta && key === 'v') {
        e.preventDefault()
        enterSelectTool()
        return
      }

      if (meta && (key === 'k' || key === '/')) {
        e.preventDefault()
        setCommandOpen(true)
        return
      }

      if (!typing && e.shiftKey && !meta && !e.altKey && (e.key === '?' || e.code === 'Slash')) {
        e.preventDefault()
        setShortcutsOpen(true)
        return
      }

      if (!typing && e.shiftKey && !meta && !e.altKey) {
        if (e.key === '!' || e.code === 'Digit1') {
          // Shift+1
          if (e.code === 'Digit1') {
            e.preventDefault()
            void fitView({ padding: 0.2, duration: 200 })
            return
          }
        }
        if (e.code === 'Digit2') {
          e.preventDefault()
          zoomToSelection()
          return
        }
        if (e.code === 'Digit0') {
          e.preventDefault()
          setZoomLevel(1)
          return
        }
      }

      if (!typing && !meta && !e.altKey) {
        const arrow =
          e.key === 'ArrowLeft'
            ? { dx: -1, dy: 0 }
            : e.key === 'ArrowRight'
              ? { dx: 1, dy: 0 }
              : e.key === 'ArrowUp'
                ? { dx: 0, dy: -1 }
                : e.key === 'ArrowDown'
                  ? { dx: 0, dy: 1 }
                  : null
        if (arrow && selectedNodeIds.length) {
          e.preventDefault()
          const step = e.shiftKey ? 10 : 1
          const record = !nudgeBurstRef.current
          nudgeBurstRef.current = true
          nudgeSelection(arrow.dx * step, arrow.dy * step, record)
          if (nudgeTimerRef.current != null) window.clearTimeout(nudgeTimerRef.current)
          nudgeTimerRef.current = window.setTimeout(() => {
            nudgeBurstRef.current = false
            nudgeTimerRef.current = null
          }, 400)
          return
        }
      }

      if (!meta) return
      if (typing && key !== 's') return

      if (key === 'a' && !typing) {
        e.preventDefault()
        selectAll()
      } else if (key === 'z' && !e.shiftKey) {
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
        if (e.shiftKey) {
          pasteClipboardInPlace()
        } else {
          const cursor = getLastFlowPoint()
          pasteClipboard(cursor ?? undefined)
        }
      } else if (key === 'd' && !typing) {
        e.preventDefault()
        duplicateSelection()
      } else if (key === 'g' && !typing) {
        e.preventDefault()
        if (e.shiftKey) ungroupSelection()
        else groupSelection()
      } else if (key === 'h' && e.shiftKey && !typing) {
        e.preventDefault()
        if (selectedNodeIds.length) toggleHidden(selectedNodeIds)
      } else if (key === 'l' && e.shiftKey && !typing) {
        e.preventDefault()
        void runLayout('DOWN')
      } else if (key === 'l' && e.altKey && !typing) {
        e.preventDefault()
        if (selectedNodeIds.length) toggleLocked(selectedNodeIds)
      } else if (key === ']' && !typing) {
        e.preventDefault()
        if (!selectedNodeIds.length) return
        reorderZ(selectedNodeIds, e.altKey || e.shiftKey ? 'front' : 'forward')
      } else if (key === '[' && !typing) {
        e.preventDefault()
        if (!selectedNodeIds.length) return
        reorderZ(selectedNodeIds, e.altKey || e.shiftKey ? 'back' : 'backward')
      } else if (key === '.' && e.shiftKey && !typing) {
        e.preventDefault()
        showAllHidden()
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
    pasteClipboardInPlace,
    duplicateSelection,
    groupSelection,
    ungroupSelection,
    clearSelection,
    selectAll,
    nudgeSelection,
    commandOpen,
    shortcutsOpen,
    assistantOpen,
    selectedNodeIds,
    toggleHidden,
    toggleLocked,
    reorderZ,
    showAllHidden,
    fitView,
    zoomToSelection,
    setZoomLevel,
    tool,
    connectFromId,
    viewOnly,
    viewFocusNodeId,
    runLayout,
  ])

  const onAddKind = useCallback(
    (kind: NodeKind, options?: { shape?: ShapeType }) => {
      const cursor = getLastFlowPoint()
      if (cursor) {
        addNode(
          kind,
          dropPositionFromFlowPoint(cursor, {
            nodeWidth: DEFAULT_NODE_WIDTH,
            nodeHeight: DEFAULT_NODE_HEIGHT,
          }),
          options,
        )
        return
      }
      const offset = useEditorStore.getState().diagram?.nodes.length ?? 0
      addNode(
        kind,
        {
          x: 120 + (offset % 4) * 280,
          y: 80 + Math.floor(offset / 4) * 160,
        },
        options,
      )
    },
    [addNode],
  )

  const onDropKind = useCallback(
    (kind: string, position: { x: number; y: number }) => {
      const payload = parsePalettePayload(kind)
      if (!payload) return
      addNode(payload.kind, position, payload.shape ? { shape: payload.shape } : undefined)
    },
    [addNode],
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

  const commandActions = useMemo(() => {
    const viewActions = [
      { id: 'fit', label: 'Zoom to fit', hint: 'View' },
      { id: 'shortcuts', label: 'Keyboard shortcuts', hint: 'Help', keywords: 'shift ?' },
      {
        id: 'exit-view',
        label: 'Exit view only',
        hint: 'View',
        keywords: 'edit mode',
      },
    ]
    if (viewOnly) return viewActions
    return [
      { id: 'undo', label: 'Undo', hint: 'Edit', keywords: 'history' },
      { id: 'redo', label: 'Redo', hint: 'Edit', keywords: 'history' },
      { id: 'group', label: 'Group selection', hint: 'Arrange', keywords: 'cmd g' },
      { id: 'ungroup', label: 'Ungroup', hint: 'Arrange', keywords: 'cmd shift g' },
      { id: 'duplicate', label: 'Duplicate', hint: 'Edit', keywords: 'cmd d' },
      { id: 'hide', label: 'Hide / show', hint: 'Layer', keywords: 'visibility' },
      { id: 'lock', label: 'Lock / unlock', hint: 'Layer' },
      { id: 'align-left', label: 'Align left', hint: 'Arrange' },
      { id: 'align-center', label: 'Align centre', hint: 'Arrange' },
      { id: 'align-right', label: 'Align right', hint: 'Arrange' },
      { id: 'align-top', label: 'Align top', hint: 'Arrange' },
      { id: 'align-middle', label: 'Align middle', hint: 'Arrange' },
      { id: 'align-bottom', label: 'Align bottom', hint: 'Arrange' },
      { id: 'distribute-h', label: 'Distribute horizontally', hint: 'Arrange' },
      { id: 'distribute-v', label: 'Distribute vertically', hint: 'Arrange' },
      { id: 'tidy', label: 'Tidy up', hint: 'Arrange' },
      {
        id: 'auto-arrange',
        label: 'Auto-arrange',
        hint: 'Arrange',
        keywords: 'layout elk cmd shift l',
      },
      { id: 'select-all', label: 'Select all', hint: 'Selection' },
      { id: 'delete', label: 'Delete selection', hint: 'Edit', keywords: 'remove' },
      { id: 'shortcuts', label: 'Keyboard shortcuts', hint: 'Help', keywords: 'shift ?' },
      { id: 'fit', label: 'Zoom to fit', hint: 'View' },
      {
        id: 'enter-view',
        label: 'View only',
        hint: 'View',
        keywords: 'read only share',
      },
    ]
  }, [viewOnly])

  const onCommandSelect = useCallback(
    (result: CommandPaletteResult) => {
      setCommandOpen(false)
      if (result.type === 'add') {
        if (viewOnly) return
        const cursor = getLastFlowPoint()
        if (cursor) {
          addNode(
            result.kind,
            dropPositionFromFlowPoint(cursor, {
              nodeWidth: DEFAULT_NODE_WIDTH,
              nodeHeight: DEFAULT_NODE_HEIGHT,
            }),
          )
          return
        }
        const offset = useEditorStore.getState().diagram?.nodes.length ?? 0
        addNode(result.kind, { x: 120 + (offset % 5) * 40, y: 80 + (offset % 5) * 40 })
        return
      }
      if (result.type === 'focus') {
        if (viewOnly) setViewFocusNodeId(result.nodeId)
        setSelection([result.nodeId], [])
        requestAnimationFrame(() =>
          fitView({ padding: 0.35, duration: 200, nodes: [{ id: result.nodeId }] }),
        )
        return
      }
      switch (result.actionId) {
        case 'enter-view':
          setViewOnly(true)
          break
        case 'exit-view':
          setViewOnly(false)
          break
        case 'undo':
          if (!viewOnly) undo()
          break
        case 'redo':
          if (!viewOnly) redo()
          break
        case 'group':
          if (!viewOnly) groupSelection()
          break
        case 'ungroup':
          if (!viewOnly) ungroupSelection()
          break
        case 'duplicate':
          if (!viewOnly) duplicateSelection()
          break
        case 'hide':
          if (!viewOnly && selectedNodeIds.length) toggleHidden(selectedNodeIds)
          break
        case 'lock':
          if (!viewOnly && selectedNodeIds.length) toggleLocked(selectedNodeIds)
          break
        case 'align-left':
          if (!viewOnly) alignSelection('left')
          break
        case 'align-center':
          if (!viewOnly) alignSelection('center')
          break
        case 'align-right':
          if (!viewOnly) alignSelection('right')
          break
        case 'align-top':
          if (!viewOnly) alignSelection('top')
          break
        case 'align-middle':
          if (!viewOnly) alignSelection('middle')
          break
        case 'align-bottom':
          if (!viewOnly) alignSelection('bottom')
          break
        case 'distribute-h':
          if (!viewOnly) distributeSelection('horizontal')
          break
        case 'distribute-v':
          if (!viewOnly) distributeSelection('vertical')
          break
        case 'tidy':
          if (!viewOnly) tidySelection()
          break
        case 'auto-arrange':
          if (!viewOnly) void runLayout('DOWN')
          break
        case 'select-all':
          if (!viewOnly) selectAll()
          break
        case 'delete':
          if (!viewOnly && selectedNodeIds.length) removeNodes(selectedNodeIds)
          break
        case 'shortcuts':
          setShortcutsOpen(true)
          break
        case 'fit':
          void fitView({ padding: 0.2, duration: 200 })
          break
        default:
          break
      }
    },
    [
      addNode,
      fitView,
      setSelection,
      undo,
      redo,
      groupSelection,
      ungroupSelection,
      duplicateSelection,
      selectedNodeIds,
      toggleHidden,
      toggleLocked,
      alignSelection,
      distributeSelection,
      tidySelection,
      selectAll,
      removeNodes,
      runLayout,
      viewOnly,
      setViewOnly,
    ],
  )

  useEffect(() => {
    function onAutoArrange() {
      void runLayout('DOWN')
    }
    window.addEventListener('flow-builder:auto-arrange', onAutoArrange)
    return () => window.removeEventListener('flow-builder:auto-arrange', onAutoArrange)
  }, [runLayout])

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
              disabled={viewOnly || past.length === 0}
              onClick={() => undo()}
            >
              <Undo2 size={16} />
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-icon"
              aria-label="Redo"
              title="Redo"
              disabled={viewOnly || future.length === 0}
              onClick={() => redo()}
            >
              <Redo2 size={16} />
            </button>
          </div>
          <span className="editor-toolbar-divider" aria-hidden />
          <div className="editor-toolbar-group">
            <ZoomMenu
              zoom={zoom}
              hasSelection={selectedNodeIds.length > 0}
              actions={{
                zoomIn: () => zoomIn({ duration: 120 }),
                zoomOut: () => zoomOut({ duration: 120 }),
                fit: () => void fitView({ padding: 0.2, duration: 200 }),
                selection: zoomToSelection,
                setZoom: setZoomLevel,
              }}
            />
          </div>
          <span className="editor-toolbar-divider" aria-hidden />
          <div className="editor-toolbar-group">
            <button
              type="button"
              className={`btn btn-ghost btn-icon ${tool === 'connect' ? 'is-active' : ''}`}
              aria-label="Connector tool"
              aria-pressed={tool === 'connect'}
              title="Connector tool (C)"
              data-testid="connector-tool"
              disabled={viewOnly}
              onClick={() => {
                if (tool === 'connect') enterSelectTool()
                else enterConnectTool()
              }}
            >
              <Spline size={16} />
            </button>
            <button
              type="button"
              className={`btn btn-ghost btn-icon ${viewOnly ? 'is-active' : ''}`}
              aria-label="View only"
              aria-pressed={viewOnly}
              title="View only. Shared links work for the owner while rules are per user (no public sharing yet)."
              data-testid="view-only-toggle"
              onClick={() => setViewOnly(!viewOnly)}
            >
              <Eye size={16} />
            </button>
            <div className="view-menu" ref={viewMenuRef}>
              <button
                type="button"
                className="btn btn-ghost btn-icon"
                aria-label="View settings"
                aria-haspopup="menu"
                aria-expanded={viewMenuOpen}
                title="View settings"
                data-testid="view-menu"
                onClick={() => setViewMenuOpen((v) => !v)}
              >
                <SlidersHorizontal size={16} />
              </button>
              {viewMenuOpen ? (
                <div className="view-menu-popover" role="menu" aria-label="View settings">
                  <button
                    type="button"
                    role="menuitemcheckbox"
                    aria-checked={showNodeHints}
                    className="view-menu-item"
                    data-testid="show-node-hints"
                    onClick={() => {
                      const next = !showNodeHints
                      setShowNodeHints(next)
                      writeShowNodeHints(next)
                    }}
                  >
                    {showNodeHints ? 'Hide node hints' : 'Show node hints'}
                  </button>
                  <button
                    type="button"
                    role="menuitemcheckbox"
                    aria-checked={showMinimap}
                    className="view-menu-item"
                    onClick={toggleMinimap}
                  >
                    {showMinimap ? 'Hide minimap' : 'Show minimap'}
                  </button>
                </div>
              ) : null}
            </div>
            <button
              type="button"
              className="btn btn-ghost btn-icon"
              aria-label="Auto-arrange"
              title="Auto-arrange (Ctrl/Cmd+Shift+L)"
              data-testid="auto-arrange"
              disabled={viewOnly || layoutBusy || diagram.nodes.length === 0}
              onClick={() => void runLayout('DOWN')}
            >
              <LayoutTemplate size={16} />
            </button>
            {conflictSummary && !viewOnly ? (
              <div
                className="layout-conflict-badge"
                data-testid="layout-conflict-badge"
                title={conflictSummary.label}
              >
                <AlertTriangle size={14} aria-hidden />
                <span>{conflictSummary.label}</span>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  data-testid="fix-layout"
                  onClick={fixLayoutConflicts}
                >
                  Fix layout
                </button>
              </div>
            ) : null}
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
              className={`btn btn-ghost btn-icon ${snapToGridEnabled ? 'is-active' : ''}`}
              aria-label={snapToGridEnabled ? 'Disable grid snap' : 'Enable grid snap'}
              aria-pressed={snapToGridEnabled}
              title="Toggle 16px grid snap (Alt disables while dragging)"
              data-testid="toggle-snap"
              onClick={toggleSnap}
            >
              <Magnet size={16} />
            </button>
            <button
              type="button"
              className={`btn btn-ghost btn-icon ${showMinimap ? 'is-active' : ''}`}
              aria-label={showMinimap ? 'Hide minimap' : 'Show minimap'}
              aria-pressed={showMinimap}
              title="Toggle minimap"
              data-testid="toggle-minimap"
              onClick={toggleMinimap}
            >
              <MapIcon size={16} />
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-icon"
              aria-label="Search nodes"
              title="Quick actions (Ctrl/Cmd+K)"
              onClick={() => setCommandOpen(true)}
            >
              <Search size={16} />
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-icon"
              aria-label="Keyboard shortcuts"
              title="Keyboard shortcuts (Shift+?)"
              data-testid="shortcuts-button"
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
              disabled={
                viewOnly ||
                saveStatus === 'saving' ||
                saveStatus === 'saved' ||
                saveStatus === 'idle'
              }
            >
              <Save size={16} aria-hidden />
              Save
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              aria-pressed={assistantOpen}
              disabled={viewOnly}
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

      <div
        className={`editor-body ${assistantOpen ? 'has-ai-panel' : ''} ${viewOnly ? 'is-view-only' : ''}`}
        data-testid="editor-body"
        data-view-only={viewOnly ? 'true' : undefined}
      >
        {!viewOnly ? (
          <div className="editor-left" data-testid="editor-left-panel">
            <div className="editor-left-tabs" role="tablist" aria-label="Left panel">
              <button
                type="button"
                role="tab"
                aria-selected={leftTab === 'assets'}
                className={`editor-left-tab ${leftTab === 'assets' ? 'is-active' : ''}`}
                onClick={() => setLeftTab('assets')}
              >
                Assets
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={leftTab === 'layers'}
                className={`editor-left-tab ${leftTab === 'layers' ? 'is-active' : ''}`}
                data-testid="layers-tab"
                onClick={() => setLeftTab('layers')}
              >
                Layers
              </button>
            </div>
            {leftTab === 'assets' ? (
              <NodePalette onAdd={onAddKind} diagramTitle={diagram.title} />
            ) : (
              <LayersPanel />
            )}
          </div>
        ) : null}
        <Canvas
          gridMode={gridMode}
          showMinimap={showMinimap}
          snapToGridEnabled={snapToGridEnabled}
          tool={viewOnly ? 'select' : tool}
          connectFromId={viewOnly ? null : connectFromId}
          onConnectFromChange={setConnectFromId}
          connectFromHandle={viewOnly ? null : connectFromHandle}
          onConnectFromHandleChange={setConnectFromHandle}
          connectTargetId={viewOnly ? null : connectTargetId}
          onConnectTargetChange={setConnectTargetId}
          viewOnly={viewOnly}
          viewFocusNodeId={viewFocusNodeId}
          onViewFocusChange={setViewFocusNodeId}
          onDropKind={viewOnly ? undefined : onDropKind}
          emptyAction={
            viewOnly ? undefined : (
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setCommandOpen(true)}
              >
                Add a node
              </button>
            )
          }
        />
        {connectorHint ? (
          <div className="toast" role="status" data-testid="connector-hint-toast">
            {connectorHint}
          </div>
        ) : null}
        {assistantOpen && projectId && diagramId && !viewOnly ? (
          <AssistantPanel
            open={assistantOpen}
            onClose={() => setAssistantOpen(false)}
            projectId={projectId}
            diagramId={diagramId}
          />
        ) : viewOnly ? (
          viewFocusNodeId ? <NodeSidePanel readOnly /> : null
        ) : (
          <NodeSidePanel />
        )}
      </div>

      <CommandPalette
        open={commandOpen}
        nodes={diagram.nodes}
        actions={commandActions}
        allowAdd={!viewOnly}
        onClose={() => setCommandOpen(false)}
        onSelect={onCommandSelect}
      />

      {shortcutsOpen ? (
        <div
          className="dialog-backdrop"
          role="presentation"
          data-testid="shortcuts-sheet"
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
                <kbd>Space</kbd>+drag Pan canvas
              </li>
              <li>
                <kbd>Shift</kbd>+<kbd>1</kbd> Zoom to fit
              </li>
              <li>
                <kbd>Shift</kbd>+<kbd>2</kbd> Zoom to selection
              </li>
              <li>
                <kbd>Shift</kbd>+<kbd>0</kbd> Zoom 100%
              </li>
              <li>
                <kbd>Ctrl/Cmd</kbd>+scroll Zoom at cursor
              </li>
              <li>
                <kbd>Ctrl/Cmd</kbd>+<kbd>A</kbd> Select all
              </li>
              <li>
                Arrows Nudge 1px · <kbd>Shift</kbd>+arrows 10px
              </li>
              <li>
                <kbd>Alt</kbd> Disable snap while dragging · hover to measure
              </li>
              <li>
                <kbd>Alt</kbd>+drag Duplicate (leave a copy behind)
              </li>
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
                <kbd>Ctrl/Cmd</kbd>+<kbd>Shift</kbd>+<kbd>V</kbd> Paste in place
              </li>
              <li>
                <kbd>Ctrl/Cmd</kbd>+<kbd>D</kbd> Duplicate selection
              </li>
              <li>
                <kbd>Ctrl/Cmd</kbd>+<kbd>G</kbd> Group · <kbd>Shift</kbd>+<kbd>G</kbd> Ungroup
              </li>
              <li>
                <kbd>Ctrl/Cmd</kbd>+<kbd>K</kbd> or <kbd>/</kbd> Quick actions
              </li>
              <li>
                <kbd>Shift</kbd>+<kbd>?</kbd> This shortcuts sheet
              </li>
              <li>
                <kbd>Ctrl/Cmd</kbd>+<kbd>Shift</kbd>+<kbd>H</kbd> Hide / show
              </li>
              <li>
                <kbd>Ctrl/Cmd</kbd>+<kbd>Shift</kbd>+<kbd>L</kbd> Auto-arrange
              </li>
              <li>
                <kbd>Ctrl/Cmd</kbd>+<kbd>Alt</kbd>+<kbd>L</kbd> Lock / unlock
              </li>
              <li>
                <kbd>Ctrl/Cmd</kbd>+<kbd>]</kbd> / <kbd>[</kbd> Bring forward / send backward
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
