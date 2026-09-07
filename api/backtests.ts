import type { IncomingMessage, ServerResponse } from 'node:http'
import { hasSession } from './_auth.js'

type Row = Record<string, unknown>
const readRows = async (table: string, order: string): Promise<Row[]> => {
  const base = (process.env.SUPABASE_URL?.trim() || process.env.NEXT_PUBLIC_SUPABASE_URL?.trim())?.replace(/\/$/, '')
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || process.env.SUPABASE_SECRET_KEY?.trim()
  if (!base || !key) throw new Error('Storage unavailable')
  const rows: Row[] = []
  for (let offset = 0; ; offset += 500) {
    const response = await fetch(`${base}/rest/v1/${table}?select=*&order=${order}&limit=500&offset=${offset}`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(15000),
    })
    if (!response.ok) throw new Error('Storage unavailable')
    const page = await response.json() as Row[]
    rows.push(...page)
    if (page.length < 500) return rows
  }
}
export default async function handler(req: IncomingMessage, res: ServerResponse) {
  const json = (status: number, body: unknown) => {
    res.writeHead(status, { 'Cache-Control': 'private, no-store', 'Content-Type': 'application/json; charset=utf-8' })
    res.end(JSON.stringify(body))
  }
  if (!hasSession(req)) return json(401, { error: 'Authentication required.' })
  if (req.method !== 'GET') return json(405, { error: 'Method not allowed' })
  try {
    const [runs, sections] = await Promise.all([
      readRows('backtest_runs', 'run_date.asc,created_at.asc,id.asc'),
      readRows('backtest_sections', 'sort_order.asc,id.asc'),
    ])
    return json(200, { runs: runs.map(run => ({
      id: run.id, runDate: run.run_date, phase: run.phase, title: run.title,
      algorithmVersion: run.algorithm_version, periodStart: run.period_start, periodEnd: run.period_end,
      universe: run.universe, config: run.config_json, summary: run.summary_json,
      conclusion: run.conclusion, createdAt: run.created_at,
      sections: sections.filter(section => section.run_id === run.id).map(section => ({
        id: section.id, parentId: section.parent_id, sectionType: section.section_type,
        title: section.title, summary: section.summary, reportData: section.report_data_json,
        sortOrder: section.sort_order,
      })),
    })) })
  } catch {
    return json(503, { error: '백테스트 기록을 불러오지 못했습니다. 잠시 후 다시 시도하세요.' })
  }
}
