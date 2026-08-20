const STOCKS = [
  ['NVDA','NASDAQ','NASDAQ:NVDA'],['AAPL','NASDAQ','NASDAQ:AAPL'],['GOOG','NASDAQ','NASDAQ:GOOG'],
  ['MSFT','NASDAQ','NASDAQ:MSFT'],['AMZN','NASDAQ','NASDAQ:AMZN'],['AVGO','NASDAQ','NASDAQ:AVGO'],
  ['SPCX','',''],['META','NASDAQ','NASDAQ:META'],['TSLA','NASDAQ','NASDAQ:TSLA'],['BRK-B','NYSE','NYSE:BRK.B'],
];

function setupBridge() {
  const file = SpreadsheetApp.getActive();
  const master = file.getSheetByName('STOCK_MASTER') || file.insertSheet('STOCK_MASTER');
  master.clear();
  master.getRange(1,1,1,8).setValues([['ticker','exchange','googlefinance_symbol','gf_market_cap','gf_per','gf_eps','status','updated_at']]);
  master.getRange(2,1,STOCKS.length,3).setValues(STOCKS);
  STOCKS.forEach((stock,index) => {
    const row=index+2;
    if (!stock[2]) {
      master.getRange(row,7).setValue('UNSUPPORTED');
      return;
    }
    master.getRange(row,4).setFormula(`=IFERROR(GOOGLEFINANCE(C${row},"marketcap"),NA())`);
    master.getRange(row,5).setFormula(`=IFERROR(GOOGLEFINANCE(C${row},"pe"),NA())`);
    master.getRange(row,6).setFormula(`=IFERROR(GOOGLEFINANCE(C${row},"eps"),NA())`);
    master.getRange(row,7).setFormula(`=IF(COUNT(D${row}:F${row})=3,"OK","PARTIAL")`);
    master.getRange(row,8).setFormula('=NOW()');
  });
  SpreadsheetApp.flush();
}
