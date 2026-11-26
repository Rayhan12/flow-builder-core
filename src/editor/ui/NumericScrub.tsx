import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'

export type NumericScrubChange = {
  /** True when this change should start a new undo step (false while a burst continues). */
  record: boolean
}

type Props = {
  label: string
  value: number | 'Mixed'
  onChange: (next: number, info: NumericScrubChange) => void
  min?: number
  max?: number
  step?: number
  testId?: string
}

/** Edits closer together than this share one undo step. */
const BURST_MS = 600

function clamp(n: number, min?: number, max?: number): number {
  let next = n
  if (min != null) next = Math.max(min, next)
  if (max != null) next = Math.min(max, next)
  return next
}

function decimals(step: number): number {
  const text = String(step)
  const dot = text.indexOf('.')
  return dot === -1 ? 0 : text.length - dot - 1
}

export function NumericScrub({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  testId,
}: Props) {
  const startRef = useRef<{ x: number; value: number; moved: boolean } | null>(null)
  const lastEditRef = useRef(0)
  const cancelRef = useRef(false)
  const [scrubbing, setScrubbing] = useState(false)
  const [draft, setDraft] = useState<string | null>(null)

  function commit(raw: number, startsBurst: boolean) {
    const places = decimals(step)
    const rounded = Number((Math.round(raw / step) * step).toFixed(places))
    const now = Date.now()
    const record = startsBurst || now - lastEditRef.current > BURST_MS
    lastEditRef.current = now
    onChange(clamp(rounded, min, max), { record })
  }

  function onLabelPointerDown(e: ReactPointerEvent<HTMLSpanElement>) {
    if (value === 'Mixed' || e.button !== 0) return
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    startRef.current = { x: e.clientX, value, moved: false }
    setScrubbing(true)
  }

  function onLabelPointerMove(e: ReactPointerEvent<HTMLSpanElement>) {
    const start = startRef.current
    if (!start) return
    const delta = e.clientX - start.x
    if (!start.moved && Math.abs(delta) < 2) return
    const first = !start.moved
    start.moved = true
    const speed = e.shiftKey ? 10 : 1
    commit(start.value + delta * step * speed, first)
  }

  function endScrub(e: ReactPointerEvent<HTMLSpanElement>) {
    if (!startRef.current) return
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId)
    }
    startRef.current = null
    setScrubbing(false)
  }

  return (
    <div
      className={`numeric-scrub ${scrubbing ? 'is-scrubbing' : ''}`}
      data-testid={testId}
    >
      <span
        className="numeric-scrub-label"
        data-testid={testId ? `${testId}-handle` : undefined}
        onPointerDown={onLabelPointerDown}
        onPointerMove={onLabelPointerMove}
        onPointerUp={endScrub}
        onPointerCancel={endScrub}
        title="Drag to adjust"
        aria-hidden
      >
        {label}
      </span>
      <input
        type="number"
        className="numeric-scrub-input"
        value={draft ?? (value === 'Mixed' ? '' : value)}
        placeholder={value === 'Mixed' ? 'Mixed' : undefined}
        step={step}
        min={min}
        max={max}
        aria-label={label}
        data-testid={testId ? `${testId}-input` : undefined}
        onChange={(e) => {
          setDraft(e.target.value)
          if (e.target.value === '') return
          const next = Number(e.target.value)
          if (!Number.isFinite(next)) return
          // Only apply live while the draft is in range; blur clamps the rest.
          if ((min != null && next < min) || (max != null && next > max)) return
          commit(next, false)
        }}
        onBlur={(e) => {
          const next = Number(e.target.value)
          if (!cancelRef.current && e.target.value !== '' && Number.isFinite(next)) {
            commit(next, false)
          }
          cancelRef.current = false
          setDraft(null)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur()
          if (e.key === 'Escape') {
            cancelRef.current = true
            e.currentTarget.blur()
          }
        }}
      />
    </div>
  )
}
