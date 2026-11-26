const HINTS_KEY = 'flow-builder-show-node-hints'

export function readShowNodeHints(): boolean {
  try {
    const raw = localStorage.getItem(HINTS_KEY)
    if (raw === null) return true
    return raw !== '0'
  } catch {
    return true
  }
}

export function writeShowNodeHints(value: boolean) {
  try {
    localStorage.setItem(HINTS_KEY, value ? '1' : '0')
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new CustomEvent('fb:node-hints', { detail: value }))
}
