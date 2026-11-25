import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { LogoMark } from '../assets/brand'

type EmptyStateProps = {
  /** Lucide icon component, or omit to show the Flow Builder mark. */
  icon?: LucideIcon
  title: string
  hint: string
  action?: ReactNode
  className?: string
}

export function EmptyState({ icon: Icon, title, hint, action, className }: EmptyStateProps) {
  return (
    <div className={['empty-state', className].filter(Boolean).join(' ')}>
      {Icon ? (
        <Icon className="empty-state-icon" size={40} strokeWidth={1.5} aria-hidden />
      ) : (
        <LogoMark className="empty-state-icon" size={40} title="" />
      )}
      <h2>{title}</h2>
      <p>{hint}</p>
      {action}
    </div>
  )
}
