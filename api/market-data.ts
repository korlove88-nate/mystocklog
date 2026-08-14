const FMP_BASE_URL = 'https://financialmodelingprep.com/stable'
const CACHE_SECONDS = 90_000
const FMP_TIMEOUT_MS = 12_000
const numberOrNull = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? value : null
const first = (value: unknown) => Array.isArray(value) ? value[0] : null

async function fmp(path: string, apiKey: string) {
  const separator = path.includes('?') ? '&' : '?'
  const response = await fetch(`${FMP_BASE_URL}${path}${separator}apikey=${encodeURIComponent(apiKey)}`, { signal: AbortSignal.timeout(FMP_TIMEOUT_MS) })
  if (!response.ok) throw new Error(`FMP ${response.status}`)
  return response.json()
}

// The snapshot day rolls over at 06:40 KST (21:40 UTC). Before that boundary,
// the previous snapshot remains active. A new cycle is filled only once.
const refreshCycle = (now = new Date()) => {
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000)
  if (kst.getUTCHours() < 6 || (kst.getUTCHours() === 6 && kst.getUTCMinutes() < 40)) kst.setUTCDate(kst.getUTCDate() - 1)
  return kst.toISOString().slice(0, 10)
}

export default async function handler(request: Request): Promise<Response> {
  const url = new URL(request.url)
  const symbol = (url.searchParams.get('symbol') ?? '').trim().toUpperCase()
  const forceRefresh = request.headers.get('x-refresh-market-data') === '1'
  // Server-only: every device and scheduled refresh uses one protected key.
  const apiKey = process.env.FMP_API_KEY || ''
  if (url.searchParams.get('status') === '1') return Response.json({ configured: Boolean(apiKey) })
  if (!/^[A-Z][A-Z0-9.-]{0,9}$/.test(symbol)) return Response.json({ error: 'Invalid symbol' }, { status: 400 })
  if (!apiKey) return Response.json({ error: 'Market data is not configured' }, { status: 503 })

  const workerCache = typeof caches === 'undefined' ? null : (caches as unknown as { default: Cache }).default
  const cycle = refreshCycle()
  const cacheKey = new Request(`${url.origin}/api/market-data-cache/v2/${cycle}/${encodeURIComponent(symbol)}`)
  if (!forceRefresh && workerCache) {
    const cached = await workerCache.match(cacheKey)
    if (cached) return new Response(cached.body, { status: cached.status, headers: { ...Object.fromEntries(cached.headers), 'X-Market-Cache': 'HIT' } })
  }

  const [quoteResult, profileResult, historyResult] = await Promise.allSettled([
    fmp(`/quote?symbol=${encodeURIComponent(symbol)}`, apiKey),
    fmp(`/profile?symbol=${encodeURIComponent(symbol)}`, apiKey),
    fmp(`/historical-price-eod/full?symbol=${encodeURIComponent(symbol)}`, apiKey),
  ])
  const quoteRaw = quoteResult.status === 'fulfilled' ? first(quoteResult.value) as Record<string, unknown> | null : null
  const profileRaw = profileResult.status === 'fulfilled' ? first(profileResult.value) as Record<string, unknown> | null : null
  const historyValue = historyResult.status === 'fulfilled' ? historyResult.value : []
  const historyObject = historyValue as { historical?: unknown }
  const historyRaw = (Array.isArray(historyValue) ? historyValue : historyObject.historical ?? []) as Record<string, unknown>[]
  if (!quoteRaw && !profileRaw && !historyRaw.length) return Response.json({ error: 'Provider unavailable' }, { status: 502 })

  const historicalPrices = historyRaw.map(point => ({
    date: String(point.date ?? ''), open: numberOrNull(point.open), high: numberOrNull(point.high),
    low: numberOrNull(point.low), close: numberOrNull(point.close),
    adjustedClose: numberOrNull(point.adjClose ?? point.adjustedClose), volume: numberOrNull(point.volume),
  })).filter(point => /^\d{4}-\d{2}-\d{2}$/.test(point.date) && point.close !== null)
    .sort((a, b) => a.date.localeCompare(b.date))
  const ipoDate = typeof profileRaw?.ipoDate === 'string' ? profileRaw.ipoDate : null
  const firstDate = historicalPrices[0]?.date ?? null
  const historyComplete = Boolean(ipoDate && firstDate && Date.parse(firstDate) <= Date.parse(ipoDate) + 14 * 86_400_000)
  const price = numberOrNull(quoteRaw?.price)
  const previousClose = numberOrNull(quoteRaw?.previousClose)
  const marketDate = typeof quoteRaw?.timestamp === 'number' ? new Date(quoteRaw.timestamp * 1000).toISOString().slice(0, 10) : historicalPrices.at(-1)?.date ?? null

  const response = Response.json({
    quote: quoteRaw ? { ticker: symbol, price, previousClose, changePercent: numberOrNull(quoteRaw.changesPercentage) !== null ? numberOrNull(quoteRaw.changesPercentage)! / 100 : null, marketDate } : null,
    fundamentals: { ticker: symbol, companyName: profileRaw?.companyName ?? quoteRaw?.name ?? null, sector: profileRaw?.sector ?? null,
      marketCap: numberOrNull(quoteRaw?.marketCap ?? profileRaw?.mktCap), pe: numberOrNull(quoteRaw?.pe), eps: numberOrNull(quoteRaw?.eps) },
    historicalPrices, historyComplete, updatedAt: new Date().toISOString(), refreshCycle: cycle,
  }, { headers: { 'Cache-Control': `public, max-age=0, s-maxage=${CACHE_SECONDS}`, 'X-Market-Cache': forceRefresh ? 'REFRESH' : 'MISS' } })
  if (workerCache) await workerCache.put(cacheKey, response.clone())
  return response
}
