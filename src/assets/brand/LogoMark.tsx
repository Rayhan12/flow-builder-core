import type { CSSProperties, SVGProps } from 'react'

type LogoMarkProps = {
  size?: number
  /** Use currentColor instead of teal fills. */
  mono?: boolean
  title?: string
  className?: string
  style?: CSSProperties
} & Omit<SVGProps<SVGSVGElement>, 'children' | 'ref' | 'viewBox' | 'width' | 'height'>

/**
 * Flow Builder mark: three nodes on a tight grid joined by an orthogonal
 * connector that reads as an abstract F / flow arrow.
 */
export function LogoMark({
  size = 24,
  mono = false,
  title = 'Flow Builder',
  className,
  style,
  ...rest
}: LogoMarkProps) {
  const primary = mono ? 'currentColor' : '#0f766e'
  const secondary = mono ? 'currentColor' : '#0d9488'
  const labelled = Boolean(title)

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 32 32"
      width={size}
      height={size}
      fill="none"
      className={className}
      style={style}
      role={labelled ? 'img' : 'presentation'}
      aria-hidden={labelled ? undefined : true}
      {...rest}
    >
      {labelled ? <title>{title}</title> : null}
      <rect x="3" y="3" width="10" height="10" rx="2.5" fill={primary} />
      <rect x="19" y="3" width="10" height="10" rx="2.5" fill={secondary} />
      <rect x="3" y="19" width="10" height="10" rx="2.5" fill={primary} />
      <path
        d="M13 8h6M8 13v6"
        stroke={primary}
        strokeWidth="2.5"
        strokeLinecap="square"
      />
    </svg>
  )
}
