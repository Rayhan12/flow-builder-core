const PREFIX = 'flow-builder:ai-key:'

function storageKey(uid: string): string {
  return `${PREFIX}${uid}`
}

/** Read the user's AI API key from this browser only. Never logs the value. */
export function getApiKey(uid: string): string | null {
  try {
    const value = localStorage.getItem(storageKey(uid))
    return value && value.trim() ? value.trim() : null
  } catch {
    return null
  }
}

export function setApiKey(uid: string, key: string): void {
  const trimmed = key.trim()
  if (!trimmed) {
    forgetApiKey(uid)
    return
  }
  try {
    localStorage.setItem(storageKey(uid), trimmed)
  } catch {
    throw new Error('Could not save the API key in this browser')
  }
}

export function forgetApiKey(uid: string): void {
  try {
    localStorage.removeItem(storageKey(uid))
  } catch {
    // ignore
  }
}

export function hasApiKey(uid: string): boolean {
  return getApiKey(uid) !== null
}
