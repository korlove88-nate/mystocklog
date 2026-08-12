import { referenceSnapshot } from '../data/referenceSnapshot'
import type { StockSnapshot } from '../types'
import { calculateMetrics } from './metricsCalculator'
import { ExternalMarketDataProvider, type MarketDataProvider } from './marketDataProvider'

export type DataMode = 'market' | 'fallback'
export type StockDataResult = { stocks: StockSnapshot[]; mode: DataMode; marketDate: string | null }
export interface StockDataProvider { getStocks(): Promise<StockDataResult> }

const concurrencyMap = async <T, R>(items: T[], limit: number, worker: (item: T) => Promise<R>): Promise<R[]> => {
  const results = new Array<R>(items.length)
  let cursor = 0
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++
      results[index] = await worker(items[index])
    }
  })
  await Promise.all(runners)
  return results
}

export class CombinedStockDataProvider implements StockDataProvider {
  constructor(private readonly market: MarketDataProvider, private readonly fallback = referenceSnapshot) {}

  async getStocks(): Promise<StockDataResult> {
    let liveCount = 0
    let latestMarketDate: string | null = null
    const currentYear = new Date().getUTCFullYear()
    const stocks = await concurrencyMap(this.fallback, 3, async base => {
      try {
        const [quote, fundamentals, prices, historyComplete] = await Promise.all([
          this.market.getQuote(base.ticker), this.market.getFundamentals(base.ticker),
          this.market.getHistoricalPrices(base.ticker), this.market.isHistoryComplete(base.ticker),
        ])
        if (!quote && !fundamentals && !prices.length) return base
        liveCount += 1
        if (quote?.marketDate && (!latestMarketDate || quote.marketDate > latestMarketDate)) latestMarketDate = quote.marketDate
        const metrics = calculateMetrics(prices, quote?.price ?? null, currentYear, historyComplete)
        return {
          ...base, company: fundamentals?.companyName ?? base.company, sector: fundamentals?.sector ?? base.sector,
          marketCap: fundamentals?.marketCap ?? null, pe: fundamentals?.pe ?? null, eps: fundamentals?.eps ?? null,
          price: quote?.price ?? prices.at(-1)?.close ?? null,
          changePercent: quote?.changePercent ?? (quote?.price && quote.previousClose ? quote.price / quote.previousClose - 1 : null),
          ...metrics, historyComplete, priceHistory: prices,
        }
      } catch { return base }
    })
    return { stocks, mode: liveCount > 0 ? 'market' : 'fallback', marketDate: latestMarketDate }
  }
}

export const stockDataProvider: StockDataProvider = new CombinedStockDataProvider(new ExternalMarketDataProvider())
