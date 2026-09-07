import { createHmac, timingSafeEqual } from 'node:crypto'
import type { IncomingMessage } from 'node:http'

const SESSION_SECONDS = 60 * 60 * 24 * 30
const configured = (...values: Array<string | undefined>) => values.find(value => value?.trim())?.trim()
const cookieValue = (header: string | undefined, name: string) => header?.split(';').map(value => value.trim()).find(value => value.startsWith(`${name}=`))?.slice(name.length + 1) ?? null
const secret = () => configured(process.env.APP_SESSION_SECRET)
const expectedCode = () => configured(process.env.APP_ACCESS_CODE)
const sign = (payload: string, value: string) => createHmac('sha256', value).update(payload).digest('base64url')

export const isAccessConfigured = () => Boolean(secret() && expectedCode())
export const validAccessCode = (value: unknown) => {
  const expected = expectedCode()
  if (!expected || typeof value !== 'string') return false
  const supplied = Buffer.from(value)
  const target = Buffer.from(expected)
  return supplied.length === target.length && timingSafeEqual(supplied, target)
}
export const hasSession = (req: IncomingMessage) => {
  const signingSecret = secret()
  const token = cookieValue(req.headers.cookie, '__Host-mystocklog_session')
  if (!isAccessConfigured() || !signingSecret || !token) return false
  const [payload, signature, extra] = token.split('.')
  if (!payload || !signature || extra !== undefined) return false
  const expected = Buffer.from(sign(payload, signingSecret))
  const supplied = Buffer.from(signature)
  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) return false
  try {
    const session = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
    return Number.isFinite(session.expiresAt) && session.expiresAt > Date.now() &&
      session.codeVersion === sign(expectedCode()!, signingSecret)
  } catch { return false }
}
export const issueSession = () => {
  const signingSecret = secret()
  if (!isAccessConfigured() || !signingSecret) return null
  const payload = Buffer.from(JSON.stringify({ expiresAt: Date.now() + SESSION_SECONDS * 1000, codeVersion: sign(expectedCode()!, signingSecret) })).toString('base64url')
  return `${payload}.${sign(payload, signingSecret)}`
}
export const sessionCookie = (token: string) => `__Host-mystocklog_session=${token}; Path=/; Max-Age=${SESSION_SECONDS}; HttpOnly; Secure; SameSite=Strict`
export const clearSessionCookie = () => '__Host-mystocklog_session=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict'
