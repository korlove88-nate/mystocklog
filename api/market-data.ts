const FMP_BASE_URL = 'https://financialmodelingprep.com/stable'
const numberOrNull = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? value : null
const first = (value: unknown) => Array.isArray(value) ? value[0] : null

async function fmp(path: string, apiKey: string) {
  const separator = path.includes('?') ? '&' : '?'
  const response = await fetch(`${FMP_BASE_URL}${path}${separator}apikey=${encodeURIComponent(apiKey)}`)
  if (!response.ok) throw new Error(`FMP ${response.status}`)
  return response.json()
}

export default async function handler(request: Request): Promise<Response> {
  const url = new URL(request.url)
  const symbol = (url.searchParams.get('symbol') ?? '').trim().toUpperCase()
  // Hosted environment variables take priority. A device-local key can also be
  // forwarded through this same-origin proxy from the private Settings screen.
  const apiKey = process.env.FMP_API_KEY || request.headers.get('x-fmp-api-key') || ''
  if (!/^[A-Z][A-Z0-9.-]{0,9}$/.test(symbol)) return Response.json({ error: 'Invalid symbol' }, { status: 400 })
  if (!apiKey) return Response.json({ error: 'Market data is not configured' }, { status: 503 })

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

  return Response.json({
    quote: quoteRaw ? { ticker: symbol, price, previousClose, changePercent: numberOrNull(quoteRaw.changesPercentage) !== null ? numberOrNull(quoteRaw.changesPercentage)! / 100 : null, marketDate } : null,
    fundamentals: { ticker: symbol, companyName: profileRaw?.companyName ?? quoteRaw?.name ?? null, sector: profileRaw?.sector ?? null,
      marketCap: numberOrNull(quoteRaw?.marketCap ?? profileRaw?.mktCap), pe: numberOrNull(quoteRaw?.pe), eps: numberOrNull(quoteRaw?.eps) },
    historicalPrices, historyComplete,
  }, { headers: { 'Cache-Control': 'public, s-maxage=21600, stale-while-revalidate=86400' } })
}
