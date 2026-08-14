import type { HistoricalPrice, StockFundamentals, StockQuote } from '../types'

export interface MarketDataProvider {
  getQuote(ticker: string): Promise<StockQuote | null>
  getHistoricalPrices(ticker: string, startDate?: string, endDate?: string): Promise<HistoricalPrice[]>
  getFundamentals(ticker: string): Promise<StockFundamentals | null>
  isHistoryComplete(ticker: string): Promise<boolean>
  getUpdatedAt(ticker: string): Promise<string | null>
}

export type MarketDataPayload = {
  quote: StockQuote | null
  fundamentals: StockFundamentals | null
  historicalPrices: HistoricalPrice[]
  historyComplete: boolean
  updatedAt?: string | null
}

export class ExternalMarketDataProvider implements MarketDataProvider {
  private readonly cache = new Map<string, Promise<MarketDataPayload>>()
  constructor(private readonly proxyUrl = '/api/market-data', private readonly forceRefresh = false) {}

  private load(ticker: string): Promise<MarketDataPayload> {
    const symbol = ticker.trim().toUpperCase()
    const existing = this.cache.get(symbol)
    if (existing) return existing
    const request = fetch(`${this.proxyUrl}?symbol=${encodeURIComponent(symbol)}`, {
      signal: AbortSignal.timeout(15_000),
      headers: {
        ...(this.forceRefresh ? { 'x-refresh-market-data': '1' } : {}),
      },
    })
      .then(async response => {
        if (!response.ok) throw new Error(`Market data request failed: ${response.status}`)
        return response.json() as Promise<MarketDataPayload>
      })
      .catch(error => { this.cache.delete(symbol); throw error })
    this.cache.set(symbol, request)
    return request
  }

  async getQuote(ticker: string) { return (await this.load(ticker)).quote }
  async getFundamentals(ticker: string) { return (await this.load(ticker)).fundamentals }
  async isHistoryComplete(ticker: string) { return (await this.load(ticker)).historyComplete }
  async getUpdatedAt(ticker: string) { return (await this.load(ticker)).updatedAt ?? null }
  async getHistoricalPrices(ticker: string, startDate?: string, endDate?: string) {
    const prices = (await this.load(ticker)).historicalPrices
    return prices.filter(point => (!startDate || point.date >= startDate) && (!endDate || point.date <= endDate))
  }
}
