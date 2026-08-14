import { referenceSnapshot } from '../data/referenceSnapshot'
import type { StockSnapshot } from '../types'
import { calculateMetrics } from './metricsCalculator'
import { ExternalMarketDataProvider, type MarketDataProvider } from './marketDataProvider'

export type DataMode = 'market' | 'fallback'
export type ValidationRow = { ticker: string; status: 'ok'|'partial'|'failed'; missing: string[] }
export type StockDataResult = { stocks: StockSnapshot[]; mode: DataMode; marketDate: string | null; updatedAt: string | null; validation: ValidationRow[] }
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
    let latestUpdatedAt: string | null = null
    const currentYear = new Date().getUTCFullYear()
    const validation: ValidationRow[] = []
    const stocks = await concurrencyMap(this.fallback, 3, async base => {
      try {
        const [quote, fundamentals, prices, historyComplete, updatedAt] = await Promise.all([
          this.market.getQuote(base.ticker), this.market.getFundamentals(base.ticker),
          this.market.getHistoricalPrices(base.ticker), this.market.isHistoryComplete(base.ticker), this.market.getUpdatedAt(base.ticker),
        ])
        if (!quote && !fundamentals && !prices.length) { validation.push({ticker:base.ticker,status:'failed',missing:['all']}); return {...base,dataSource:'reference' as const} }
        liveCount += 1
        if (quote?.marketDate && (!latestMarketDate || quote.marketDate > latestMarketDate)) latestMarketDate = quote.marketDate
        if (updatedAt && (!latestUpdatedAt || updatedAt > latestUpdatedAt)) latestUpdatedAt = updatedAt
        const metrics = calculateMetrics(prices, quote?.price ?? null, currentYear, historyComplete)
        const stock: StockSnapshot = {
          ...base, company: fundamentals?.companyName ?? base.company, sector: fundamentals?.sector ?? base.sector,
          marketCap: fundamentals?.marketCap ?? null, pe: fundamentals?.pe ?? null, eps: fundamentals?.eps ?? null,
          price: quote?.price ?? prices.at(-1)?.close ?? null,
          changePercent: quote?.changePercent ?? (quote?.price && quote.previousClose ? quote.price / quote.previousClose - 1 : null),
          ...metrics, historyComplete, priceHistory: prices, dataSource:'fmp',
        }
        const checks: [string, unknown][] = [['price',stock.price],['change',stock.changePercent],['marketCap',stock.marketCap],['pe',stock.pe],['eps',stock.eps],['high52',stock.high52],['low52',stock.low52],['yearOpen',stock.yearOpen],['ytd',stock.ytdReturn],['return1m',stock.return1m],['return3m',stock.return3m],['return6m',stock.return6m],['return1y',stock.return1y],['return3y',stock.return3y],['return5y',stock.return5y],['ma20',stock.ma20],['ma60',stock.ma60],['ma120',stock.ma120],['ma200',stock.ma200]]
        const missing=checks.filter(([,value])=>value===null||value===undefined).map(([name])=>name)
        validation.push({ticker:base.ticker,status:missing.length?'partial':'ok',missing})
        return stock
      } catch { validation.push({ticker:base.ticker,status:'failed',missing:['all']}); return {...base,dataSource:'reference' as const} }
    })
    return { stocks, mode: liveCount > 0 ? 'market' : 'fallback', marketDate: latestMarketDate, updatedAt: latestUpdatedAt, validation }
  }
}

export const createStockDataProvider = (forceRefresh = false): StockDataProvider =>
  new CombinedStockDataProvider(new ExternalMarketDataProvider('/api/market-data', forceRefresh))
