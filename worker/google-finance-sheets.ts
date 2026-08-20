import type { HistoricalPrice, MarketCatalog, MarketOverviewItem, StockFundamentals, StockQuote } from '../src/types'

type SheetConfig = { spreadsheetId:string; apiKey:string; masterRange:string; historyRange:string; marketRange?:string }
type SheetRow = Record<string,string>
export type GoogleFinanceRecord = { quote:StockQuote|null; fundamentals:StockFundamentals|null; historicalPrices:HistoricalPrice[]; high52:number|null; low52:number|null; status:string|null; updatedAt:string|null }
export type GoogleFinanceWorkbook = { records:Record<string,GoogleFinanceRecord>; catalog:MarketCatalog; marketOverview:MarketOverviewItem[] }

const headerKey=(value:unknown)=>String(value).trim().toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'')
const numberOrNull=(value:unknown)=>{if(typeof value==='number'&&Number.isFinite(value))return value;if(typeof value!=='string'||!value.trim())return null;const raw=value.trim(),negative=/^\(.*\)$/.test(raw),suffix=raw.match(/([TBM])(?:\s*)$/i)?.[1]?.toUpperCase();const parsed=Number(raw.replace(/[()$,%xTBM]/gi,'').replaceAll(',','').trim());if(!Number.isFinite(parsed))return null;return(negative?-parsed:parsed)*(suffix==='T'?1e12:suffix==='B'?1e9:suffix==='M'?1e6:1)}
const percentOrNull=(value:unknown)=>{const parsed=numberOrNull(value);return parsed===null?null:typeof value==='string'&&value.includes('%')?parsed/100:Math.abs(parsed)>1?parsed/100:parsed}
const active=(value:unknown)=>!['N','NO','FALSE','0','OFF','INACTIVE'].includes(String(value??'Y').trim().toUpperCase())
const order=(value:unknown,fallback:number)=>numberOrNull(value)??fallback
export const parseGoogleSheetDate=(value:unknown)=>{const text=String(value??'').trim();if(/^\d{4}-\d{2}-\d{2}$/.test(text))return text;const serial=Number(text);if(!Number.isFinite(serial)||serial<1)return'';return new Date(Date.UTC(1899,11,30)+Math.floor(serial)*86_400_000).toISOString().slice(0,10)}
const table=(values:unknown,expected:string[]=[]):SheetRow[]=>{if(!Array.isArray(values)||!Array.isArray(values[0]))return[];const rows=values as unknown[][],headerIndex=expected.length?rows.findIndex(row=>row.map(headerKey).some(header=>expected.includes(header))):0;if(headerIndex<0)return[];const headers=rows[headerIndex].map(headerKey);return rows.slice(headerIndex+1).map(row=>Object.fromEntries(headers.map((header,index)=>[header,String(row[index]??'').trim()]))) }
const endpoint=(config:SheetConfig,path:string)=>`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(config.spreadsheetId)}/${path}${path.includes('?')?'&':'?'}key=${encodeURIComponent(config.apiKey)}`
async function batchRanges(config:SheetConfig,ranges:string[]){const query=ranges.map(range=>`ranges=${encodeURIComponent(range)}`).join('&');const result=await fetch(endpoint(config,`values:batchGet?majorDimension=ROWS&${query}`),{signal:AbortSignal.timeout(20_000)});if(!result.ok)throw new Error(`Google Sheets ${result.status}`);const body=await result.json() as {valueRanges?:Array<{values?:unknown}>};return body.valueRanges??[]}
async function safeRange(config:SheetConfig,range:string):Promise<unknown>{try{return(await batchRanges(config,[range]))[0]?.values}catch{return undefined}}
const tickerOf=(row:SheetRow)=>(row.ticker||row.app_ticker||row.symbol||row.googlefinance_symbol||row.gf_symbol||'').trim().toUpperCase()
const marketAliases:Record<MarketOverviewItem['key'],string[]>={sp500:['SP500','S&P500','S_P500','.INX','^GSPC','INDEXSP:.INX'],nasdaq:['NASDAQ','.IXIC','^IXIC','INDEXNASDAQ:.IXIC'],dow:['DOW','DJI','.DJI','^DJI','INDEXDJX:.DJI'],vix:['VIX','^VIX','CBOE:VIX','INDEXCBOE:VIX'],us10y:['US10Y','TNX','^TNX','INDEXCBOE:TNX']}
const labels:Record<MarketOverviewItem['key'],string>={sp500:'S&P500',nasdaq:'NASDAQ',dow:'DOW',vix:'VIX',us10y:'US10Y'}
const marketKey=(row:SheetRow)=>(row.key||row.market_key||row.ticker||row.item||row.index||row.name||row.label||row.symbol||'').trim().toUpperCase()
export function marketOverviewFromValues(values:unknown):MarketOverviewItem[]{
  const rows=table(values,['key','market_key','ticker','item','index','name','label','symbol'])
  return(Object.keys(marketAliases) as MarketOverviewItem['key'][]).map(key=>{
    const row=rows.find(candidate=>marketAliases[key].includes(marketKey(candidate)))
    const displayValue=numberOrNull(row?.display_value)
    const value=displayValue??numberOrNull(row?.current_value||row?.value||row?.price||row?.raw_price)
    const directBp=numberOrNull(row?.change_bp||row?.bp_change)
    const displayChange=percentOrNull(row?.display_change)
    const rawChange=percentOrNull(row?.change_percent||row?.change_pct||row?.change)
    return{key,label:labels[key],value,change:key==='us10y'?(directBp??(displayChange!==null?displayChange*10_000:null)):rawChange,changeUnit:key==='us10y'?'bp':'percent',source:'googlefinance'}
  })
}

export async function loadGoogleFinanceWorkbook(config:SheetConfig):Promise<GoogleFinanceWorkbook>{
  const [stockValues,groupValues,membershipValues,masterValues,marketValues]=await Promise.all([
    safeRange(config,'STOCKS!A1:Z1000'),safeRange(config,'GROUPS!A1:Z200'),safeRange(config,'GROUP_MEMBERSHIP!A1:Z2000'),
    safeRange(config,config.masterRange||'STOCK_MASTER!A1:Z1000'),safeRange(config,config.marketRange||'MARKET_OVERVIEW!A1:J30'),
  ])
  const stockRows=table(stockValues,['ticker','app_ticker','symbol']),groupRows=table(groupValues,['group_id','group_code','group','group_name']),membershipRows=table(membershipValues,['ticker','app_ticker','symbol']),masterRows=table(masterValues,['ticker','app_ticker','symbol'])
  const stocks=stockRows.filter(row=>tickerOf(row)&&active(row.active)).map((row,index)=>({ticker:tickerOf(row),company:row.company||row.company_name||tickerOf(row),sector:row.sector||null,active:true,sortOrder:order(row.sort_order,index+1)})).sort((a,b)=>a.sortOrder-b.sortOrder)
  const activeTickers=new Set(stocks.map(stock=>stock.ticker))
  const memberships=membershipRows.filter(row=>active(row.active)&&activeTickers.has(tickerOf(row)))
  const groups=groupRows.filter(row=>active(row.active)).map((row,index)=>{const id=(row.group_id||row.group_code||row.id||row.group||`group-${index+1}`).trim();return{id,name:row.group_name||row.name||row.label||id,sortOrder:order(row.sort_order,index+1),tickers:memberships.filter(member=>(member.group_id||member.group_code||member.group||member.group_name)===id||(member.group_name&&member.group_name===(row.group_name||row.name))).sort((a,b)=>order(a.sort_order,0)-order(b.sort_order,0)).map(tickerOf)}}).filter(group=>group.tickers.length).sort((a,b)=>a.sortOrder-b.sortOrder)
  const masterByTicker=new Map(masterRows.map(row=>[tickerOf(row),row]))
  const records:Record<string,GoogleFinanceRecord>={}
  stocks.forEach(stock=>{const row=masterByTicker.get(stock.ticker)??{};records[stock.ticker]={quote:null,fundamentals:{ticker:stock.ticker,companyName:stock.company,sector:stock.sector,marketCap:numberOrNull(row.gf_market_cap||row.market_cap),pe:numberOrNull(row.gf_per||row.per||row.pe),eps:numberOrNull(row.gf_eps||row.eps)},historicalPrices:[],high52:null,low52:null,status:row.status||null,updatedAt:row.updated_at||row.trade_time||null}})
  const marketOverview=marketOverviewFromValues(marketValues)
  return{records,catalog:{stocks,groups},marketOverview}
}

export async function loadGoogleFinanceSheet(config:SheetConfig):Promise<Record<string,GoogleFinanceRecord>>{return(await loadGoogleFinanceWorkbook(config)).records}
