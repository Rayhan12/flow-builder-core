import type { CSSProperties } from 'react'
import { LogoMark } from './LogoMark'

type LogoWordmarkProps = {
  markSize?: number
  mono?: boolean
  className?: string
  style?: CSSProperties
  /** Hide the text (mark only). Useful in collapsed nav. */
  markOnly?: boolean
}

/** Mark plus "Flow Builder" in Inter semibold. */
export function LogoWordmark({
  markSize = 24,
  mono = false,
  className,
  style,
  markOnly = false,
}: LogoWordmarkProps) {
  return (
    <span
      className={['logo-wordmark', className].filter(Boolean).join(' ')}
      style={style}
    >
      <LogoMark
        size={markSize}
        mono={mono}
        title={markOnly ? 'Flow Builder' : ''}
      />
      {markOnly ? null : <span className="logo-wordmark-text">Flow Builder</span>}
    </span>
  )
}
