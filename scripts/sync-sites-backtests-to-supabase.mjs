/**
 * Transitional one-time copier for backtest records that exist only in the
 * previous Codex Sites D1 database. It is safe to re-run: run IDs are upserted
 * and no Supabase data is deleted.
 */
const base = process.env.SUPABASE_URL?.replace(/\/$/, '')
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
const legacyMarketUrl = process.env.MARKET_SYNC_URL
if (!base || !key || !legacyMarketUrl) throw new Error('SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, MARKET_SYNC_URL이 필요합니다.')

const legacy = new URL(legacyMarketUrl)
legacy.pathname = '/api/backtests'
legacy.search = ''
const legacyHeaders = process.env.SITES_BYPASS_TOKEN ? { 'OAI-Sites-Authorization': `Bearer ${process.env.SITES_BYPASS_TOKEN}` } : {}
const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }

const copy = async (table, rows, conflict) => {
  if (!rows.length) return 0
  const response = await fetch(`${base}/rest/v1/${table}?on_conflict=${encodeURIComponent(conflict)}`, {
    method: 'POST',
    headers: { ...headers, Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(rows),
  })
  if (!response.ok) throw new Error(`${table} 저장 실패 (${response.status}): ${(await response.text()).slice(0, 180)}`)
  return rows.length
}

const response = await fetch(legacy, { headers: legacyHeaders, signal: AbortSignal.timeout(60_000) })
if (!response.ok) throw new Error(`기존 백테스트 조회 실패 (${response.status})`)
const body = await response.json()
const runs = Array.isArray(body.runs) ? body.runs : []
const runRows = runs.map(run => ({
  id: run.id,
  run_date: run.runDate,
  phase: run.phase,
  title: run.title,
  algorithm_version: run.algorithmVersion,
  period_start: run.periodStart,
  period_end: run.periodEnd,
  universe: run.universe,
  config_json: run.config ?? {},
  summary_json: run.summary ?? {},
  conclusion: run.conclusion ?? '',
  created_at: run.createdAt,
}))
const sectionRows = runs.flatMap(run => (run.sections ?? []).map(section => ({
  id: section.id,
  run_id: run.id,
  parent_id: section.parentId ?? null,
  section_type: section.sectionType,
  title: section.title,
  summary: section.summary ?? '',
  report_data_json: section.reportData ?? {},
  sort_order: section.sortOrder,
})))

console.log(`운영 D1 백테스트 ${runs.length}개를 읽었습니다.`)
console.log(`Supabase 이전 완료: backtest_runs ${await copy('backtest_runs', runRows, 'id')} · backtest_sections ${await copy('backtest_sections', sectionRows, 'id')}`)
