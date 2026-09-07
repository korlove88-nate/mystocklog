import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { IncomingMessage, ServerResponse } from 'node:http'
import market from '../api/market-data'
import backtests from '../api/backtests'
import { issueSession, sessionCookie } from '../api/_auth'

beforeEach(() => {
  vi.stubEnv('APP_ACCESS_CODE', 'test-code')
  vi.stubEnv('APP_SESSION_SECRET', 'test-secret')
  vi.stubEnv('SUPABASE_URL', 'https://example.invalid')
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-key')
})
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.useRealTimers() })
async function call(handler: typeof market, url: string, authenticated = true) {
  const req = { method: 'GET', url, headers: { host: 'localhost', cookie: authenticated ? sessionCookie(issueSession()!) : '' } } as IncomingMessage
  const res = { writeHead: vi.fn(), end: vi.fn() }
  await handler(req, res as unknown as ServerResponse)
  return { status: res.writeHead.mock.calls[0][0], body: JSON.parse(res.end.mock.calls[0][0]) }
}
describe('Vercel data routes', () => {
  it('blocks unauthenticated requests before storage access', async () => {
    const fetcher = vi.fn()
    vi.stubGlobal('fetch', fetcher)
    expect((await call(market, '/api/market-data?dashboard=1', false)).status).toBe(401)
    expect((await call(backtests, '/api/backtests', false)).status).toBe(401)
    expect(fetcher).not.toHaveBeenCalled()
  })
  it('retains stored prices when optional live tables fail', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-08T15:00:00Z'))
    vi.stubGlobal('fetch', vi.fn(async (url: string) => url.includes('market_snapshots')
      ? Response.json([{ symbol: 'AAPL', payload: { quote: { price: 100 } } }])
      : new Response('', { status: 503 })))
    const result = await call(market, '/api/market-data?dashboard=1')
    expect(result.status).toBe(200)
    expect(result.body.payloads.AAPL.quote.price).toBe(100)
    expect(result.body.liveQuote.status).toBe('failed')
  })
  it('does not overlay an intraday quote on a holiday', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-07T15:00:00Z'))
    vi.stubGlobal('fetch', vi.fn(async (url: string) => Response.json(
      url.includes('market_snapshots') ? [{ symbol: 'AAPL', payload: { quote: { price: 100 } } }] :
      url.includes('latest_prices') ? [{ ticker: 'AAPL', price: 120 }] :
      [{ status: 'NORMAL', last_success_at: '2026-09-07T15:00:00Z' }])))
    const result = await call(market, '/api/market-data?dashboard=1')
    expect(result.body.payloads.AAPL.quote.price).toBe(100)
    expect(result.body.liveQuote.status).toBe('closed')
  })
  it('maps stored backtest reports to the existing UI format', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => Response.json(url.includes('backtest_runs')
      ? [{ id: 'run-1', run_date: '2026-09-01', summary_json: { count: 2 } }]
      : [{ id: 's1', run_id: 'run-1', report_data_json: { value: 2 }, sort_order: 1 }])))
    const result = await call(backtests, '/api/backtests')
    expect(result.status).toBe(200)
    expect(result.body.runs[0].runDate).toBe('2026-09-01')
    expect(result.body.runs[0].sections[0].reportData).toEqual({ value: 2 })
  })
})
