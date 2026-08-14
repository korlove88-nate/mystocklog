import { marketSnapshotsSchema } from '../db/schema'

const FMP_BASE_URL = 'https://financialmodelingprep.com/stable'
const FMP_TIMEOUT_MS = 12_000
const numberOrNull = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? value : null
const first = (value: unknown) => Array.isArray(value) ? value[0] : null

type SnapshotRow = { payload: string; market_date: string | null; updated_at: string; refresh_cycle: string }
type PricePoint = { date: string; open: number | null; high: number | null; low: number | null; close: number | null; adjustedClose: number | null; volume: number | null }
type StoredPayload = { quote: Record<string, unknown> | null; fundamentals: Record<string, unknown> | null; historicalPrices: PricePoint[]; historyComplete: boolean; updatedAt: string; refreshCycle: string }

const refreshCycle = (now = new Date()) => {
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000)
  if (kst.getUTCHours() < 6 || (kst.getUTCHours() === 6 && kst.getUTCMinutes() < 40)) kst.setUTCDate(kst.getUTCDate() - 1)
  return kst.toISOString().slice(0, 10)
}

const response = (payload: StoredPayload, cache: string, stale = false) => Response.json({ ...payload, stale }, {
  headers: { 'Cache-Control': 'private, no-store', 'X-Market-Cache': cache },
})

async function fmp(path: string, apiKey: string) {
  const separator = path.includes('?') ? '&' : '?'
  const result = await fetch(`${FMP_BASE_URL}${path}${separator}apikey=${encodeURIComponent(apiKey)}`, { signal: AbortSignal.timeout(FMP_TIMEOUT_MS) })
  if (!result.ok) throw new Error(`FMP ${result.status}`)
  return result.json()
}

const normalizeHistory = (value: unknown): PricePoint[] => {
  const object = value as { historical?: unknown }
  const rows = (Array.isArray(value) ? value : object?.historical ?? []) as Record<string, unknown>[]
  return rows.map(point => ({
    date: String(point.date ?? ''), open: numberOrNull(point.open), high: numberOrNull(point.high), low: numberOrNull(point.low),
    close: numberOrNull(point.close), adjustedClose: numberOrNull(point.adjClose ?? point.adjustedClose), volume: numberOrNull(point.volume),
  })).filter(point => /^\d{4}-\d{2}-\d{2}$/.test(point.date) && point.close !== null).sort((a, b) => a.date.localeCompare(b.date))
}

export async function handleMarketData(request: Request, db: D1Database, apiKey = ''): Promise<Response> {
  const url = new URL(request.url)
  const symbol = (url.searchParams.get('symbol') ?? '').trim().toUpperCase()
  if (url.searchParams.get('status') === '1') return Response.json({ configured: Boolean(apiKey), durableStorage: true })
  if (!/^[A-Z][A-Z0-9.-]{0,9}$/.test(symbol)) return Response.json({ error: 'Invalid symbol' }, { status: 400 })

  await db.prepare(marketSnapshotsSchema).run()
  const row = await db.prepare('SELECT payload, market_date, updated_at, refresh_cycle FROM market_snapshots WHERE symbol = ?1').bind(symbol).first<SnapshotRow>()
  const stored = row ? JSON.parse(row.payload) as StoredPayload : null
  const forceRefresh = request.headers.get('x-refresh-market-data') === '1'

  // Ordinary page loads never call FMP. They only read the last durable value.
  if (!forceRefresh) return stored ? response(stored, 'D1-HIT') : Response.json({ error: 'No stored snapshot' }, { status: 503 })
  if (!apiKey) return stored ? response(stored, 'D1-STALE', true) : Response.json({ error: 'Market data is not configured' }, { status: 503 })

  const previousHistory = stored?.historicalPrices ?? []
  const lastDate = previousHistory.at(-1)?.date
  const historyPath = `/historical-price-eod/full?symbol=${encodeURIComponent(symbol)}${lastDate ? `&from=${encodeURIComponent(lastDate)}` : ''}`
  const [quoteResult, profileResult, historyResult] = await Promise.allSettled([
    fmp(`/quote?symbol=${encodeURIComponent(symbol)}`, apiKey),
    fmp(`/profile?symbol=${encodeURIComponent(symbol)}`, apiKey),
    fmp(historyPath, apiKey),
  ])

  if (quoteResult.status === 'rejected' && profileResult.status === 'rejected' && historyResult.status === 'rejected') {
    return stored ? response(stored, 'D1-STALE', true) : Response.json({ error: 'Provider unavailable' }, { status: 502 })
  }

  const quoteRaw = quoteResult.status === 'fulfilled' ? first(quoteResult.value) as Record<string, unknown> | null : null
  const profileRaw = profileResult.status === 'fulfilled' ? first(profileResult.value) as Record<string, unknown> | null : null
  const newHistory = historyResult.status === 'fulfilled' ? normalizeHistory(historyResult.value) : []
  const mergedHistory = Array.from(new Map([...previousHistory, ...newHistory].map(point => [point.date, point])).values()).sort((a, b) => a.date.localeCompare(b.date))
  const ipoDate = typeof profileRaw?.ipoDate === 'string' ? profileRaw.ipoDate : null
  const firstDate = mergedHistory[0]?.date ?? null
  const historyComplete = stored?.historyComplete || Boolean(ipoDate && firstDate && Date.parse(firstDate) <= Date.parse(ipoDate) + 14 * 86_400_000)
  const price = numberOrNull(quoteRaw?.price)
  const previousClose = numberOrNull(quoteRaw?.previousClose)
  const marketDate = typeof quoteRaw?.timestamp === 'number' ? new Date(quoteRaw.timestamp * 1000).toISOString().slice(0, 10) : mergedHistory.at(-1)?.date ?? row?.market_date ?? null
  const cycle = refreshCycle()
  const updatedAt = new Date().toISOString()
  const payload: StoredPayload = {
    quote: quoteRaw ? { ticker: symbol, price, previousClose, changePercent: numberOrNull(quoteRaw.changesPercentage) !== null ? numberOrNull(quoteRaw.changesPercentage)! / 100 : null, marketDate } : stored?.quote ?? null,
    fundamentals: quoteRaw || profileRaw ? { ticker: symbol, companyName: profileRaw?.companyName ?? quoteRaw?.name ?? stored?.fundamentals?.companyName ?? null, sector: profileRaw?.sector ?? stored?.fundamentals?.sector ?? null, marketCap: numberOrNull(quoteRaw?.marketCap ?? profileRaw?.mktCap) ?? numberOrNull(stored?.fundamentals?.marketCap), pe: numberOrNull(quoteRaw?.pe) ?? numberOrNull(stored?.fundamentals?.pe), eps: numberOrNull(quoteRaw?.eps) ?? numberOrNull(stored?.fundamentals?.eps) } : stored?.fundamentals ?? null,
    historicalPrices: mergedHistory, historyComplete, updatedAt, refreshCycle: cycle,
  }
  await db.prepare(`INSERT INTO market_snapshots (symbol, payload, market_date, updated_at, refresh_cycle)
    VALUES (?1, ?2, ?3, ?4, ?5)
    ON CONFLICT(symbol) DO UPDATE SET payload = excluded.payload, market_date = excluded.market_date,
    updated_at = excluded.updated_at, refresh_cycle = excluded.refresh_cycle`).bind(symbol, JSON.stringify(payload), marketDate, updatedAt, cycle).run()
  return response(payload, 'D1-REFRESH')
}
