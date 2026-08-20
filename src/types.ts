export type MetricValue = number | null
export type HistoricalPrice = {
  date: string
  open?: number | null
  high?: number | null
  low?: number | null
  close: number
  adjustedClose?: number | null
  volume?: number | null
}
export type StockQuote = {
  ticker: string
  price: MetricValue
  previousClose: MetricValue
  changePercent: MetricValue
  marketDate: string | null
}
export type StockFundamentals = {
  ticker: string
  companyName?: string | null
  sector?: string | null
  marketCap?: MetricValue
  pe?: MetricValue
  eps?: MetricValue
}
export type MarketFieldSource = 'toss' | 'googlefinance' | 'app_calculated' | 'reference'
export type StorageSource = 'd1' | 'supabase'
export type StockMasterEntry = { ticker:string; company:string; sector:string|null; active:boolean; sortOrder:number }
export type StockGroup = { id:string; name:string; sortOrder:number; tickers:string[] }
export type MarketOverviewItem = { key:'sp500'|'nasdaq'|'dow'|'vix'|'us10y'|'usdkrw'; label:string; value:MetricValue; change:MetricValue; changeUnit:'percent'|'bp'; source:'googlefinance'|'stored' }
export type MarketCatalog = { stocks:StockMasterEntry[]; groups:StockGroup[] }
export type StockDataSources = {
  price: MarketFieldSource
  history: MarketFieldSource
  high52: MarketFieldSource
  low52: MarketFieldSource
  mdd: MarketFieldSource
  ma: MarketFieldSource
  priceStability: MarketFieldSource
  marketCap: MarketFieldSource
  pe: MarketFieldSource
  eps: MarketFieldSource
  sector: MarketFieldSource
  company: MarketFieldSource
}
export interface StockSnapshot {
  ticker: string; company: string; sector: string | null; marketCap: MetricValue; pe: MetricValue; eps: MetricValue;
  price: MetricValue; changePercent: MetricValue; ath: MetricValue; high52: MetricValue; drawdown52: MetricValue;
  low52: MetricValue; atl: MetricValue; mdd: Record<number, MetricValue>; yearOpen: MetricValue; ytdReturn: MetricValue;
  return1m: MetricValue; return3m: MetricValue; return6m: MetricValue; return1y: MetricValue; return3y: MetricValue; return5y: MetricValue;
  ma20: MetricValue; ma60: MetricValue; ma120: MetricValue; ma200: MetricValue;
  historyComplete: boolean; priceHistory: HistoricalPrice[]; dataSource?: 'toss' | 'reference';
  storageSource?: StorageSource;
  stale?: boolean;
  priceStability?: PriceStability | null;
  sources?: StockDataSources;
}
export type PriceStability = '하락 지속' | '관찰' | '안정 시도' | '안정'
