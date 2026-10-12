import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { IncomingMessage } from 'node:http'
import { hasSession, issueSession, sessionCookie, validAccessCode } from '../api/_auth'
import { readFileSync } from 'node:fs'

const request = (token: string) => ({ headers: { cookie: sessionCookie(token) } }) as IncomingMessage

it('uses a secure partitioned 30-day cookie for the PPIPPI iframe', () => {
  const cookie = sessionCookie('signed-token')
  expect(cookie).toContain('Max-Age=2592000')
  expect(cookie).toContain('HttpOnly')
  expect(cookie).toContain('Secure')
  expect(cookie).toContain('SameSite=None')
  expect(cookie).toContain('Partitioned')
  expect(cookie).not.toContain('APP_ACCESS_CODE')
})
it('keeps Safari storage access behind the user login gesture', () => {
  const source = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8')
  const gate = source.slice(source.indexOf('function AccessGate'))
  expect(gate).toContain('requestStorageAccess')
  expect(gate.indexOf('requestStorageAccess')).toBeLessThan(gate.indexOf("fetch('/api/auth/session'"))
})
beforeEach(() => {
  vi.stubEnv('APP_ACCESS_CODE', 'test-only-access-code')
  vi.stubEnv('APP_SESSION_SECRET', 'test-only-secret-not-used-in-production')
})
afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers() })
describe('access sessions', () => {
  it('rejects missing, malformed, and tampered sessions', () => {
    expect(hasSession(request(''))).toBe(false)
    expect(hasSession(request('malformed'))).toBe(false)
    const token = issueSession()!
    expect(hasSession(request(token))).toBe(true)
    expect(hasSession(request(token + 'x'))).toBe(false)
    expect(hasSession(request(token + '.extra'))).toBe(false)
  })
  it('invalidates sessions when the code changes or access is disabled', () => {
    const token = issueSession()!
    vi.stubEnv('APP_ACCESS_CODE', 'changed-code')
    expect(hasSession(request(token))).toBe(false)
    vi.stubEnv('APP_ACCESS_CODE', '')
    expect(issueSession()).toBe(null)
    expect(hasSession(request(token))).toBe(false)
  })
  it('expires sessions and checks codes', () => {
    vi.useFakeTimers()
    const token = issueSession()!
    vi.advanceTimersByTime(31 * 86400000)
    expect(hasSession(request(token))).toBe(false)
    expect(validAccessCode('test-only-access-code')).toBe(true)
    expect(validAccessCode('incorrect')).toBe(false)
  })
})
