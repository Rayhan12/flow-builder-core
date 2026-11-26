import {
  forgetLegacyApiKey,
  getLegacyApiKey,
  hasAnyConnectionKey,
  setLegacyApiKey,
} from './providers/connections'

/** Read the user's AI API key from this browser only. Never logs the value. */
export function getApiKey(uid: string): string | null {
  return getLegacyApiKey(uid)
}

export function setApiKey(uid: string, key: string): void {
  setLegacyApiKey(uid, key)
}

export function forgetApiKey(uid: string): void {
  forgetLegacyApiKey(uid)
}

export function hasApiKey(uid: string): boolean {
  return hasAnyConnectionKey(uid) || getLegacyApiKey(uid) !== null
}
