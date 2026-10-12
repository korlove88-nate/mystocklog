/** Mac mini incremental confirmed candles. No web server, Sites, or backtest writes. */
import { appendFile, mkdir, rmdir } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { latestCompletedUsMarketDate } from '../src/services/marketHours.ts'
import { loadGoogleFinanceWorkbook } from '../worker/google-finance-sheets.ts'

export function mergeConfirmed(history, candles, completedDate) {
  const byDate = new Map(history.map(point => [point.date, point])), added = [], revisions = []
  for (const point of candles) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(point.date)) throw new Error('INVALID_DATE')
    if (point.date > completedDate) continue
    if (![point.open, point.high, point.low, point.close, point.volume].every(Number.isFinite) || point.close <= 0 || point.volume < 0 || point.low > Math.min(point.open, point.close) || point.high < Math.max(point.open, point.close)) throw new Error('INVALID_CANDLE')
    const old = byDate.get(point.date)
    if (old && Math.abs(old.close - point.close) / old.close > 0.01) throw new Error('HISTORICAL_PRICE_MISMATCH')
    if (old && ['open','high','low','close','volume'].some(key => old[key] !== point[key])) revisions.push({ date: point.date, storedClose: old.close, sourceClose: point.close, storedVolume: old.volume, sourceVolume: point.volume })
    if (!old) { byDate.set(point.date, point); added.push(point) }
  }
  return { history: [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date)), added, revisions }
}

export async function collectCandles(ticker, since, completedDate, getPage) {
  const count = Math.min(200, Math.max(5, Math.ceil((Date.parse(completedDate) - Date.parse(since)) / 86400000) + 3))
  let before = null
  const candles = []
  for (let page = 0; page < 100; page++) {
    const result = await getPage({ ticker, count, before }), rows = result?.result?.candles
    if (!Array.isArray(rows) || !rows.length) break
    const points = rows.map(row => ({ date: String(row.timestamp).slice(0, 10), open: row.openPrice == null ? null : Number(row.openPrice), high: row.highPrice == null ? null : Number(row.highPrice), low: row.lowPrice == null ? null : Number(row.lowPrice), close: row.closePrice == null ? null : Number(row.closePrice), adjustedClose: Number(row.closePrice), volume: row.volume == null ? null : Number(row.volume) }))
    candles.push(...points.filter(point => point.date >= since && point.date <= completedDate))
    if (points.some(point => point.date <= since)) return candles
    const next = result.result.nextBefore
    if (!next || next === before) break
    before = next
  }
  throw new Error('CANDLE_COVERAGE_INCOMPLETE')
}

const errorCode = error => error?.cause?.code ?? (/^[A-Z_0-9]+$/.test(error.message) ? error.message : error.code ?? 'REQUEST_FAILED')
export async function main({ check = false } = {}) {
  const base = process.env.SUPABASE_URL?.replace(/\/$/, ''), key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!base || !key) throw new Error('SUPABASE_ENV_MISSING')
  const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }
  const rest = async (path, options = {}) => {
    const response = await fetch(`${base}/rest/v1/${path}`, { ...options, headers: { ...headers, ...options.headers }, signal: AbortSignal.timeout(30000) })
    if (!response.ok) throw new Error(`SUPABASE_HTTP_${response.status}`)
    const text = await response.text()
    return text ? JSON.parse(text) : null
  }
  const upsert = (table, rows, conflict, ignore = false) => rows.length ? rest(`${table}?on_conflict=${conflict}`, { method: 'POST', headers: { Prefer: `resolution=${ignore ? 'ignore' : 'merge'}-duplicates,return=minimal` }, body: JSON.stringify(rows) }) : Promise.resolve()
  const snapshots = await rest('market_snapshots?select=*&order=symbol.asc&limit=1000'), completedDate = latestCompletedUsMarketDate()
  if (check) {
    const collector = await rest('collector_status?select=status,last_success_at,last_error_code,updated_at')
    console.log(JSON.stringify({ completedDate, snapshots: snapshots.map(row => ({ ticker: row.symbol, marketDate: row.market_date, updatedAt: row.updated_at })), collector }))
    return
  }
  const clientId = process.env.TOSS_CLIENT_ID, clientSecret = process.env.TOSS_CLIENT_SECRET
  if (!clientId || !clientSecret) throw new Error('TOSS_ENV_MISSING')
  await mkdir('.automation-logs', { recursive: true })
  const lock = '.automation-logs/daily-supabase.lock'
  await mkdir(lock)
  const log = async message => { const line = `${new Date().toISOString()} ${message}\n`; process.stdout.write(line); await appendFile('.automation-logs/daily-refresh-supabase.log', line) }
  try {
    const dashboard = snapshots.find(row => row.symbol === '__DASHBOARD__')
    if (!dashboard?.payload?.catalog) throw new Error('DASHBOARD_CATALOG_MISSING')
    const active = new Set(dashboard.payload.catalog.stocks.filter(stock => stock.active).map(stock => stock.ticker))
    const report = { target: completedDate, updated: [], unchanged: [], skipped: [], failed: [] }
    let token
    const getPage = async ({ ticker, count, before }) => {
      if (!token) {
        const auth = await fetch('https://openapi.tossinvest.com/oauth2/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'client_credentials', client_id: clientId, client_secret: clientSecret }), signal: AbortSignal.timeout(20000) })
        if (!auth.ok) throw new Error(`TOSS_AUTH_HTTP_${auth.status}`)
        token = (await auth.json()).access_token
        if (!token) throw new Error('TOSS_TOKEN_MISSING')
      }
      const query = new URLSearchParams({ symbol: ticker === 'BRK-B' ? 'BRK.B' : ticker, interval: '1d', adjusted: 'true', count: String(count) })
      if (before) query.set('before', before)
      const response = await fetch(`https://openapi.tossinvest.com/api/v1/candles?${query}`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(20000) })
      if (!response.ok) throw new Error(`TOSS_CANDLES_HTTP_${response.status}`)
      return response.json()
    }
    await log(`직접 일봉 갱신 시작 · 목표 ${completedDate}`)
    for (const row of snapshots.filter(row => active.has(row.symbol))) {
      const ticker = row.symbol
      try {
        if (ticker === 'SPCX') { report.skipped.push({ ticker, reason: 'NO_LISTED_TOSS_MAPPING' }); continue }
        const oldHistory = row.payload.historicalPrices ?? [], since = oldHistory.at(-1)?.date
        if (!since) { report.skipped.push({ ticker, reason: 'NO_EXISTING_HISTORY' }); continue }
        if (since >= completedDate) { report.unchanged.push(ticker); continue }
        const points = await collectCandles(ticker, since, completedDate, getPage), merged = mergeConfirmed(oldHistory, points, completedDate)
        if (merged.history.at(-1)?.date !== completedDate) throw new Error('LATEST_COMPLETED_CANDLE_MISSING')
        const last = merged.history.at(-1), previous = merged.history.at(-2)
        await upsert('daily_prices', merged.added.map(point => ({ ticker, market_date: point.date, open: point.open, high: point.high, low: point.low, close: point.close, volume: point.volume, source: 'TOSS' })), 'ticker,market_date', true)
        const stamp = new Date().toISOString()
        const payload = { ...row.payload, historicalPrices: merged.history, quote: { ...row.payload.quote, ticker, price: last.close, previousClose: previous?.close ?? null, changePercent: previous?.close ? last.close / previous.close - 1 : null, marketDate: last.date }, updatedAt: stamp, refreshCycle: completedDate, stale: false, storageSource: 'supabase' }
        await upsert('market_snapshots', [{ ...row, payload, market_date: last.date, updated_at: stamp, refresh_cycle: completedDate }], 'symbol')
        report.updated.push({ ticker, added: merged.added.length, marketDate: last.date, historicalRevisionsNotApplied: merged.revisions })
        await log(`${ticker} · ${merged.added.length}개 일봉 보충 · ${last.date}`)
      } catch (error) {
        const code = errorCode(error)
        report.failed.push({ ticker, code }); await log(`${ticker} 실패 · ${code}`)
        if (/HTTP_(401|403|429)$/.test(code)) break
      }
    }
    let marketOverview = dashboard.payload.marketOverview ?? [], googleStatus = 'skipped'
    if (process.env.GOOGLE_SHEETS_ID && process.env.GOOGLE_SHEETS_API_KEY) {
      const workbook = await loadGoogleFinanceWorkbook({ spreadsheetId: process.env.GOOGLE_SHEETS_ID, apiKey: process.env.GOOGLE_SHEETS_API_KEY, masterRange: process.env.GOOGLE_SHEETS_MASTER_RANGE || 'STOCK_MASTER!A1:Z1000', historyRange: '', marketRange: process.env.GOOGLE_SHEETS_MARKET_RANGE || 'MARKET_OVERVIEW!A1:J30' })
      const fresh = workbook.marketOverview.filter(item => item.value !== null)
      marketOverview = marketOverview.map(old => fresh.find(item => item.key === old.key) ?? old)
      googleStatus = fresh.length === 6 ? 'ok' : fresh.length ? 'partial' : 'failed'
    }
    const stamp = new Date().toISOString(), status = report.failed.length ? (report.updated.length + report.unchanged.length ? 'partial' : 'failed') : 'success'
    const lastRefresh = { status, trigger: 'scheduled', completedAt: stamp, marketDate: completedDate, sources: { toss: { status: report.failed.length ? 'failed' : 'ok' }, google: { status: googleStatus }, supabase: { status: 'ok' } }, details: report }
    await upsert('market_snapshots', [{ ...dashboard, payload: { ...dashboard.payload, marketOverview, lastRefresh }, updated_at: stamp, refresh_cycle: completedDate }], 'symbol')
    await log(JSON.stringify(report))
    if (report.failed.length) process.exitCode = 1
  } finally { await rmdir(lock) }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main({ check: process.argv.includes('--check') }).catch(error => { console.error(`일일 갱신 실패 · ${errorCode(error)}`); process.exitCode = 1 })
