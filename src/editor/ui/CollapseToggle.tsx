import { ChevronRight } from 'lucide-react'
import type { CSSProperties, ReactNode } from 'react'

type HeaderProps = {
  open: boolean
  onToggle: () => void
  label: ReactNode
  trailing?: ReactNode
  ariaLabel?: string
  testId?: string
  toggleTestId?: string
  className?: string
}

/** Shared expand/collapse header: rotating chevron + label row. */
export function CollapseHeader({
  open,
  onToggle,
  label,
  trailing,
  ariaLabel,
  testId,
  toggleTestId,
  className = '',
}: HeaderProps) {
  return (
    <div className={`collapse-header ${className}`.trim()} data-testid={testId}>
      <button
        type="button"
        className="collapse-toggle"
        aria-expanded={open}
        aria-label={ariaLabel ?? (open ? 'Collapse' : 'Expand')}
        data-testid={toggleTestId ?? (testId ? `${testId}-toggle` : 'collapse-toggle')}
        onClick={(e) => {
          e.stopPropagation()
          onToggle()
        }}
      >
        <ChevronRight
          size={14}
          className={`collapse-chevron ${open ? 'is-open' : ''}`}
          aria-hidden
        />
      </button>
      <div className="collapse-header-label">{label}</div>
      {trailing ? <div className="collapse-header-trailing">{trailing}</div> : null}
    </div>
  )
}

type SectionProps = {
  open: boolean
  onToggle: () => void
  title: string
  children: ReactNode
  testId?: string
  className?: string
  defaultOpen?: boolean
}

/** Collapsible panel/palette section with animated body. */
export function CollapseSection({
  open,
  onToggle,
  title,
  children,
  testId,
  className = '',
}: SectionProps) {
  return (
    <section
      className={`collapse-section ${open ? 'is-open' : 'is-closed'} ${className}`.trim()}
      data-testid={testId}
    >
      <CollapseHeader
        open={open}
        onToggle={onToggle}
        label={<span className="collapse-section-title">{title}</span>}
        testId={testId ? `${testId}-header` : undefined}
        ariaLabel={open ? `Collapse ${title}` : `Expand ${title}`}
      />
      <div
        className="collapse-body"
        data-open={open ? 'true' : 'false'}
        style={{ '--collapse-open': open ? 1 : 0 } as CSSProperties}
        hidden={!open}
      >
        {open ? children : null}
      </div>
    </section>
  )
}
