import type { IncomingMessage, ServerResponse } from 'node:http'
import { hasSession } from './_auth.js'

// Transitional compatibility route. Existing personal holdings remain in the
// legacy Sites D1 database until the Supabase-authenticated holdings migration
// is completed. This preserves every existing record and keeps the browser
// independent from the legacy endpoint or its bypass credential.
const legacyOrigin = () => {
  const configured = process.env.MARKET_SYNC_URL
  if (!configured) throw new Error('Legacy holdings connection is not configured.')
  const url = new URL(configured)
  return url.origin
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  if (!hasSession(req)) {
    res.writeHead(401, { 'Cache-Control': 'private, no-store', 'Content-Type': 'application/json; charset=utf-8' })
    res.end(JSON.stringify({ error: 'Authentication required.' }))
    return
  }
  try {
    const incoming = new URL(req.url ?? '/api/positions', `https://${req.headers.host ?? 'localhost'}`)
    const target = new URL('/api/positions', legacyOrigin())
    target.search = incoming.search
    const chunks: Buffer[] = []
    for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
    const body = chunks.length ? Buffer.concat(chunks) : undefined
    const response = await fetch(target, {
      method: req.method ?? 'GET',
      headers: {
        Accept: 'application/json',
        ...(body ? { 'Content-Type': req.headers['content-type'] ?? 'application/json' } : {}),
        ...(process.env.SITES_BYPASS_TOKEN ? { 'OAI-Sites-Authorization': `Bearer ${process.env.SITES_BYPASS_TOKEN}` } : {}),
      },
      body: body?.byteLength ? body : undefined,
      signal: AbortSignal.timeout(60_000),
    })
    const text = await response.text()
    res.writeHead(response.status, { 'Cache-Control': 'private, no-store', 'Content-Type': response.headers.get('content-type') ?? 'application/json; charset=utf-8' })
    res.end(text)
  } catch {
    res.writeHead(503, { 'Cache-Control': 'private, no-store', 'Content-Type': 'application/json; charset=utf-8' })
    res.end(JSON.stringify({ error: '기존 보유 기록 저장소에 연결하지 못했습니다.' }))
  }
}
