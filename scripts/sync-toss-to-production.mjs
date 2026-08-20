import { DatabaseSync } from 'node:sqlite'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const root='.wrangler/state/v3/d1/miniflare-D1DatabaseObject'
const databaseFile=existsSync(root)?readdirSync(root).find(name=>name.endsWith('.sqlite')&&name!=='metadata.sqlite'):null
if(!databaseFile)throw new Error('로컬 D1 데이터베이스를 찾을 수 없습니다. 먼저 로컬 TOSS 갱신을 실행하세요.')
if(!process.env.MARKET_SYNC_URL||!process.env.MARKET_SYNC_TOKEN)throw new Error('MARKET_SYNC_URL과 MARKET_SYNC_TOKEN이 필요합니다.')

const db=new DatabaseSync(join(root,databaseFile),{readOnly:true}),latest=db.prepare('SELECT ticker, MAX(market_date) AS market_date FROM daily_prices WHERE source = ? GROUP BY ticker').all('TOSS'),payloads={}
for(const row of latest){
  const prices=db.prepare('SELECT market_date AS date, open, high, low, close, volume FROM daily_prices WHERE ticker = ? AND source = ? ORDER BY market_date DESC LIMIT 1000').all(row.ticker,'TOSS').reverse()
  const point=prices.at(-1),previous=prices.at(-2);if(!point||[point.open,point.high,point.low,point.close,point.volume].some(value=>typeof value!=='number'))continue
  payloads[row.ticker]={quote:{ticker:row.ticker,price:point.close,previousClose:previous?.close??null,changePercent:previous?.close?point.close/previous.close-1:null,marketDate:point.date},historicalPrices:prices}
}
db.close()
const response=await fetch(process.env.MARKET_SYNC_URL,{method:'POST',headers:{Authorization:`Bearer ${process.env.MARKET_SYNC_TOKEN}`,'Content-Type':'application/json',...(process.env.SITES_BYPASS_TOKEN?{'OAI-Sites-Authorization':`Bearer ${process.env.SITES_BYPASS_TOKEN}`}:{})},body:JSON.stringify({payloads})})
const text=await response.text();if(!response.ok)throw new Error(`운영 동기화 실패 (${response.status}): ${text.slice(0,300)}`)
const result=JSON.parse(text);console.log(`TOSS 동기화 완료: ${result.imported}개 종목 · 시장일 ${result.marketDate}`)
