const base=process.env.SUPABASE_URL?.replace(/\/$/,'')??'',key=process.env.SUPABASE_SERVICE_ROLE_KEY??process.env.SUPABASE_SECRET_KEY??''
if(!base||!key)throw new Error('Supabase 환경변수가 필요합니다.')
const response=await fetch(`${base}/rest/v1/market_snapshots?symbol=eq.__DASHBOARD__&select=payload`,{headers:{apikey:key,Authorization:`Bearer ${key}`}})
if(!response.ok)throw new Error(`Supabase catalog HTTP ${response.status}`)
const dashboard=(await response.json())[0]?.payload,catalog=dashboard?.catalog
if(!catalog?.stocks?.length||!catalog?.groups?.length)throw new Error('Supabase 관심종목 카탈로그가 없습니다.')
const stocks=catalog.stocks.filter(stock=>stock.active&&stock.ticker!=='SPCX'),tickers=[...new Set(stocks.map(stock=>stock.ticker))]
if(tickers.length!==31)throw new Error(`SPCX 제외 관심종목 수가 예상과 다릅니다: ${tickers.length}`)
process.env.EXTERNAL_PHASE='5.2'
process.env.EXTERNAL_OUTPUT='phase5_2'
process.env.EXTERNAL_REFERENCE_TICKERS='AAPL,GOOG,MSFT,AMZN,AVGO,META'
process.env.EXTERNAL_TEST_TICKERS=tickers.join(',')
process.env.EXTERNAL_CATALOG_GROUPS=JSON.stringify(catalog.groups)
process.env.EXTERNAL_CATALOG_COMPANIES=JSON.stringify(Object.fromEntries(stocks.map(stock=>[stock.ticker,stock.company])))
await import('./phase5_0.mjs')
