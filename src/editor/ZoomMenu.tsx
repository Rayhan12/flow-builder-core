import { useEffect, useRef, useState } from 'react'

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

  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

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
