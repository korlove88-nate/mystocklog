/**
 * One-way transition helper for the legacy Sites D1 market snapshots.
 *
 * The Mac mini's local D1 is not the same database as the existing production
 * Site.  This reads the already-stored dashboard payload once and upserts it
 * into Supabase without calling Toss or modifying the legacy Site.
 */
const base = process.env.SUPABASE_URL?.replace(/\/$/, '')
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
const syncUrl = process.env.MARKET_SYNC_URL

if (!base || !key || !syncUrl) throw new Error('SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, MARKET_SYNC_URL이 필요합니다.')

const legacy = new URL(syncUrl)
legacy.pathname = '/api/market-data'
legacy.search = 'dashboard=1'

const legacyHeaders = process.env.SITES_BYPASS_TOKEN
  ? { 'OAI-Sites-Authorization': `Bearer ${process.env.SITES_BYPASS_TOKEN}` }
  : {}
const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }
const now = new Date().toISOString()
const cycle = now.slice(0, 10)

const response = await fetch(legacy, { headers: legacyHeaders, signal: AbortSignal.timeout(90_000) })
if (!response.ok) throw new Error(`기존 시장 데이터 조회 실패 (${response.status})`)
const body = await response.json()
const payloads = body.payloads && typeof body.payloads === 'object' ? body.payloads : {}

const rows = Object.entries(payloads).map(([symbol, payload]) => {
  const item = payload && typeof payload === 'object' ? payload : {}
  const quote = item.quote && typeof item.quote === 'object' ? item.quote : {}
  const history = Array.isArray(item.historicalPrices) ? item.historicalPrices : []
  const marketDate = typeof quote.marketDate === 'string' ? quote.marketDate : history.at(-1)?.date ?? null
  return {
    symbol,
    payload: { ...item, storageSource: 'supabase' },
    market_date: marketDate,
    updated_at: typeof item.updatedAt === 'string' ? item.updatedAt : now,
    refresh_cycle: typeof item.refreshCycle === 'string' ? item.refreshCycle : cycle,
  }
})

rows.push({
  symbol: '__DASHBOARD__',
  payload: {
    catalog: body.catalog ?? null,
    marketOverview: body.marketOverview ?? [],
    lastRefresh: body.refresh ?? null,
    updatedAt: body.refresh?.completedAt ?? now,
    refreshCycle: body.refresh?.marketDate ?? cycle,
  },
  market_date: null,
  updated_at: body.refresh?.completedAt ?? now,
  refresh_cycle: body.refresh?.marketDate ?? cycle,
})

const upsert = await fetch(`${base}/rest/v1/market_snapshots?on_conflict=symbol`, {
  method: 'POST',
  headers: { ...headers, Prefer: 'resolution=merge-duplicates,return=minimal' },
  body: JSON.stringify(rows),
})
if (!upsert.ok) throw new Error(`Supabase market_snapshots 저장 실패 (${upsert.status}): ${(await upsert.text()).slice(0, 180)}`)

const overview = Array.isArray(body.marketOverview) ? body.marketOverview.filter(item => item?.value !== null && item?.value !== undefined).length : 0
console.log(`기존 운영 스냅샷 ${rows.length - 1}개와 시장지표 ${overview}개를 Supabase로 동기화했습니다.`)
