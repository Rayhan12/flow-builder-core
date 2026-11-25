import { createContext } from 'react'

export type ThemeMode = 'light' | 'dark'

export type ThemeContextValue = {
  theme: ThemeMode
  toggleTheme: () => void
  setTheme: (mode: ThemeMode) => void
}

export const ThemeContext = createContext<ThemeContextValue | null>(null)
