export type SymbolMapping = {
  appTicker: string
  exchange: string | null
  googleFinanceSymbol: string | null
  fmpSymbol: string | null
}

export const symbolMaster: Record<string, SymbolMapping> = Object.fromEntries([
  ['NVDA','NASDAQ','NASDAQ:NVDA','NVDA'],
  ['AAPL','NASDAQ','NASDAQ:AAPL','AAPL'],
  ['GOOG','NASDAQ','NASDAQ:GOOG','GOOG'],
  ['MSFT','NASDAQ','NASDAQ:MSFT','MSFT'],
  ['AMZN','NASDAQ','NASDAQ:AMZN','AMZN'],
  ['AVGO','NASDAQ','NASDAQ:AVGO','AVGO'],
  // SpaceX is privately held. GoogleFinance and FMP do not expose it as a listed security.
  ['SPCX',null,null,null],
  ['META','NASDAQ','NASDAQ:META','META'],
  ['TSLA','NASDAQ','NASDAQ:TSLA','TSLA'],
  ['BRK-B','NYSE','NYSE:BRK.B','BRK-B'],
].map(([appTicker,exchange,googleFinanceSymbol,fmpSymbol]) => [appTicker,{appTicker,exchange,googleFinanceSymbol,fmpSymbol}]))

