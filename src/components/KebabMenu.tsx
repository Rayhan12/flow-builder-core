import { MoreHorizontal } from 'lucide-react'
import { useCallback, useRef, useState, type ReactNode } from 'react'
import { useDismiss } from '../hooks/useDismiss'

export type KebabItem = {
  label: string
  icon?: ReactNode
  danger?: boolean
  onSelect: () => void
}

type KebabMenuProps = {
  label: string
  items: KebabItem[]
}

export function KebabMenu({ label, items }: KebabMenuProps) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const dismiss = useCallback(() => setOpen(false), [])
  useDismiss({
    open,
    onDismiss: dismiss,
    rootRef,
    routeKey: typeof window !== 'undefined' ? window.location.pathname : undefined,
  })

  return (
    <div className="kebab" ref={rootRef}>
      <button
        type="button"
        className="btn btn-ghost btn-icon kebab-trigger"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <MoreHorizontal size={16} />
      </button>
      {open ? (
        <div className="kebab-menu" role="menu" aria-label={label}>
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              className={`kebab-item ${item.danger ? 'is-danger' : ''}`}
              onClick={() => {
                setOpen(false)
                item.onSelect()
              }}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}
