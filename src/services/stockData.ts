import { defaultCatalog, emptyMarketOverview } from '../data/defaultCatalog'
import type { MarketCatalog, MarketOverviewItem, StockSnapshot } from '../types'
import { calculateDrawdown, calculateMetrics, calculatePriceStability } from './metricsCalculator'

export type DataMode = 'market' | 'fallback'
export type RefreshState = { status:'success'|'partial'|'failed'; trigger:'manual'|'scheduled'; completedAt:string; marketDate:string|null; sources:{toss:{status:string};google:{status:string};supabase:{status:string}} } | null
export type ValidationRow = { ticker: string; status: 'ok'|'partial'|'failed'; missing: string[] }
export type StockDataResult = { stocks: StockSnapshot[]; mode: DataMode; marketDate: string | null; updatedAt: string | null; validation: ValidationRow[]; catalog:MarketCatalog; marketOverview:MarketOverviewItem[]; refresh:RefreshState }
export interface StockDataProvider { getStocks(): Promise<StockDataResult> }

type DashboardPayload={payloads?:Record<string,import('./marketDataProvider').MarketDataPayload>;catalog?:MarketCatalog;marketOverview?:MarketOverviewItem[];refresh?:RefreshState}
class DashboardStockDataProvider implements StockDataProvider{
  constructor(private readonly forceRefresh=false){}
  async getStocks():Promise<StockDataResult>{
    const result=await fetch('/api/market-data?dashboard=1',{signal:AbortSignal.timeout(90_000),headers:{...(this.forceRefresh?{'x-refresh-market-data':'1'}:{})}})
    if(!result.ok)throw new Error(`Dashboard data request failed: ${result.status}`)
    const body=await result.json() as DashboardPayload,catalog=body.catalog?.stocks.length&&body.catalog.groups.length?body.catalog:defaultCatalog,payloads=body.payloads??{},currentYear=new Date().getUTCFullYear(),validation:ValidationRow[]=[]
    let latestMarketDate:string|null=null,latestUpdatedAt:string|null=null,liveCount=0
    const stocks=catalog.stocks.filter(stock=>stock.active).sort((a,b)=>a.sortOrder-b.sortOrder).map(master=>{
      const payload=payloads[master.ticker]
      if(!payload){validation.push({ticker:master.ticker,status:'failed',missing:['all']});return blankStock(master.ticker,master.company,master.sector)}
      liveCount+=1;const quote=payload.quote,fundamentals=payload.fundamentals,prices=payload.historicalPrices??[],metrics=calculateMetrics(prices,quote?.price??null,currentYear,payload.historyComplete),price=quote?.price??prices.at(-1)?.close??null
      if(quote?.marketDate&&(!latestMarketDate||quote.marketDate>latestMarketDate))latestMarketDate=quote.marketDate
      if(payload.updatedAt&&(!latestUpdatedAt||payload.updatedAt>latestUpdatedAt))latestUpdatedAt=payload.updatedAt
      const stock:StockSnapshot={...blankStock(master.ticker,master.company,master.sector),company:fundamentals?.companyName??master.company,sector:fundamentals?.sector??master.sector,marketCap:fundamentals?.marketCap??null,pe:fundamentals?.pe??null,eps:fundamentals?.eps??null,price,changePercent:quote?.changePercent??(quote?.price&&quote.previousClose?quote.price/quote.previousClose-1:null),...metrics,high52:metrics.high52,low52:metrics.low52,drawdown52:calculateDrawdown(price,metrics.high52),historyComplete:payload.historyComplete,priceHistory:prices,dataSource:price!==null?'toss':'reference',storageSource:payload.storageSource,stale:payload.stale,fundamentalsHistory:payload.fundamentalsHistory??[],financialQuarters:payload.financialQuarters??[],companyQuality:payload.companyQuality??null,priceStability:calculatePriceStability(prices,metrics.ma20,metrics.ma60),sources:payload.sources}
      const checks:[string,unknown][]=[['price',stock.price],['change',stock.changePercent],['marketCap',stock.marketCap],['pe',stock.pe],['eps',stock.eps],['high52',stock.high52],['low52',stock.low52],['yearOpen',stock.yearOpen],['ytd',stock.ytdReturn],['return3m',stock.return3m],['return1y',stock.return1y],['return3y',stock.return3y],['ma20',stock.ma20],['ma60',stock.ma60],['ma120',stock.ma120],['ma200',stock.ma200]],missing=checks.filter(([,value])=>value===null||value===undefined).map(([name])=>name)
      validation.push({ticker:master.ticker,status:missing.length?'partial':'ok',missing});return stock
    })
    return{stocks,mode:liveCount?'market':'fallback',marketDate:latestMarketDate,updatedAt:body.refresh?.completedAt??latestUpdatedAt,validation,catalog,marketOverview:body.marketOverview??emptyMarketOverview,refresh:body.refresh??null}
  }
}
const blankStock=(ticker:string,company:string,sector:string|null):StockSnapshot=>({ticker,company,sector,marketCap:null,pe:null,eps:null,price:null,changePercent:null,ath:null,high52:null,drawdown52:null,low52:null,atl:null,mdd:{},yearOpen:null,ytdReturn:null,return1m:null,return3m:null,return6m:null,return1y:null,return3y:null,return5y:null,ma20:null,ma60:null,ma120:null,ma200:null,historyComplete:false,priceHistory:[],dataSource:'reference'})

export const createStockDataProvider=(forceRefresh=false):StockDataProvider=>new DashboardStockDataProvider(forceRefresh)
