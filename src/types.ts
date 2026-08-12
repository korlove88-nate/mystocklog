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
export interface StockSnapshot {
  ticker: string; company: string; sector: string | null; marketCap: MetricValue; pe: MetricValue; eps: MetricValue;
  price: MetricValue; changePercent: MetricValue; ath: MetricValue; high52: MetricValue; drawdown52: MetricValue;
  low52: MetricValue; atl: MetricValue; mdd: Record<number, MetricValue>; yearOpen: MetricValue; ytdReturn: MetricValue;
  return1m: MetricValue; return3m: MetricValue; return6m: MetricValue; return1y: MetricValue; return3y: MetricValue; return5y: MetricValue;
  ma20: MetricValue; ma60: MetricValue; ma120: MetricValue; ma200: MetricValue;
  historyComplete: boolean; priceHistory: HistoricalPrice[]; dataSource?: 'fmp' | 'reference';
}
