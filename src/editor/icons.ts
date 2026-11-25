import type { LucideIcon } from 'lucide-react'
import {
  BookOpen,
  CircleDot,
  CircleStop,
  Database,
  GitBranch,
  Layers,
  Plug,
  Scale,
  StickyNote,
  User,
} from 'lucide-react'

const ICON_MAP: Record<string, LucideIcon> = {
  'circle-dot': CircleDot,
  'circle-stop': CircleStop,
  layers: Layers,
  'git-branch': GitBranch,
  database: Database,
  plug: Plug,
  scale: Scale,
  'sticky-note': StickyNote,
  'book-open': BookOpen,
  user: User,
}

export function getLucideIcon(name: string | undefined, fallback: LucideIcon): LucideIcon {
  if (!name) return fallback
  return ICON_MAP[name] ?? fallback
}
