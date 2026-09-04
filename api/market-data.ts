import type { IncomingMessage, ServerResponse } from 'node:http'

type StoredRow = { symbol: string; payload: Record<string, unknown>; market_date: string | null; updated_at: string; refresh_cycle: string }
type LatestPrice = { ticker: string; price: number; change: number | null; change_percent: number | null; updated_at: string }
type Collector = { status: 'NORMAL' | 'IP_CHANGED' | 'API_ERROR'; previous_ip: string | null; current_ip: string | null; detected_at: string | null; last_success_at: string | null; last_error_code: string | null; last_error_message: string | null; updated_at: string }

// Kept in this function file because Vercel's standalone Node Function bundler
// does not retain extensionless sibling imports in this project configuration.
// Both values remain server-only Vercel environment variables.
const supabaseRest = async <T>(path: string): Promise<T> => {
  const base = (process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL)?.replace(/\/$/, '')
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY
  if (!base || !key) throw new Error('Supabase server environment is not configured.')
  const response = await fetch(`${base}/rest/v1/${path}`, { headers: { apikey: key, Authorization: `Bearer ${key}` } })
  if (!response.ok) throw new Error(`Supabase REST ${response.status}`)
  return response.json() as Promise<T>
}

const json = (res: ServerResponse, body: unknown, status = 200) => {
  res.writeHead(status, { 'Cache-Control': 'private, no-store', 'Content-Type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(body))
}
const validTicker = (value: string) => /^[A-Z][A-Z0-9.-]{0,9}$/.test(value)
const nyMarketOpen = () => {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts().filter(part => part.type !== 'literal').map(part => [part.type, part.value]))
  const minute = Number(parts.hour) * 60 + Number(parts.minute)
  return !['Sat', 'Sun'].includes(parts.weekday) && minute >= 570 && minute < 960
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  if (req.method !== 'GET') return json(res, { error: 'Method not allowed' }, 405)
  try {
    const url = new URL(req.url ?? '/', `https://${req.headers.host ?? 'localhost'}`)
    const requested = (url.searchParams.get('symbols') ?? url.searchParams.get('symbol') ?? '').split(',').map(value => value.trim().toUpperCase()).filter(validTicker)
    const rows = await supabaseRest<StoredRow[]>('market_snapshots?select=symbol,payload,market_date,updated_at,refresh_cycle')
    const dashboard = rows.find(row => row.symbol === '__DASHBOARD__')
    const available = rows.filter(row => row.symbol !== '__DASHBOARD__')
    const selected = requested.length ? available.filter(row => requested.includes(row.symbol)) : available
    const [latest, collectorRows] = await Promise.all([
      supabaseRest<LatestPrice[]>('latest_prices?select=ticker,price,change,change_percent,updated_at'),
      supabaseRest<Collector[]>('collector_status?collector_id=eq.toss_live_collector&select=status,previous_ip,current_ip,detected_at,last_success_at,last_error_code,last_error_message,updated_at'),
    ])
    const collector = collectorRows[0] ?? null
    const liveByTicker = new Map(latest.map(row => [row.ticker, row]))
    const payloads = Object.fromEntries(selected.map(row => {
      const payload: Record<string, unknown> = { ...row.payload, storageSource: 'supabase' }
      const quote = payload.quote as { price?: number; previousClose?: number | null; changePercent?: number | null } | null
      const live = liveByTicker.get(row.symbol)
      if (nyMarketOpen() && collector?.status === 'NORMAL' && quote && live) {
        payload.quote = { ...quote, price: live.price, previousClose: quote.previousClose ?? null, changePercent: live.change_percent ?? quote.changePercent ?? null }
        payload.updatedAt = live.updated_at
      }
      return [row.symbol, payload]
    }))
    if (url.searchParams.get('dashboard') === '1') {
      const meta = dashboard?.payload ?? {}
      return json(res, { payloads, catalog: meta.catalog ?? null, marketOverview: meta.marketOverview ?? [], refresh: meta.lastRefresh ?? null, collectorStatus: collector })
    }
    if (url.searchParams.has('symbols')) return Object.keys(payloads).length ? json(res, { payloads }) : json(res, { error: 'No stored snapshot' }, 503)
    const ticker = requested[0]
    return ticker && payloads[ticker] ? json(res, payloads[ticker]) : json(res, { error: 'No stored snapshot' }, 503)
  } catch (error) {
    return json(res, { error: error instanceof Error ? error.message : 'Market data unavailable' }, 503)
  }
}
