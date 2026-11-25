import { createElement, useEffect, useMemo, useRef, useState } from 'react'
import {
  getLucideIcon,
  pushRecentIcon,
  readRecentIcons,
  searchIcons,
  type IconEntry,
} from './icons'
import { Layers } from 'lucide-react'

type Props = {
  value?: string
  onChange: (name: string) => void
  fallbackIconName?: string
}

const CELL = 36
const COLS = 8
const ROW_HEIGHT = 40
const VISIBLE_ROWS = 7

export function IconPicker({ value, onChange, fallbackIconName = 'layers' }: Props) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [recent, setRecent] = useState<string[]>(() => readRecentIcons())
  const [scrollTop, setScrollTop] = useState(0)
  const rootRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const results = useMemo(() => searchIcons(query), [query])
  const totalRows = Math.ceil(results.length / COLS)
  const startRow = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - 1)
  const endRow = Math.min(totalRows, startRow + VISIBLE_ROWS + 2)
  const visible: Array<{ entry: IconEntry; row: number; col: number }> = []
  for (let row = startRow; row < endRow; row += 1) {
    for (let col = 0; col < COLS; col += 1) {
      const entry = results[row * COLS + col]
      if (entry) visible.push({ entry, row, col })
    }
  }

  const fallback = getLucideIcon(fallbackIconName, Layers)
  const currentIcon = getLucideIcon(value ?? fallbackIconName, fallback)

  function pick(name: string) {
    onChange(name)
    setRecent(pushRecentIcon(name))
    setOpen(false)
    setQuery('')
  }

  return (
    <div className="icon-picker" ref={rootRef}>
      <button
        type="button"
        className="icon-picker-trigger"
        aria-label="Choose icon"
        aria-expanded={open}
        onClick={() => {
          setRecent(readRecentIcons())
          setOpen((v) => !v)
        }}
      >
        {createElement(currentIcon, { size: 16, strokeWidth: 2, 'aria-hidden': true })}
        <span>{value ?? 'Pick icon'}</span>
      </button>

      {open ? (
        <div className="icon-picker-popover" role="dialog" aria-label="Icon picker">
          <label className="field">
            <span className="sr-only">Search icons</span>
            <input
              autoFocus
              placeholder="Search icons"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value)
                setScrollTop(0)
                if (listRef.current) listRef.current.scrollTop = 0
              }}
              aria-label="Search icons"
            />
          </label>

          {recent.length > 0 && !query.trim() ? (
            <div className="icon-picker-recent">
              <p className="side-section-label">Recent</p>
              <div className="icon-picker-grid static">
                {recent.map((name) => {
                  const Icon = getLucideIcon(name, currentIcon)
                  return (
                    <button
                      key={name}
                      type="button"
                      className={`icon-picker-cell ${value === name ? 'is-active' : ''}`}
                      title={name}
                      aria-label={name}
                      onClick={() => pick(name)}
                    >
                      {createElement(Icon, { size: 16, strokeWidth: 2 })}
                    </button>
                  )
                })}
              </div>
            </div>
          ) : null}

          <div
            className="icon-picker-viewport"
            ref={listRef}
            onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
            role="listbox"
            aria-label="Icons"
          >
            <div style={{ height: totalRows * ROW_HEIGHT, position: 'relative' }}>
              {visible.map(({ entry, row, col }) => (
                <button
                  key={entry.name}
                  type="button"
                  role="option"
                  aria-selected={value === entry.name}
                  className={`icon-picker-cell ${value === entry.name ? 'is-active' : ''}`}
                  title={entry.name}
                  aria-label={entry.name}
                  style={{
                    position: 'absolute',
                    top: row * ROW_HEIGHT,
                    left: col * CELL,
                    width: CELL,
                    height: CELL,
                  }}
                  onClick={() => pick(entry.name)}
                >
                  {createElement(entry.icon, { size: 16, strokeWidth: 2 })}
                </button>
              ))}
            </div>
          </div>
          <p className="icon-picker-count">{results.length} icons</p>
        </div>
      ) : null}
    </div>
  )
}
