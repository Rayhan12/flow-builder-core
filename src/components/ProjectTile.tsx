import type { CSSProperties } from 'react'
import { projectIcon, tileColour } from '../lib/projectStyle'

type ProjectTileProps = {
  color: string
  icon: string
  size?: 'sm' | 'md' | 'lg'
}

export function ProjectTile({ color, icon, size = 'md' }: ProjectTileProps) {
  const Icon = projectIcon(icon)
  const palette = tileColour(color)
  const px = size === 'sm' ? 14 : size === 'lg' ? 22 : 18
  return (
    <span
      className={`project-tile project-tile-${size}`}
      style={{ '--tile-fg': palette.fg, '--tile-bg': palette.bg } as CSSProperties}
      aria-hidden
    >
      <Icon size={px} strokeWidth={1.75} />
    </span>
  )
}
