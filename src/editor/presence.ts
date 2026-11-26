/**
 * Presence hooks interface for future multiplayer cursors.
 * No backend wiring yet; consumers can swap in a real provider later.
 */

export type PresenceCursor = {
  userId: string
  name: string
  color: string
  x: number
  y: number
  updatedAt: number
}

export type PresenceUser = {
  userId: string
  name: string
  color: string
  active: boolean
}

export type PresenceState = {
  selfId: string | null
  users: PresenceUser[]
  cursors: PresenceCursor[]
}

export type PresenceHooks = {
  getState: () => PresenceState
  setCursor: (point: { x: number; y: number } | null) => void
  subscribe: (listener: (state: PresenceState) => void) => () => void
}

const emptyState: PresenceState = {
  selfId: null,
  users: [],
  cursors: [],
}

/** No-op presence provider used until a realtime backend is wired. */
export function createNullPresence(selfId: string | null = null): PresenceHooks {
  let state: PresenceState = { ...emptyState, selfId }
  const listeners = new Set<(s: PresenceState) => void>()

  return {
    getState: () => state,
    setCursor: () => {
      // Intentionally empty until a presence backend exists.
    },
    subscribe: (listener) => {
      listeners.add(listener)
      listener(state)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}

export function createLocalPresence(self: {
  userId: string
  name: string
  color?: string
}): PresenceHooks {
  const color = self.color ?? '#0d9488'
  let state: PresenceState = {
    selfId: self.userId,
    users: [{ userId: self.userId, name: self.name, color, active: true }],
    cursors: [],
  }
  const listeners = new Set<(s: PresenceState) => void>()

  function emit() {
    for (const listener of listeners) listener(state)
  }

  return {
    getState: () => state,
    setCursor: (point) => {
      if (!point) {
        state = {
          ...state,
          cursors: state.cursors.filter((c) => c.userId !== self.userId),
        }
        emit()
        return
      }
      const next: PresenceCursor = {
        userId: self.userId,
        name: self.name,
        color,
        x: point.x,
        y: point.y,
        updatedAt: Date.now(),
      }
      const others = state.cursors.filter((c) => c.userId !== self.userId)
      state = { ...state, cursors: [...others, next] }
      emit()
    },
    subscribe: (listener) => {
      listeners.add(listener)
      listener(state)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}
