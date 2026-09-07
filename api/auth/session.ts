import type { IncomingMessage, ServerResponse } from 'node:http'
import { clearSessionCookie, hasSession, isAccessConfigured, issueSession, sessionCookie, validAccessCode } from '../_auth.js'

const json = (res: ServerResponse, body: unknown, status = 200, cookie?: string) => {
  res.writeHead(status, { 'Cache-Control': 'private, no-store', 'Content-Type': 'application/json; charset=utf-8', ...(cookie ? { 'Set-Cookie': cookie } : {}) })
  res.end(JSON.stringify(body))
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  if (req.method === 'GET') return json(res, { configured: isAccessConfigured(), authenticated: hasSession(req) })
  if (req.method === 'DELETE') return json(res, { authenticated: false }, 200, clearSessionCookie())
  if (req.method !== 'POST') return json(res, { error: 'Method not allowed' }, 405)
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += buffer.length
    if (size > 4096) return json(res, { error: 'Invalid request' }, 413)
    chunks.push(buffer)
  }
  let body: { code?: unknown } = {}
  try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')) } catch { return json(res, { error: 'Invalid request' }, 400) }
  if (!body || typeof body !== 'object') return json(res, { error: 'Invalid request' }, 400)
  // A delay alone is not a distributed rate limiter; configure deployment rate limits.
  await new Promise(resolve => setTimeout(resolve, 300))
  if (!isAccessConfigured()) return json(res, { error: 'Access code is not configured.' }, 503)
  if (!validAccessCode(body.code)) return json(res, { error: '코드가 일치하지 않습니다.' }, 401)
  const token = issueSession()
  return token ? json(res, { authenticated: true }, 200, sessionCookie(token)) : json(res, { error: 'Session could not be created.' }, 503)
}
