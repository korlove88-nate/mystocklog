import type { FundamentalHistoryPoint, HistoricalPrice, StockDataSources, StockFundamentals, StockQuote, StorageSource } from '../types'

export interface MarketDataProvider {
  getQuote(ticker: string): Promise<StockQuote | null>
  getHistoricalPrices(ticker: string, startDate?: string, endDate?: string): Promise<HistoricalPrice[]>
  getFundamentals(ticker: string): Promise<StockFundamentals | null>
  isHistoryComplete(ticker: string): Promise<boolean>
  getUpdatedAt(ticker: string): Promise<string | null>
  getSources(ticker: string): Promise<StockDataSources | undefined>
  getProviderMetrics(ticker: string): Promise<{high52:number|null;low52:number|null}|undefined>
}

export type MarketDataPayload = {
  quote: StockQuote | null
  fundamentals: StockFundamentals | null
  historicalPrices: HistoricalPrice[]
  historyComplete: boolean
  updatedAt?: string | null
  sources?: StockDataSources
  providerMetrics?: { high52: number | null; low52: number | null }
  storageSource?: StorageSource
  stale?: boolean
  fundamentalsHistory?: FundamentalHistoryPoint[]
}

export class ExternalMarketDataProvider implements MarketDataProvider {
  private readonly cache = new Map<string, Promise<MarketDataPayload>>()
  private batch: Promise<Record<string, MarketDataPayload>> | null = null
  constructor(private readonly proxyUrl = '/api/market-data', private readonly forceRefresh = false, private readonly symbols: string[] = []) {}

  private loadBatch(): Promise<Record<string, MarketDataPayload>> {
    if (this.batch) return this.batch
    const query = this.symbols.map(symbol => symbol.trim().toUpperCase()).filter(Boolean).join(',')
    this.batch = fetch(`${this.proxyUrl}?symbols=${encodeURIComponent(query)}`, {
      signal: AbortSignal.timeout(30_000),
      headers: this.forceRefresh ? { 'x-refresh-market-data': '1' } : {},
    }).then(async response => {
      if (!response.ok) throw new Error(`Market data request failed: ${response.status}`)
      const body = await response.json() as { payloads?: Record<string, MarketDataPayload> }
      return body.payloads ?? {}
    }).catch(error => { this.batch = null; throw error })
    return this.batch
  }

  private load(ticker: string): Promise<MarketDataPayload> {
    const symbol = ticker.trim().toUpperCase()
    const existing = this.cache.get(symbol)
    if (existing) return existing
    if (this.symbols.length) {
      const request = this.loadBatch().then(payloads => {
        const payload = payloads[symbol]
        if (!payload) throw new Error(`No market data for ${symbol}`)
        return payload
      })
      this.cache.set(symbol, request)
      return request
    }
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
  async getSources(ticker: string) { return (await this.load(ticker)).sources }
  async getProviderMetrics(ticker: string) { return (await this.load(ticker)).providerMetrics }
  async getHistoricalPrices(ticker: string, startDate?: string, endDate?: string) {
    const prices = (await this.load(ticker)).historicalPrices
    return prices.filter(point => (!startDate || point.date >= startDate) && (!endDate || point.date <= endDate))
  }
}
