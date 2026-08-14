import { env } from 'cloudflare:workers'
import { handleMarketData } from '../worker/market-data'

export default function handler(request: Request): Promise<Response> {
  const bindings = env as unknown as { DB?: D1Database; FMP_API_KEY?: string; GOOGLE_SHEETS_ID?: string; GOOGLE_SHEETS_API_KEY?: string; GOOGLE_SHEETS_MASTER_RANGE?: string; GOOGLE_SHEETS_HISTORY_RANGE?: string }
  if (!bindings.DB) return Promise.resolve(Response.json({ error: 'Durable storage unavailable' }, { status: 503 }))
  return handleMarketData(request, bindings.DB, bindings)
}
