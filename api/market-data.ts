import { env } from 'cloudflare:workers'
import { handleMarketData } from '../worker/market-data'

export default function handler(request: Request): Promise<Response> {
  const bindings = env as unknown as { DB?: D1Database; FMP_API_KEY?: string }
  if (!bindings.DB) return Promise.resolve(Response.json({ error: 'Durable storage unavailable' }, { status: 503 }))
  return handleMarketData(request, bindings.DB, bindings.FMP_API_KEY)
}
