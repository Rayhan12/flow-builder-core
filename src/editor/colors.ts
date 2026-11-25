/** Data palette for nodes, edges and groups (DESIGN_SYSTEM.md section 3). */

export type DataColorKey =
  | 'slate'
  | 'blue'
  | 'violet'
  | 'amber'
  | 'indigo'
  | 'green'
  | 'red'
  | 'pink'
  | 'yellow'
  | 'gray'

export type DataColor = {
  key: DataColorKey
  solid: string
  tint: string
  label: string
}

export const DATA_COLORS: DataColor[] = [
  { key: 'slate', solid: '#64748b', tint: '#f1f5f9', label: 'Slate' },
  { key: 'blue', solid: '#2e6be6', tint: '#eef4ff', label: 'Blue' },
  { key: 'violet', solid: '#7a5af8', tint: '#f4f3ff', label: 'Violet' },
  { key: 'amber', solid: '#dc8a06', tint: '#fef6e7', label: 'Amber' },
  { key: 'indigo', solid: '#4f46e5', tint: '#eef2ff', label: 'Indigo' },
  { key: 'green', solid: '#12b76a', tint: '#ecfdf3', label: 'Green' },
  { key: 'red', solid: '#e5484d', tint: '#fff0f0', label: 'Red' },
  { key: 'pink', solid: '#dd2590', tint: '#fdf2fa', label: 'Pink' },
  { key: 'yellow', solid: '#ca8a04', tint: '#fefce8', label: 'Yellow' },
  { key: 'gray', solid: '#98a2b3', tint: '#f9fafb', label: 'Gray' },
]

const byKey = Object.fromEntries(DATA_COLORS.map((c) => [c.key, c])) as Record<
  DataColorKey,
  DataColor
>

export function isDataColorKey(value: string): value is DataColorKey {
  return value in byKey
}

export function resolveColor(color: string | undefined, fallback: DataColorKey = 'slate'): DataColor {
  if (!color) return byKey[fallback]
  if (color === 'teal' || color === 'cyan') return byKey.indigo
  if (isDataColorKey(color)) return byKey[color]
  if (color.startsWith('#')) {
    return { key: 'slate', solid: color, tint: `${color}22`, label: 'Custom' }
  }
  return byKey[fallback]
}
