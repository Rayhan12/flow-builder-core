import { describe, expect, it } from 'vitest'
import { authErrorMessage } from './authErrors'

describe('authErrorMessage', () => {
  it('maps known Firebase codes to plain English', () => {
    expect(authErrorMessage({ code: 'auth/email-already-in-use' })).toMatch(
      /already registered/i,
    )
    expect(authErrorMessage({ code: 'auth/weak-password' })).toMatch(/6 characters/i)
    expect(authErrorMessage({ code: 'auth/invalid-credential' })).toMatch(/incorrect/i)
    expect(authErrorMessage({ code: 'auth/popup-closed-by-user' })).toMatch(/closed/i)
    expect(authErrorMessage({ code: 'auth/missing-email' })).toMatch(/email/i)
  })

  it('falls back for unknown errors', () => {
    expect(authErrorMessage(new Error('boom'))).toMatch(/try again/i)
  })
})
