import {
  Briefcase,
  Folder,
  Layers,
  Rocket,
  Star,
  Workflow,
  type LucideIcon,
} from 'lucide-react'

export type TileColour = { fg: string; bg: string }

/** Pastel tile backgrounds with a stronger foreground for the icon. */
export const PROJECT_TILE_COLOURS: Record<string, TileColour> = {
  teal: { fg: '#0f766e', bg: '#d5f5f0' },
  blue: { fg: '#2e6be6', bg: '#e3ecfd' },
  violet: { fg: '#7a5af8', bg: '#ece8fe' },
  amber: { fg: '#b87404', bg: '#fdf0d5' },
  rose: { fg: '#e11d48', bg: '#fde4e8' },
  slate: { fg: '#64748b', bg: '#e8ecf1' },
}

export const PROJECT_ICON_COMPONENTS: Record<string, LucideIcon> = {
  folder: Folder,
  workflow: Workflow,
  layers: Layers,
  briefcase: Briefcase,
  rocket: Rocket,
  star: Star,
}

export const PROJECT_COLOUR_KEYS = Object.keys(PROJECT_TILE_COLOURS)
export const PROJECT_ICON_KEYS = Object.keys(PROJECT_ICON_COMPONENTS)

export function tileColour(color: string): TileColour {
  return PROJECT_TILE_COLOURS[color] ?? PROJECT_TILE_COLOURS.teal
}

export function projectIcon(icon: string): LucideIcon {
  return PROJECT_ICON_COMPONENTS[icon] ?? Folder
}
