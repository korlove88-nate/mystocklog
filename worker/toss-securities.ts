import type { HistoricalPrice, StockQuote } from '../src/types'

const BASE_URL = 'https://openapi.tossinvest.com'
const TIMEOUT_MS = 15_000
const MAX_CANDLE_PAGES = 7

export type TossCredentials = { clientId:string; clientSecret:string }
export class TossApiError extends Error {
  constructor(readonly status:number,readonly code:string|null,readonly apiMessage:string|null){super(`TOSS HTTP ${status}`)}
}
type Token = { value:string; expiresAt:number }
type PriceResult = { symbol:string; timestamp:string|null; lastPrice:string }
type CandleResult = { timestamp:string; openPrice:string; highPrice:string; lowPrice:string; closePrice:string; volume:string }
type CandlePage = { result?:{ candles?:CandleResult[]; nextBefore?:string|null } }

let cachedToken:Token|null=null
const finite=(value:unknown)=>{const parsed=typeof value==='number'?value:Number(value);return Number.isFinite(parsed)?parsed:null}
const marketDate=(timestamp:string|null|undefined)=>timestamp&&/^\d{4}-\d{2}-\d{2}/.test(timestamp)?timestamp.slice(0,10):null
const safeText=(value:unknown)=>typeof value==='string'?value.slice(0,300).replace(/(?:tsck_live_|tssk_live_)[A-Za-z0-9_-]+/g,'[redacted]').replace(/(client_(?:id|secret)|access_token)=[^\s&]+/gi,'$1=[redacted]').replace(/Bearer\s+[A-Za-z0-9._-]+/gi,'Bearer [redacted]'):null
const tossError=async(result:Response)=>{let payload:Record<string,unknown>|null=null;try{payload=await result.json() as Record<string,unknown>}catch{}const nested=payload?.error&&typeof payload.error==='object'?payload.error as Record<string,unknown>:null;return new TossApiError(result.status,safeText(payload?.code??payload?.errorCode??nested?.code),safeText(payload?.message??payload?.errorMessage??nested?.message))}

async function accessToken(credentials:TossCredentials):Promise<string>{
  if(cachedToken&&cachedToken.expiresAt>Date.now()+60_000)return cachedToken.value
  const body=new URLSearchParams({grant_type:'client_credentials',client_id:credentials.clientId,client_secret:credentials.clientSecret})
  const result=await fetch(`${BASE_URL}/oauth2/token`,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body,signal:AbortSignal.timeout(TIMEOUT_MS)})
  if(!result.ok)throw await tossError(result)
  const payload=await result.json() as {access_token?:string;expires_in?:number}
  if(!payload.access_token)throw new Error('Toss auth response has no access token')
  cachedToken={value:payload.access_token,expiresAt:Date.now()+Math.max(60,Number(payload.expires_in??3600))*1000}
  return cachedToken.value
}

async function get<T>(path:string,token:string):Promise<T>{
  const result=await fetch(`${BASE_URL}${path}`,{headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(TIMEOUT_MS)})
  if(!result.ok)throw await tossError(result)
  return result.json() as Promise<T>
}

export async function loadTossPrices(symbols:string[],credentials:TossCredentials):Promise<Record<string,StockQuote>>{
  if(!symbols.length)return{}
  const token=await accessToken(credentials)
  const payload=await get<{result?:PriceResult[]}>(`/api/v1/prices?symbols=${encodeURIComponent(symbols.join(','))}`,token)
  return Object.fromEntries((payload.result??[]).flatMap(item=>{
    const price=finite(item.lastPrice)
    return price===null?[]:[[item.symbol.toUpperCase(),{ticker:item.symbol.toUpperCase(),price,previousClose:null,changePercent:null,marketDate:marketDate(item.timestamp)}]]
  }))
}

export async function loadTossDailyPrices(symbol:string,credentials:TossCredentials,maxPages=MAX_CANDLE_PAGES,countPerPage=200):Promise<HistoricalPrice[]>{
  const token=await accessToken(credentials)
  const points:HistoricalPrice[]=[]
  let before:string|null=null
  for(let page=0;page<Math.max(1,Math.min(MAX_CANDLE_PAGES,maxPages));page+=1){
    const query=new URLSearchParams({symbol,interval:'1d',count:String(Math.max(1,Math.min(200,countPerPage))),adjusted:'true'})
    if(before)query.set('before',before)
    const payload=await get<CandlePage>(`/api/v1/candles?${query}`,token)
    for(const candle of payload.result?.candles??[]){
      const open=finite(candle.openPrice),high=finite(candle.highPrice),low=finite(candle.lowPrice),close=finite(candle.closePrice),volume=finite(candle.volume),date=marketDate(candle.timestamp)
      if(date&&open!==null&&high!==null&&low!==null&&close!==null&&close>0)points.push({date,open,high,low,close,adjustedClose:close,volume})
    }
    const next=payload.result?.nextBefore??null
    if(!next||next===before)break
    before=next
  }
  return [...new Map(points.map(point=>[point.date,point])).values()].sort((a,b)=>a.date.localeCompare(b.date))
}

export function resetTossTokenForTest(){cachedToken=null}
