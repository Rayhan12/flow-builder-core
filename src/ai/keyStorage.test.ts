import { beforeEach, describe, expect, it } from 'vitest'
import { forgetApiKey, getApiKey, hasApiKey, setApiKey } from './keyStorage'

describe('keyStorage', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('stores and reads a key per user', () => {
    setApiKey('user-a', 'secret-aaa')
    setApiKey('user-b', 'secret-bbb')

    expect(getApiKey('user-a')).toBe('secret-aaa')
    expect(getApiKey('user-b')).toBe('secret-bbb')
    expect(hasApiKey('user-a')).toBe(true)
  })

  it('forgets a key', () => {
    setApiKey('user-a', 'secret-aaa')
    forgetApiKey('user-a')
    expect(getApiKey('user-a')).toBeNull()
    expect(hasApiKey('user-a')).toBe(false)
  })

  it('trims whitespace and treats empty as forget', () => {
    setApiKey('user-a', '  abc  ')
    expect(getApiKey('user-a')).toBe('abc')
    setApiKey('user-a', '   ')
    expect(getApiKey('user-a')).toBeNull()
  })
})
