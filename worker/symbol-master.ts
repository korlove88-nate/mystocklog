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
  ['AMD','NASDAQ','NASDAQ:AMD','AMD'],
  ['MU','NASDAQ','NASDAQ:MU','MU'],
  ['TSM','NYSE','NYSE:TSM','TSM'],
  ['ASML','NASDAQ','NASDAQ:ASML','ASML'],
  ['UMAC','NYSEAMERICAN','NYSEAMERICAN:UMAC','UMAC'],
  ['RCAT','NASDAQ','NASDAQ:RCAT','RCAT'],
  ['ONDS','NASDAQ','NASDAQ:ONDS','ONDS'],
  ['RKLB','NASDAQ','NASDAQ:RKLB','RKLB'],
  ['JOBY','NYSE','NYSE:JOBY','JOBY'],
  ['LMT','NYSE','NYSE:LMT','LMT'],
  ['SMR','NYSE','NYSE:SMR','SMR'],
  ['OKLO','NYSE','NYSE:OKLO','OKLO'],
  ['DNN','NYSEAMERICAN','NYSEAMERICAN:DNN','DNN'],
  ['IONQ','NYSE','NYSE:IONQ','IONQ'],
  ['LAES','NASDAQ','NASDAQ:LAES','LAES'],
  ['RZLV','NASDAQ','NASDAQ:RZLV','RZLV'],
  ['RGTI','NASDAQ','NASDAQ:RGTI','RGTI'],
  ['QUBT','NASDAQ','NASDAQ:QUBT','QUBT'],
  ['QBTS','NYSE','NYSE:QBTS','QBTS'],
  ['PLTR','NASDAQ','NASDAQ:PLTR','PLTR'],
  ['AFRM','NASDAQ','NASDAQ:AFRM','AFRM'],
  ['O','NYSE','NYSE:O','O'],
].map(([appTicker,exchange,googleFinanceSymbol,fmpSymbol]) => [appTicker,{appTicker,exchange,googleFinanceSymbol,fmpSymbol}]))
