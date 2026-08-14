import { marketSnapshotsSchema } from '../db/schema'
import type { StockDataSources } from '../src/types'
import { loadGoogleFinanceSheet, type GoogleFinanceRecord } from './google-finance-sheets'
import { symbolMaster } from './symbol-master'

const FMP_BASE_URL = 'https://financialmodelingprep.com/stable'
const TIMEOUT_MS = 12_000
const numberOrNull = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? value : null
const first = (value: unknown) => Array.isArray(value) ? value[0] : null
type SnapshotRow = { payload: string; market_date: string | null; updated_at: string; refresh_cycle: string }
type PricePoint = { date: string; open: number | null; high: number | null; low: number | null; close: number; adjustedClose: number | null; volume: number | null }
type StoredPayload = {
  quote: Record<string, unknown> | null
  fundamentals: Record<string, unknown> | null
  historicalPrices: PricePoint[]
  historyComplete: boolean
  updatedAt: string
  refreshCycle: string
  fundamentalsUpdatedAt?: string | null
  sources?: StockDataSources
  providerMetrics?: { high52: number | null; low52: number | null }
  stale?: boolean
}
export type MarketBindings = {
  FMP_API_KEY?: string
  GOOGLE_SHEETS_ID?: string
  GOOGLE_SHEETS_API_KEY?: string
  GOOGLE_SHEETS_MASTER_RANGE?: string
  GOOGLE_SHEETS_HISTORY_RANGE?: string
}

const refreshCycle = (now = new Date()) => {
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000)
  if (kst.getUTCHours() < 6 || (kst.getUTCHours() === 6 && kst.getUTCMinutes() < 40)) kst.setUTCDate(kst.getUTCDate() - 1)
  return kst.toISOString().slice(0,10)
}
const response = (body: unknown, cache: string, status = 200) => Response.json(body,{status,headers:{'Cache-Control':'private, no-store','X-Market-Cache':cache}})
async function fmp(path:string,apiKey:string){const separator=path.includes('?')?'&':'?';const result=await fetch(`${FMP_BASE_URL}${path}${separator}apikey=${encodeURIComponent(apiKey)}`,{signal:AbortSignal.timeout(TIMEOUT_MS)});if(!result.ok)throw new Error(`FMP ${result.status}`);return result.json()}
const normalizeHistory=(value:unknown):PricePoint[]=>{const object=value as {historical?:unknown};const rows=(Array.isArray(value)?value:object?.historical??[]) as Record<string,unknown>[];return rows.map(point=>({date:String(point.date??''),open:numberOrNull(point.open),high:numberOrNull(point.high),low:numberOrNull(point.low),close:numberOrNull(point.close)??0,adjustedClose:numberOrNull(point.adjClose??point.adjustedClose),volume:numberOrNull(point.volume)})).filter(point=>/^\d{4}-\d{2}-\d{2}$/.test(point.date)&&point.close>0).sort((a,b)=>a.date.localeCompare(b.date))}
const validSymbol=(value:string)=>/^[A-Z][A-Z0-9.-]{0,9}$/.test(value)
const freshFundamentals=(payload:StoredPayload|null)=>{const value=payload?.fundamentalsUpdatedAt??payload?.updatedAt;if(!value||!payload?.fundamentals)return false;return Date.now()-Date.parse(value)<7*86_400_000}

async function loadStored(db:D1Database,symbol:string){const row=await db.prepare('SELECT payload, market_date, updated_at, refresh_cycle FROM market_snapshots WHERE symbol = ?1').bind(symbol).first<SnapshotRow>();if(!row)return {row:null,payload:null};try{return{row,payload:JSON.parse(row.payload) as StoredPayload}}catch{return{row,payload:null}}}
async function saveStored(db:D1Database,symbol:string,payload:StoredPayload,marketDate:string|null){await db.prepare(`INSERT INTO market_snapshots (symbol,payload,market_date,updated_at,refresh_cycle) VALUES (?1,?2,?3,?4,?5) ON CONFLICT(symbol) DO UPDATE SET payload=excluded.payload,market_date=excluded.market_date,updated_at=excluded.updated_at,refresh_cycle=excluded.refresh_cycle`).bind(symbol,JSON.stringify(payload),marketDate,payload.updatedAt,payload.refreshCycle).run()}

async function refreshSymbol(symbol:string,stored:StoredPayload|null,gf:GoogleFinanceRecord|undefined,bindings:MarketBindings):Promise<StoredPayload|null>{
  const mapping=symbolMaster[symbol]
  const fmpSymbol=mapping?.fmpSymbol
  const apiKey=bindings.FMP_API_KEY??''
  const needFundamentals=!freshFundamentals(stored)
  const needQuoteFallback=!gf?.quote
  const needHistoryFallback=!gf?.historicalPrices.length&&!stored?.historicalPrices.length
  let quoteRaw:Record<string,unknown>|null=null,profileRaw:Record<string,unknown>|null=null,fmpHistory:PricePoint[]=[]
  if(apiKey&&fmpSymbol&&(needFundamentals||needQuoteFallback)){
    const [quoteResult,profileResult]=await Promise.allSettled([fmp(`/quote?symbol=${encodeURIComponent(fmpSymbol)}`,apiKey),needFundamentals?fmp(`/profile?symbol=${encodeURIComponent(fmpSymbol)}`,apiKey):Promise.resolve([])])
    quoteRaw=quoteResult.status==='fulfilled'?first(quoteResult.value) as Record<string,unknown>|null:null
    profileRaw=profileResult.status==='fulfilled'?first(profileResult.value) as Record<string,unknown>|null:null
  }
  if(apiKey&&fmpSymbol&&needHistoryFallback){try{fmpHistory=normalizeHistory(await fmp(`/historical-price-eod/full?symbol=${encodeURIComponent(fmpSymbol)}`,apiKey))}catch{fmpHistory=[]}}
  const gfHistory=gf?.historicalPrices.map(point=>({date:point.date,open:null,high:null,low:null,close:point.close,adjustedClose:point.adjustedClose??point.close,volume:null}))??[]
  const historicalPrices=gfHistory.length?gfHistory:(stored?.historicalPrices.length?stored.historicalPrices:fmpHistory)
  const quote=gf?.quote??(quoteRaw?{ticker:symbol,price:numberOrNull(quoteRaw.price),previousClose:numberOrNull(quoteRaw.previousClose),changePercent:numberOrNull(quoteRaw.changesPercentage)!==null?numberOrNull(quoteRaw.changesPercentage)!/100:null,marketDate:historicalPrices.at(-1)?.date??null}:stored?.quote??null)
  const oldFundamentals=stored?.fundamentals??null,gfFundamentals=gf?.fundamentals??null
  const fallbackFundamentals={ticker:symbol,companyName:oldFundamentals?.companyName??gfFundamentals?.companyName??null,sector:oldFundamentals?.sector??gfFundamentals?.sector??null,marketCap:numberOrNull(oldFundamentals?.marketCap)??numberOrNull(gfFundamentals?.marketCap),pe:numberOrNull(oldFundamentals?.pe)??numberOrNull(gfFundamentals?.pe),eps:numberOrNull(oldFundamentals?.eps)??numberOrNull(gfFundamentals?.eps)}
  const fundamentals=quoteRaw||profileRaw?{ticker:symbol,companyName:profileRaw?.companyName??quoteRaw?.name??fallbackFundamentals.companyName,sector:profileRaw?.sector??fallbackFundamentals.sector,marketCap:numberOrNull(quoteRaw?.marketCap??profileRaw?.mktCap)??fallbackFundamentals.marketCap,pe:numberOrNull(quoteRaw?.pe)??fallbackFundamentals.pe,eps:numberOrNull(quoteRaw?.eps)??fallbackFundamentals.eps}:fallbackFundamentals
  if(!quote&&!fundamentals&&!historicalPrices.length)return stored
  const historySource:StockDataSources['history']=gfHistory.length?'googlefinance':fmpHistory.length?'fmp':stored?.sources?.history??'stored'
  const priceSource:StockDataSources['price']=gf?.quote?'googlefinance':quoteRaw?'fmp':stored?.sources?.price??'stored'
  const fundamentalSource=(field:'marketCap'|'pe'|'eps'|'sector'|'company'):StockDataSources[typeof field]=>{const key=field==='company'?'companyName':field;const hasFresh=field==='company'?Boolean(profileRaw?.companyName??quoteRaw?.name):field==='sector'?Boolean(profileRaw?.sector):numberOrNull(quoteRaw?.[key]??(field==='marketCap'?profileRaw?.mktCap:null))!==null;if(hasFresh)return'fmp';if(oldFundamentals?.[key]!==null&&oldFundamentals?.[key]!==undefined)return stored?.sources?.[field]??'stored';if(gfFundamentals?.[key]!==null&&gfFundamentals?.[key]!==undefined)return'googlefinance';return'reference'}
  const updatedAt=new Date().toISOString()
  return {quote,fundamentals,historicalPrices,historyComplete:false,updatedAt,refreshCycle:refreshCycle(),fundamentalsUpdatedAt:quoteRaw||profileRaw?updatedAt:stored?.fundamentalsUpdatedAt??stored?.updatedAt??null,sources:{price:priceSource,history:historySource,high52:gf?.high52!==null&&gf?.high52!==undefined?'googlefinance':historySource,low52:gf?.low52!==null&&gf?.low52!==undefined?'googlefinance':historySource,marketCap:fundamentalSource('marketCap'),pe:fundamentalSource('pe'),eps:fundamentalSource('eps'),sector:fundamentalSource('sector'),company:fundamentalSource('company')},providerMetrics:{high52:gf?.high52??null,low52:gf?.low52??null}}
}

export async function handleMarketData(request:Request,db:D1Database,bindings:MarketBindings={}):Promise<Response>{
  const url=new URL(request.url)
  if(url.searchParams.get('status')==='1'){
    await db.prepare(marketSnapshotsSchema).run()
    const cached=await db.prepare(`SELECT COUNT(*) AS count FROM market_snapshots WHERE payload LIKE '%googlefinance%'`).first<{count:number}>()
    return Response.json({fmpConfigured:Boolean(bindings.FMP_API_KEY),googleSheetsConfigured:Boolean(bindings.GOOGLE_SHEETS_ID&&bindings.GOOGLE_SHEETS_API_KEY),googleSheetsCached:Number(cached?.count??0),durableStorage:true})
  }
  const symbolsParam=url.searchParams.get('symbols')
  const symbols=(symbolsParam?symbolsParam.split(','):[url.searchParams.get('symbol')??'']).map(value=>value.trim().toUpperCase()).filter(Boolean)
  if(!symbols.length||symbols.length>20||symbols.some(symbol=>!validSymbol(symbol)))return response({error:'Invalid symbols'},'INVALID',400)
  await db.prepare(marketSnapshotsSchema).run()
  const storedEntries=await Promise.all(symbols.map(async symbol=>[symbol,await loadStored(db,symbol)] as const))
  const force=request.headers.get('x-refresh-market-data')==='1'
  if(!force){const payloads=Object.fromEntries(storedEntries.filter(([,entry])=>entry.payload).map(([symbol,entry])=>[symbol,{...entry.payload,stale:false}]));if(symbolsParam)return Object.keys(payloads).length?response({payloads},'D1-HIT'):response({error:'No stored snapshot'},'D1-MISS',503);const payload=payloads[symbols[0]];return payload?response(payload,'D1-HIT'):response({error:'No stored snapshot'},'D1-MISS',503)}
  let googleRecords:Record<string,GoogleFinanceRecord>={}
  if(bindings.GOOGLE_SHEETS_ID&&bindings.GOOGLE_SHEETS_API_KEY){try{googleRecords=await loadGoogleFinanceSheet({spreadsheetId:bindings.GOOGLE_SHEETS_ID,apiKey:bindings.GOOGLE_SHEETS_API_KEY,masterRange:bindings.GOOGLE_SHEETS_MASTER_RANGE??'STOCK_MASTER!A3:P13',historyRange:bindings.GOOGLE_SHEETS_HISTORY_RANGE??'PER_TICKER'})}catch{googleRecords={}}}
  const payloads:Record<string,StoredPayload>={}
  for(let index=0;index<storedEntries.length;index+=5){await Promise.all(storedEntries.slice(index,index+5).map(async([symbol,entry])=>{const refreshed=await refreshSymbol(symbol,entry.payload,googleRecords[symbol],bindings);if(refreshed){const marketDate=typeof refreshed.quote?.marketDate==='string'?refreshed.quote.marketDate:refreshed.historicalPrices.at(-1)?.date??entry.row?.market_date??null;await saveStored(db,symbol,refreshed,marketDate);payloads[symbol]=refreshed}else if(entry.payload)payloads[symbol]={...entry.payload,stale:true}}))}
  if(symbolsParam)return Object.keys(payloads).length?response({payloads},'HYBRID-REFRESH'):response({error:'Providers unavailable'},'PROVIDER-FAIL',502)
  const payload=payloads[symbols[0]];return payload?response(payload,'HYBRID-REFRESH'):response({error:'Providers unavailable'},'PROVIDER-FAIL',502)
}
