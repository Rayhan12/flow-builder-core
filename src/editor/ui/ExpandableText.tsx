import { ChevronDown } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

type Props = {
  text: string
  className?: string
  lines?: number
  testId?: string
}

/** Shows up to `lines` of text, with click-to-expand for the rest. */
export function ExpandableText({ text, className = '', lines = 2, testId }: Props) {
  const ref = useRef<HTMLParagraphElement>(null)
  const [expanded, setExpanded] = useState(false)
  const [overflows, setOverflows] = useState(false)

  useEffect(() => {
    setExpanded(false)
  }, [text])

  useEffect(() => {
    const el = ref.current
    if (!el || expanded) return
    const check = () => {
      setOverflows(el.scrollHeight > el.clientHeight + 1)
    }
    check()
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(check) : null
    ro?.observe(el)
    return () => ro?.disconnect()
  }, [text, lines, expanded])

  if (!text) return null

  const longEnough = text.length > 100
  const showToggle = expanded || overflows || longEnough

  return (
    <div className={`expandable-text ${expanded ? 'is-expanded' : ''} ${className}`.trim()}>
      <p
        ref={ref}
        className="expandable-text-body"
        data-testid={testId}
        style={
          expanded
            ? undefined
            : {
                display: '-webkit-box',
                WebkitLineClamp: lines,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
              }
        }
      >
        {text}
      </p>
      {showToggle ? (
        <button
          type="button"
          className="expandable-text-toggle"
          data-testid={testId ? `${testId}-toggle` : 'expandable-text-toggle'}
          aria-expanded={expanded}
          onClick={(e) => {
            e.stopPropagation()
            setExpanded((v) => !v)
          }}
        >
          <ChevronDown
            size={12}
            className={`collapse-chevron ${expanded ? 'is-open' : ''}`}
            aria-hidden
          />
          {expanded ? 'Show less' : 'Show more'}
        </button>
      ) : null}
    </div>
  )
}
