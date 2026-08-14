import type { HistoricalPrice, StockFundamentals, StockQuote } from '../src/types'

type SheetConfig = { spreadsheetId: string; apiKey: string; masterRange: string; historyRange: string }
type SheetRow = Record<string,string>
export type GoogleFinanceRecord = { quote:StockQuote|null; fundamentals:StockFundamentals|null; historicalPrices:HistoricalPrice[]; high52:number|null; low52:number|null; status:string|null; updatedAt:string|null }

const headerKey=(value:unknown)=>String(value).trim().toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'')
const numberOrNull=(value:unknown)=>{
  if(typeof value==='number'&&Number.isFinite(value))return value
  if(typeof value!=='string'||!value.trim())return null
  const raw=value.trim(),negative=/^\(.*\)$/.test(raw),suffix=raw.match(/([TBM])(?:\s*)$/i)?.[1]?.toUpperCase()
  const parsed=Number(raw.replace(/[()$,%xTBM]/gi,'').trim())
  if(!Number.isFinite(parsed))return null
  const multiplier=suffix==='T'?1e12:suffix==='B'?1e9:suffix==='M'?1e6:1
  return (negative?-parsed:parsed)*multiplier
}
const percentOrNull=(value:unknown)=>{const parsed=numberOrNull(value);return parsed===null?null:typeof value==='string'&&value.includes('%')?parsed/100:Math.abs(parsed)>1?parsed/100:parsed}
export const parseGoogleSheetDate=(value:unknown)=>{const text=String(value??'').trim();if(/^\d{4}-\d{2}-\d{2}$/.test(text))return text;const serial=Number(text);if(!Number.isFinite(serial)||serial<1)return'';return new Date(Date.UTC(1899,11,30)+Math.floor(serial)*86_400_000).toISOString().slice(0,10)}
const table=(values:unknown):SheetRow[]=>{if(!Array.isArray(values)||!Array.isArray(values[0]))return[];const rows=values as unknown[][],headers=rows[0].map(headerKey);return rows.slice(1).map(row=>Object.fromEntries(headers.map((header,index)=>[header,String(row[index]??'').trim()]))) }
const endpoint=(config:SheetConfig,path:string)=>`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(config.spreadsheetId)}/${path}${path.includes('?')?'&':'?'}key=${encodeURIComponent(config.apiKey)}`
async function readRange(config:SheetConfig,range:string){const result=await fetch(endpoint(config,`values/${encodeURIComponent(range)}?majorDimension=ROWS`),{signal:AbortSignal.timeout(12_000)});if(!result.ok)throw new Error(`Google Sheets ${result.status}`);const body=await result.json() as {values?:unknown};return table(body.values)}
async function readHistoryRanges(config:SheetConfig,ranges:string[]){if(!ranges.length)return[];const query=ranges.map(range=>`ranges=${encodeURIComponent(range)}`).join('&');const result=await fetch(endpoint(config,`values:batchGet?majorDimension=ROWS&${query}`),{signal:AbortSignal.timeout(20_000)});if(!result.ok)throw new Error(`Google Sheets ${result.status}`);const body=await result.json() as {valueRanges?:Array<{values?:unknown}>};return body.valueRanges??[]}

export async function loadGoogleFinanceSheet(config:SheetConfig):Promise<Record<string,GoogleFinanceRecord>>{
  const masterRows=await readRange(config,config.masterRange)
  const entries=masterRows.map(row=>({row,ticker:(row.ticker||row.app_ticker)?.toUpperCase(),historySheet:row.history_sheet})).filter(entry=>entry.ticker)
  const perTicker=entries.some(entry=>entry.historySheet)
  const historyRanges=perTicker?entries.map(entry=>`${entry.historySheet}!A6:B1200`):[config.historyRange]
  const historyResults=await readHistoryRanges(config,historyRanges)
  const histories=new Map<string,HistoricalPrice[]>()
  if(perTicker){entries.forEach((entry,index)=>{const values=historyResults[index]?.values;if(!Array.isArray(values))return;const points=(values as unknown[][]).map(row=>({date:parseGoogleSheetDate(row[0]),close:numberOrNull(row[1])})).filter((point):point is {date:string;close:number}=>/^\d{4}-\d{2}-\d{2}$/.test(point.date)&&point.close!==null&&point.close>0).map(point=>({date:point.date,close:point.close,adjustedClose:point.close}));histories.set(entry.ticker,points.sort((a,b)=>a.date.localeCompare(b.date)))})
  }else{const rows=table(historyResults[0]?.values);for(const row of rows){const ticker=row.ticker?.toUpperCase(),close=numberOrNull(row.close);if(!ticker||!/^\d{4}-\d{2}-\d{2}$/.test(row.date??'')||close===null||close<=0)continue;const list=histories.get(ticker)??[];list.push({date:row.date,close,adjustedClose:close});histories.set(ticker,list)}}
  const output:Record<string,GoogleFinanceRecord>={}
  for(const {row,ticker} of entries){const price=numberOrNull(row.current_price||row.price),history=(histories.get(ticker)??[]).sort((a,b)=>a.date.localeCompare(b.date)),marketDate=(row.market_date||row.trade_time||history.at(-1)?.date||'').slice(0,10)||null;const marketCap=numberOrNull(row.gf_market_cap),pe=numberOrNull(row.gf_per),eps=numberOrNull(row.gf_eps);output[ticker]={quote:price===null?null:{ticker,price,previousClose:null,changePercent:percentOrNull(row.change_percent||row.change_pct||row.change),marketDate},fundamentals:{ticker,companyName:row.company||null,sector:null,marketCap,pe,eps},historicalPrices:history,high52:numberOrNull(row.high_52w||row['52w_high']||row.high52),low52:numberOrNull(row.low_52w||row['52w_low']||row.low52),status:row.status||null,updatedAt:row.updated_at||row.trade_time||null}}
  return output
}
