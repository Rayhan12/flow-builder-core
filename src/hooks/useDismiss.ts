import { useEffect, useRef, type RefObject } from 'react'

export type UseDismissOptions = {
  open: boolean
  onDismiss: () => void
  /** Root element that owns the popover; pointerdown outside closes. */
  rootRef: RefObject<HTMLElement | null>
  /** Close when Escape is pressed. Default true. */
  escape?: boolean
  /** Close when this key changes while open (e.g. selected node/edge ids). */
  selectionKey?: string
  /** Close when this key changes while open (e.g. location.pathname). */
  routeKey?: string
}

/**
 * Shared dismiss behaviour for menus and popovers:
 * pointerdown outside, Escape, selection change, and route change.
 */
export function useDismiss({
  open,
  onDismiss,
  rootRef,
  escape = true,
  selectionKey,
  routeKey,
}: UseDismissOptions): void {
  const selectionAtOpen = useRef(selectionKey)
  const routeAtOpen = useRef(routeKey)
  const prevOpen = useRef(false)

  useEffect(() => {
    if (open && !prevOpen.current) {
      selectionAtOpen.current = selectionKey
      routeAtOpen.current = routeKey
    }
    prevOpen.current = open
  }, [open, selectionKey, routeKey])

  useEffect(() => {
    if (!open) return

    function onPointerDown(e: PointerEvent) {
      const root = rootRef.current
      if (!root) return
      const target = e.target as Node | null
      if (target && !root.contains(target)) onDismiss()
    }

    function onKey(e: KeyboardEvent) {
      if (escape && e.key === 'Escape') {
        e.stopPropagation()
        onDismiss()
      }
    }

    document.addEventListener('pointerdown', onPointerDown, true)
    document.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true)
      document.removeEventListener('keydown', onKey, true)
    }
  }, [open, onDismiss, rootRef, escape])

  useEffect(() => {
    if (!open || selectionKey === undefined) return
    if (selectionKey !== selectionAtOpen.current) onDismiss()
  }, [open, selectionKey, onDismiss])

  useEffect(() => {
    if (!open || routeKey === undefined) return
    if (routeKey !== routeAtOpen.current) onDismiss()
  }, [open, routeKey, onDismiss])
}
