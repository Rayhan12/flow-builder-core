import { describe, expect, it } from 'vitest'
import { getLucideIcon, ICON_CATALOG, searchIcons } from './icons'
import { Layers } from 'lucide-react'

describe('icons', () => {
  it('searches by name and keywords', () => {
    const shield = searchIcons('shield')
    expect(shield.length).toBeGreaterThan(0)
    expect(shield.some((e) => e.name.includes('shield'))).toBe(true)

    const decision = searchIcons('decision')
    expect(decision.some((e) => e.name === 'git-branch')).toBe(true)

    expect(searchIcons('zzzz-not-an-icon')).toHaveLength(0)
    expect(searchIcons('').length).toBe(ICON_CATALOG.length)
  })

  it('resolves known icon names', () => {
    const Icon = getLucideIcon('user', Layers)
    expect(Icon).not.toBe(Layers)
    expect(getLucideIcon('nope', Layers)).toBe(Layers)
  })
})
