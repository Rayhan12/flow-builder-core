import { useCallback, useRef, useState } from 'react'
import { useDismiss } from '../hooks/useDismiss'
import { useEditorStore } from '../store/editorStore'

export type ZoomMenuActions = {
  zoomIn: () => void
  zoomOut: () => void
  fit: () => void
  selection: () => void
  setZoom: (zoom: number) => void
}

type Props = {
  zoom: number
  actions: ZoomMenuActions
  hasSelection: boolean
}

const PRESETS = [
  { label: 'Zoom in', action: 'in' as const },
  { label: 'Zoom out', action: 'out' as const },
  { label: 'Zoom to fit', action: 'fit' as const },
  { label: 'Zoom to selection', action: 'selection' as const },
  { label: '50%', action: 'preset' as const, value: 0.5 },
  { label: '100%', action: 'preset' as const, value: 1 },
  { label: '200%', action: 'preset' as const, value: 2 },
]

export function ZoomMenu({ zoom, actions, hasSelection }: Props) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const selectedNodeIds = useEditorStore((s) => s.selectedNodeIds)
  const selectedEdgeIds = useEditorStore((s) => s.selectedEdgeIds)
  const selectionKey = `${selectedNodeIds.join(',')}|${selectedEdgeIds.join(',')}`
  const dismiss = useCallback(() => setOpen(false), [])
  useDismiss({
    open,
    onDismiss: dismiss,
    rootRef,
    selectionKey,
    routeKey: typeof window !== 'undefined' ? window.location.pathname : undefined,
  })

  return (
    <div className="zoom-menu" ref={rootRef} data-testid="zoom-menu">
      <button
        type="button"
        className="btn btn-ghost zoom-menu-trigger"
        aria-label="Zoom"
        aria-haspopup="menu"
        aria-expanded={open}
        data-testid="zoom-chip"
        onClick={() => setOpen((v) => !v)}
      >
        {Math.round(zoom * 100)}%
      </button>
      {open ? (
        <div className="zoom-menu-popover" role="menu" aria-label="Zoom options">
          {PRESETS.map((item) => {
            const disabled = item.action === 'selection' && !hasSelection
            return (
              <button
                key={item.label}
                type="button"
                role="menuitem"
                className="zoom-menu-item"
                disabled={disabled}
                onClick={() => {
                  setOpen(false)
                  if (item.action === 'in') actions.zoomIn()
                  else if (item.action === 'out') actions.zoomOut()
                  else if (item.action === 'fit') actions.fit()
                  else if (item.action === 'selection') actions.selection()
                  else if (item.action === 'preset' && item.value != null) {
                    actions.setZoom(item.value)
                  }
                }}
              >
                {item.label}
              </button>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}
