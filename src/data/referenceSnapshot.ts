import type { StockSnapshot } from '../types'

// Default universe: the 10 largest publicly traded U.S. companies by market cap.
// Ranking reference: CompaniesMarketCap, checked 2026-08-12. FMP replaces these
// reference values when connected. Missing fields are deliberately left null.
// Missing fields are intentionally null. They must never be presented as live market data.
const raw = [
  ['NVDA','NVIDIA','반도체',5349000000000,null,null,220.88,1.38,null,null,null,null,null],
  ['AAPL','Apple','하드웨어 & 장비',4474000000000,null,null,306.62,2.06,null,null,null,null,null],
  ['GOOG','Alphabet','인터넷 서비스',4328000000000,null,null,353.96,.14,null,null,null,null,null],
  ['MSFT','Microsoft','소프트웨어 & 클라우드',3789000000000,null,null,510.27,2.06,null,null,null,null,null],
  ['AMZN','Amazon','이커머스 & 클라우드',2997000000000,null,null,277.88,1.24,null,null,null,null,null],
  ['AVGO','Broadcom','반도체',2042000000000,null,null,429.35,.37,null,null,null,null,null],
  ['SPCX','SpaceX','우주항공',1793000000000,null,null,136.15,2.28,null,null,null,null,null],
  ['META','Meta Platforms','인터넷 서비스',1544000000000,null,null,606.16,2.37,null,null,null,null,null],
  ['TSLA','Tesla','전기차',1307000000000,null,null,331.05,.75,null,null,null,null,null],
  ['BRK-B','Berkshire Hathaway','복합금융',1150000000000,null,null,533.22,2.19,null,null,null,null,null],
] as const

export const referenceSnapshot: StockSnapshot[] = raw.map(([ticker,company,sector,marketCap,pe,eps,price,changePercent,high52,drawdown52,low52,yearOpen,ytdReturn]) => ({
  ticker, company, sector, marketCap, pe, eps, price, changePercent: changePercent / 100, high52, drawdown52, low52, yearOpen, ytdReturn,
  ath: null, atl: null, mdd: { 2024: null, 2025: null, 2026: null }, return1m: null, return3m: null, return6m: null, return1y: null, return3y: null, return5y: null,
  ma20: null, ma60: null, ma120: null, ma200: null, historyComplete: false, priceHistory: [],
}))
export const snapshotMeta = { mode: 'reference-snapshot', sourceDate: '2026-08-12', source: 'CompaniesMarketCap · 미국 기업 시가총액' } as const
