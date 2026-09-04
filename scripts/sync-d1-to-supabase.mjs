/**
 * One-way transition helper: copies local Mac mini D1 state into Supabase.
 * It never deletes D1 data and never touches a Site/Cloudflare endpoint.
 *
 * Run after the SQL migration:
 *   node --env-file=.env scripts/sync-d1-to-supabase.mjs
 */
import { DatabaseSync } from 'node:sqlite'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const root = '.wrangler/state/v3/d1/miniflare-D1DatabaseObject'
const filename = existsSync(root) ? readdirSync(root).find(value => value.endsWith('.sqlite') && value !== 'metadata.sqlite') : null
const base = process.env.SUPABASE_URL?.replace(/\/$/, '')
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!filename) throw new Error('로컬 D1 데이터베이스를 찾을 수 없습니다.')
if (!base || !key) throw new Error('SUPABASE_URL과 SUPABASE_SERVICE_ROLE_KEY가 필요합니다.')

const db = new DatabaseSync(join(root, filename), { readOnly: true })
const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }
const chunk = (rows, size = 250) => Array.from({ length: Math.ceil(rows.length / size) }, (_, index) => rows.slice(index * size, index * size + size))
const rest = async (table, rows, conflict) => {
  if (!rows.length) return 0
  for (const batch of chunk(rows)) {
    const response = await fetch(`${base}/rest/v1/${table}?on_conflict=${encodeURIComponent(conflict)}`, { method: 'POST', headers: { ...headers, Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(batch) })
    if (!response.ok) throw new Error(`${table} 동기화 실패 (${response.status}): ${(await response.text()).slice(0, 180)}`)
  }
  return rows.length
}
const tableExists = name => Boolean(db.prepare("select 1 from sqlite_master where type='table' and name=?").get(name))
const rows = name => tableExists(name) ? db.prepare(`select * from ${name}`).all() : []
const parseJson = value => { try { return JSON.parse(value) } catch { return value } }
const iso = value => value ? new Date(value).toISOString() : new Date().toISOString()

try {
  const snapshots = rows('market_snapshots').map(row => ({ ...row, payload: parseJson(row.payload), updated_at: iso(row.updated_at) }))
  const daily = rows('daily_prices')
  const stockSnapshots = rows('stock_snapshots')
  const quarters = rows('financial_quarters').map(row => ({ ...row, updated_at: iso(row.updated_at) }))
  const secState = rows('sec_sync_state').map(row => ({ ...row, checked_at: iso(row.checked_at) }))
  const backtests = rows('backtest_runs').map(row => ({ ...row, run_date: row.run_date, config_json: parseJson(row.config_json), summary_json: parseJson(row.summary_json), created_at: iso(row.created_at) }))
  const sections = rows('backtest_sections').map(row => ({ ...row, report_data_json: parseJson(row.report_data_json) }))
  const counts = {
    market_snapshots: await rest('market_snapshots', snapshots, 'symbol'),
    daily_prices: await rest('daily_prices', daily, 'ticker,market_date'),
    stock_snapshots: await rest('stock_snapshots', stockSnapshots, 'ticker,snapshot_date'),
    financial_quarters: await rest('financial_quarters', quarters, 'ticker,period_end'),
    sec_sync_state: await rest('sec_sync_state', secState, 'ticker'),
    backtest_runs: await rest('backtest_runs', backtests, 'id'),
    backtest_sections: await rest('backtest_sections', sections, 'id'),
  }
  console.log(`Supabase 전환 동기화 완료: ${Object.entries(counts).map(([name, count]) => `${name} ${count}`).join(' · ')}`)
} finally {
  db.close()
}
