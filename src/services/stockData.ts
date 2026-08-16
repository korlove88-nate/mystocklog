import { referenceSnapshot } from '../data/referenceSnapshot'
import { defaultCatalog, emptyMarketOverview } from '../data/defaultCatalog'
import type { MarketCatalog, MarketOverviewItem, StockSnapshot } from '../types'
import { calculateDrawdown, calculateMetrics } from './metricsCalculator'
import type { MarketDataProvider } from './marketDataProvider'

export type DataMode = 'market' | 'fallback'
export type ValidationRow = { ticker: string; status: 'ok'|'partial'|'failed'; missing: string[] }
export type StockDataResult = { stocks: StockSnapshot[]; mode: DataMode; marketDate: string | null; updatedAt: string | null; validation: ValidationRow[]; catalog:MarketCatalog; marketOverview:MarketOverviewItem[] }
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
        const [quote, fundamentals, prices, historyComplete, updatedAt, sources, providerMetrics] = await Promise.all([
          this.market.getQuote(base.ticker), this.market.getFundamentals(base.ticker),
          this.market.getHistoricalPrices(base.ticker), this.market.isHistoryComplete(base.ticker), this.market.getUpdatedAt(base.ticker), this.market.getSources(base.ticker), this.market.getProviderMetrics(base.ticker),
        ])
        if (!quote && !fundamentals && !prices.length) { validation.push({ticker:base.ticker,status:'failed',missing:['all']}); return {...base,dataSource:'reference' as const} }
        liveCount += 1
        if (quote?.marketDate && (!latestMarketDate || quote.marketDate > latestMarketDate)) latestMarketDate = quote.marketDate
        if (updatedAt && (!latestUpdatedAt || updatedAt > latestUpdatedAt)) latestUpdatedAt = updatedAt
        const metrics = calculateMetrics(prices, quote?.price ?? null, currentYear, historyComplete)
        const price = quote?.price ?? prices.at(-1)?.close ?? null
        const high52 = providerMetrics?.high52 ?? metrics.high52
        const low52 = providerMetrics?.low52 ?? metrics.low52
        const stock: StockSnapshot = {
          ...base, company: fundamentals?.companyName ?? base.company, sector: fundamentals?.sector ?? base.sector,
          marketCap: fundamentals?.marketCap ?? null, pe: fundamentals?.pe ?? null, eps: fundamentals?.eps ?? null,
          price,
          changePercent: quote?.changePercent ?? (quote?.price && quote.previousClose ? quote.price / quote.previousClose - 1 : null),
          ...metrics, high52, low52, drawdown52: calculateDrawdown(price,high52), historyComplete, priceHistory: prices,
          dataSource: sources?.price === 'googlefinance' || sources?.history === 'googlefinance' ? 'hybrid' : sources?.price === 'fmp' ? 'fmp' : 'stored',
          sources,
        }
        const checks: [string, unknown][] = [['price',stock.price],['change',stock.changePercent],['marketCap',stock.marketCap],['pe',stock.pe],['eps',stock.eps],['high52',stock.high52],['low52',stock.low52],['yearOpen',stock.yearOpen],['ytd',stock.ytdReturn],['return1m',stock.return1m],['return3m',stock.return3m],['return6m',stock.return6m],['return1y',stock.return1y],['return3y',stock.return3y],['return5y',stock.return5y],['ma20',stock.ma20],['ma60',stock.ma60],['ma120',stock.ma120],['ma200',stock.ma200]]
        const missing=checks.filter(([,value])=>value===null||value===undefined).map(([name])=>name)
        validation.push({ticker:base.ticker,status:missing.length?'partial':'ok',missing})
        return stock
      } catch { validation.push({ticker:base.ticker,status:'failed',missing:['all']}); return {...base,dataSource:'reference' as const} }
    })
    return { stocks, mode: liveCount > 0 ? 'market' : 'fallback', marketDate: latestMarketDate, updatedAt: latestUpdatedAt, validation, catalog:defaultCatalog, marketOverview:emptyMarketOverview }
  }
}

type DashboardPayload={payloads?:Record<string,import('./marketDataProvider').MarketDataPayload>;catalog?:MarketCatalog;marketOverview?:MarketOverviewItem[]}
class DashboardStockDataProvider implements StockDataProvider{
  constructor(private readonly forceRefresh=false,private readonly useFmp=false){}
  async getStocks():Promise<StockDataResult>{
    const result=await fetch('/api/market-data?dashboard=1',{signal:AbortSignal.timeout(90_000),headers:{...(this.forceRefresh?{'x-refresh-market-data':'1'}:{}),...(this.useFmp?{'x-use-fmp':'1'}:{})}})
    if(!result.ok)throw new Error(`Dashboard data request failed: ${result.status}`)
    const body=await result.json() as DashboardPayload,catalog=body.catalog?.stocks.length&&body.catalog.groups.length?body.catalog:defaultCatalog,payloads=body.payloads??{},currentYear=new Date().getUTCFullYear(),validation:ValidationRow[]=[]
    let latestMarketDate:string|null=null,latestUpdatedAt:string|null=null,liveCount=0
    const stocks=catalog.stocks.filter(stock=>stock.active).sort((a,b)=>a.sortOrder-b.sortOrder).map(master=>{
      const payload=payloads[master.ticker],reference=referenceSnapshot.find(stock=>stock.ticker===master.ticker)
      if(!payload){validation.push({ticker:master.ticker,status:'failed',missing:['all']});return{...(reference??blankStock(master.ticker,master.company,master.sector)),company:master.company,sector:master.sector}}
      liveCount+=1;const quote=payload.quote,fundamentals=payload.fundamentals,prices=payload.historicalPrices??[],metrics=calculateMetrics(prices,quote?.price??null,currentYear,payload.historyComplete),price=quote?.price??prices.at(-1)?.close??null,high52=payload.providerMetrics?.high52??metrics.high52,low52=payload.providerMetrics?.low52??metrics.low52
      if(quote?.marketDate&&(!latestMarketDate||quote.marketDate>latestMarketDate))latestMarketDate=quote.marketDate
      if(payload.updatedAt&&(!latestUpdatedAt||payload.updatedAt>latestUpdatedAt))latestUpdatedAt=payload.updatedAt
      const stock:StockSnapshot={...(reference??blankStock(master.ticker,master.company,master.sector)),company:fundamentals?.companyName??master.company,sector:fundamentals?.sector??master.sector,marketCap:fundamentals?.marketCap??null,pe:fundamentals?.pe??null,eps:fundamentals?.eps??null,price,changePercent:quote?.changePercent??(quote?.price&&quote.previousClose?quote.price/quote.previousClose-1:null),...metrics,high52,low52,drawdown52:calculateDrawdown(price,high52),historyComplete:payload.historyComplete,priceHistory:prices,dataSource:payload.sources?.price==='googlefinance'||payload.sources?.history==='googlefinance'?'hybrid':payload.sources?.price==='fmp'?'fmp':'stored',sources:payload.sources}
      const checks:[string,unknown][]=[['price',stock.price],['change',stock.changePercent],['marketCap',stock.marketCap],['pe',stock.pe],['eps',stock.eps],['high52',stock.high52],['low52',stock.low52],['yearOpen',stock.yearOpen],['ytd',stock.ytdReturn],['return3m',stock.return3m],['return1y',stock.return1y],['return3y',stock.return3y],['ma20',stock.ma20],['ma60',stock.ma60],['ma120',stock.ma120],['ma200',stock.ma200]],missing=checks.filter(([,value])=>value===null||value===undefined).map(([name])=>name)
      validation.push({ticker:master.ticker,status:missing.length?'partial':'ok',missing});return stock
    })
    return{stocks,mode:liveCount?'market':'fallback',marketDate:latestMarketDate,updatedAt:latestUpdatedAt,validation,catalog,marketOverview:body.marketOverview??emptyMarketOverview}
  }
}
const blankStock=(ticker:string,company:string,sector:string|null):StockSnapshot=>({ticker,company,sector,marketCap:null,pe:null,eps:null,price:null,changePercent:null,ath:null,high52:null,drawdown52:null,low52:null,atl:null,mdd:{},yearOpen:null,ytdReturn:null,return1m:null,return3m:null,return6m:null,return1y:null,return3y:null,return5y:null,ma20:null,ma60:null,ma120:null,ma200:null,historyComplete:false,priceHistory:[],dataSource:'reference'})

export const createStockDataProvider=(forceRefresh=false,useFmp=false):StockDataProvider=>new DashboardStockDataProvider(forceRefresh,useFmp)
