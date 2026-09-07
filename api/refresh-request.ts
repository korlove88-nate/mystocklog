import type { IncomingMessage, ServerResponse } from 'node:http'
import { hasSession } from './_auth.js'

const configured = (...values: Array<string | undefined>) => values.find(value => value?.trim())?.trim()
const json = (res: ServerResponse, body: unknown, status = 200) => {
  res.writeHead(status, { 'Cache-Control': 'private, no-store', 'Content-Type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(body))
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  if (!hasSession(req)) return json(res, { error: 'Authentication required.' }, 401)
  if (req.method !== 'POST') return json(res, { error: 'Method not allowed' }, 405)
  const base = configured(process.env.SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_URL)?.replace(/\/$/, '')
  const key = configured(process.env.SUPABASE_SERVICE_ROLE_KEY, process.env.SUPABASE_SECRET_KEY)
  if (!base || !key) return json(res, { error: 'Supabase server environment is not configured.' }, 503)
  const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }
  try {
    const pending = await fetch(`${base}/rest/v1/refresh_requests?status=eq.PENDING&request_type=eq.CURRENT_PRICE&select=id&limit=1`, { headers })
    if (!pending.ok) throw new Error(`Supabase ${pending.status}`)
    const rows = await pending.json() as Array<{ id: string }>
    if (rows[0]) return json(res, { status: 'queued', requestId: rows[0].id, message: 'Mac mini 갱신 대기 중' }, 202)
    const created = await fetch(`${base}/rest/v1/refresh_requests`, { method: 'POST', headers: { ...headers, Prefer: 'return=representation' }, body: JSON.stringify({ request_type: 'CURRENT_PRICE', status: 'PENDING', message: 'Dashboard manual refresh' }) })
    if (!created.ok) throw new Error(`Supabase ${created.status}`)
    const [row] = await created.json() as Array<{ id: string }>
    return json(res, { status: 'queued', requestId: row?.id ?? null, message: 'Mac mini 갱신 요청 등록' }, 202)
  } catch {
    return json(res, { error: '갱신 요청을 등록하지 못했습니다.' }, 503)
  }
}
