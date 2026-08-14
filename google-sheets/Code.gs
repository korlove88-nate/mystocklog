const STOCKS = [
  ['NVDA','NASDAQ','NASDAQ:NVDA'],['AAPL','NASDAQ','NASDAQ:AAPL'],['GOOG','NASDAQ','NASDAQ:GOOG'],
  ['MSFT','NASDAQ','NASDAQ:MSFT'],['AMZN','NASDAQ','NASDAQ:AMZN'],['AVGO','NASDAQ','NASDAQ:AVGO'],
  ['SPCX','',''],['META','NASDAQ','NASDAQ:META'],['TSLA','NASDAQ','NASDAQ:TSLA'],['BRK-B','NYSE','NYSE:BRK.B'],
];

function setupBridge() {
  const file = SpreadsheetApp.getActive();
  const master = file.getSheetByName('STOCK_MASTER') || file.insertSheet('STOCK_MASTER');
  master.clear();
  master.getRange(1,1,1,10).setValues([['ticker','exchange','googlefinance_symbol','current_price','change_percent','high_52w','low_52w','status','updated_at','market_date']]);
  master.getRange(2,1,STOCKS.length,3).setValues(STOCKS);
  STOCKS.forEach((stock,index) => {
    const row=index+2;
    if (!stock[2]) {
      master.getRange(row,8).setValue('UNSUPPORTED');
      return;
    }
    master.getRange(row,4).setFormula(`=IFERROR(GOOGLEFINANCE(C${row},"price"),NA())`);
    master.getRange(row,5).setFormula(`=IFERROR(GOOGLEFINANCE(C${row},"changepct")/100,NA())`);
    master.getRange(row,6).setFormula(`=IFERROR(GOOGLEFINANCE(C${row},"high52"),NA())`);
    master.getRange(row,7).setFormula(`=IFERROR(GOOGLEFINANCE(C${row},"low52"),NA())`);
    master.getRange(row,8).setFormula(`=IF(COUNT(D${row}:G${row})=4,"OK","PARTIAL")`);
    master.getRange(row,9).setFormula('=NOW()');
    master.getRange(row,10).setFormula(`=IFERROR(INDEX(GOOGLEFINANCE(C${row},"close",TODAY()-10,TODAY()),ROWS(GOOGLEFINANCE(C${row},"close",TODAY()-10,TODAY())),1),"")`);
    const helperName=`GF_${stock[0].replace('-','_')}`;
    const helper=file.getSheetByName(helperName)||file.insertSheet(helperName);
    helper.clear(); helper.getRange('A1').setValue(stock[2]);
    helper.getRange('B1').setFormula('=GOOGLEFINANCE($A$1,"close",TODAY()-1100,TODAY(),"DAILY")');
    helper.hideSheet();
  });
  const history=file.getSheetByName('PRICE_HISTORY')||file.insertSheet('PRICE_HISTORY');
  history.clear(); history.getRange(1,1,1,3).setValues([['ticker','date','close']]);
  SpreadsheetApp.flush();
}

function consolidateHistory() {
  const file=SpreadsheetApp.getActive();
  const history=file.getSheetByName('PRICE_HISTORY')||file.insertSheet('PRICE_HISTORY');
  const output=[];
  STOCKS.filter(stock=>stock[2]).forEach(stock=>{
    const helper=file.getSheetByName(`GF_${stock[0].replace('-','_')}`);
    if(!helper)return;
    helper.getRange('B1').setFormula('=GOOGLEFINANCE($A$1,"close",TODAY()-1100,TODAY(),"DAILY")');
    SpreadsheetApp.flush();
    if(helper.getLastRow()<2)return;
    const rows=helper.getRange(2,2,helper.getLastRow()-1,2).getValues();
    rows.forEach(([date,close])=>{if(date instanceof Date&&typeof close==='number')output.push([stock[0],Utilities.formatDate(date,'Etc/UTC','yyyy-MM-dd'),close]);});
  });
  history.clear(); history.getRange(1,1,1,3).setValues([['ticker','date','close']]);
  if(output.length)history.getRange(2,1,output.length,3).setValues(output);
}
