import type { StockSnapshot } from '../types'

// Last-known values recovered from the successful FMP-backed browser session at
// 2026-08-14 15:42 KST (market close 2026-08-13). This bundled snapshot is only
// used when no durable server snapshot exists. Fields that were not successfully
// received in that session remain null and must be rendered as an em dash.
const raw = [
  ['NVDA','NVIDIA Corporation','Technology',5460000000000,null,null,225.30,.54,236.54,-4.75,164.07,188.85,19.30,[-27.05,-36.89,-19.40]],
  ['AAPL','Apple Inc.','Technology',4480000000000,null,null,305.26,1.00,344.57,-11.41,223.78,271.01,12.64,[-15.46,-30.22,-12.71]],
  ['MSFT','Microsoft Corporation','Technology',3690000000000,null,null,496.88,.90,553.72,-10.27,349.20,472.94,5.06,[-15.49,-20.72,-27.02]],
  ['AMZN','Amazon.com, Inc.','Consumer Cyclical',2850000000000,null,null,265.13,-.80,287.20,-7.68,196.00,226.50,17.06,[-19.49,-30.88,-19.64]],
  ['META','Meta Platforms, Inc.','Communication Services',1520000000000,null,null,594.97,2.78,796.25,-25.28,520.26,650.41,-8.52,[-18.43,-34.21,-28.79]],
  ['TSLA','Tesla, Inc.','Consumer Cyclical',1340000000000,null,null,339.96,3.80,498.83,-31.85,297.38,438.07,-22.40,[-42.82,-48.19,-33.95]],
  ['GOOG','Alphabet Inc.','Communication Services',null,null,null,null,null,null,null,null,null,null,null],
  ['AVGO','Broadcom Inc.','Technology',null,null,null,null,null,null,null,null,null,null,null],
  ['SPCX','Space Exploration Technologies Corp.','Industrials',null,null,null,null,null,null,null,null,null,null,null],
  ['BRK-B','Berkshire Hathaway Inc.','Financial Services',null,null,null,null,null,null,null,null,null,null,null],
] as const

export const referenceSnapshot: StockSnapshot[] = raw.map(([ticker,company,sector,marketCap,pe,eps,price,changePercent,high52,drawdown52,low52,yearOpen,ytdReturn,mdd]) => ({
  ticker, company, sector, marketCap, pe, eps, price, changePercent: changePercent === null ? null : changePercent / 100, high52, drawdown52: drawdown52 === null ? null : drawdown52 / 100, low52, yearOpen, ytdReturn: ytdReturn === null ? null : ytdReturn / 100,
  ath: null, atl: null, mdd: { 2024: mdd ? mdd[0] / 100 : null, 2025: mdd ? mdd[1] / 100 : null, 2026: mdd ? mdd[2] / 100 : null }, return1m: null, return3m: null, return6m: null, return1y: null, return3y: null, return5y: null,
  ma20: null, ma60: null, ma120: null, ma200: null, historyComplete: false, priceHistory: [], dataSource: 'reference',
}))
export const snapshotMeta = { mode: 'recovered-snapshot', sourceDate: '2026-08-14T06:42:00.000Z', source: 'FMP 마지막 성공값 · 종가 2026-08-13' } as const
