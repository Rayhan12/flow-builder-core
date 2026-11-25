import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore'
import { db } from '../lib/firebase'

export type AiProviderId = 'gemini'

export type UserSettings = {
  theme: 'light' | 'dark'
  aiProvider: AiProviderId
  aiModel: string
}

export const DEFAULT_USER_SETTINGS: UserSettings = {
  theme: 'light',
  aiProvider: 'gemini',
  aiModel: 'gemini-2.5-flash',
}

export const GEMINI_MODELS = [
  'gemini-2.5-flash',
  'gemini-2.5-pro',
  'gemini-2.0-flash',
] as const

function userRef(uid: string) {
  return doc(db, 'users', uid)
}

function parseSettings(raw: unknown): UserSettings {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_USER_SETTINGS }
  const s = raw as Record<string, unknown>
  const theme = s.theme === 'dark' ? 'dark' : 'light'
  const aiProvider: AiProviderId = s.aiProvider === 'gemini' ? 'gemini' : 'gemini'
  const aiModel =
    typeof s.aiModel === 'string' && s.aiModel.trim()
      ? s.aiModel.trim()
      : DEFAULT_USER_SETTINGS.aiModel
  return { theme, aiProvider, aiModel }
}

export async function getUserSettings(uid: string): Promise<UserSettings> {
  const snap = await getDoc(userRef(uid))
  if (!snap.exists()) return { ...DEFAULT_USER_SETTINGS }
  const data = snap.data() as Record<string, unknown>
  return parseSettings(data.settings)
}

export async function updateUserSettings(
  uid: string,
  patch: Partial<UserSettings>,
): Promise<UserSettings> {
  const current = await getUserSettings(uid)
  const next: UserSettings = {
    theme: patch.theme ?? current.theme,
    aiProvider: patch.aiProvider ?? current.aiProvider,
    aiModel: patch.aiModel ?? current.aiModel,
  }

  const snap = await getDoc(userRef(uid))
  if (!snap.exists()) {
    await setDoc(userRef(uid), { settings: next }, { merge: true })
  } else {
    await updateDoc(userRef(uid), { settings: next })
  }
  return next
}
