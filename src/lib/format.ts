export function formatRelative(value: Date | null, now: Date = new Date()): string {
  if (!value) return 'just now'
  const diffSec = Math.round((value.getTime() - now.getTime()) / 1000)
  const abs = Math.abs(diffSec)
  if (abs < 45) return 'just now'
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })
  if (abs < 3600) return rtf.format(Math.round(diffSec / 60), 'minute')
  if (abs < 86400) return rtf.format(Math.round(diffSec / 3600), 'hour')
  if (abs < 86400 * 30) return rtf.format(Math.round(diffSec / 86400), 'day')
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(value)
}

export function greetingFor(date: Date = new Date()): string {
  const h = date.getHours()
  if (h < 12) return 'Good morning'
  if (h < 18) return 'Good afternoon'
  return 'Good evening'
}

export function displayNameFor(user: { displayName?: string | null; email?: string | null } | null): string {
  const name = user?.displayName?.trim()
  if (name) return name
  const local = user?.email?.split('@')[0]?.trim()
  return local || 'there'
}

export function pluralise(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`
}

export function editorPath(projectId: string, diagramId: string): string {
  return `/p/${projectId}/d/${diagramId}`
}
