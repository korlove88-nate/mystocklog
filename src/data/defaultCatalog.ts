import type { MarketCatalog, MarketOverviewItem, StockSnapshot } from '../types'
import { referenceSnapshot } from './referenceSnapshot'

const stock = (ticker:string,company:string,sector:string|null,sortOrder:number) => ({ticker,company,sector,active:true,sortOrder})

export const defaultCatalog:MarketCatalog={
  stocks:[
    stock('NVDA','NVIDIA Corporation','Semiconductors',1),stock('AAPL','Apple Inc.','Technology',2),stock('GOOG','Alphabet Inc.','Communication Services',3),stock('MSFT','Microsoft Corporation','Technology',4),stock('AMZN','Amazon.com, Inc.','Consumer Cyclical',5),stock('AVGO','Broadcom Inc.','Semiconductors',6),stock('SPCX','Space Exploration Technologies Corp.','Industrials',7),stock('META','Meta Platforms, Inc.','Communication Services',8),stock('TSLA','Tesla, Inc.','Consumer Cyclical',9),stock('BRK-B','Berkshire Hathaway Inc.','Financial Services',10),
    stock('AMD','Advanced Micro Devices, Inc.','Semiconductors',11),stock('MU','Micron Technology, Inc.','Semiconductors',12),stock('TSM','Taiwan Semiconductor Manufacturing Company','Semiconductors',13),stock('ASML','ASML Holding N.V.','Semiconductors',14),stock('UMAC','Unusual Machines, Inc.','Aerospace & Defense',15),stock('RCAT','Red Cat Holdings, Inc.','Aerospace & Defense',16),stock('ONDS','Ondas Holdings Inc.','Communication Equipment',17),stock('RKLB','Rocket Lab USA, Inc.','Aerospace & Defense',18),stock('JOBY','Joby Aviation, Inc.','Aerospace & Defense',19),stock('LMT','Lockheed Martin Corporation','Aerospace & Defense',20),stock('SMR','NuScale Power Corporation','Energy',21),stock('OKLO','Oklo Inc.','Energy',22),stock('DNN','Denison Mines Corp.','Energy',23),stock('IONQ','IonQ, Inc.','Quantum Computing',24),stock('LAES','SEALSQ Corp','Semiconductors',25),stock('RZLV','Rezolve AI PLC','Technology',26),stock('RGTI','Rigetti Computing, Inc.','Quantum Computing',27),stock('QUBT','Quantum Computing Inc.','Quantum Computing',28),stock('QBTS','D-Wave Quantum Inc.','Quantum Computing',29),stock('PLTR','Palantir Technologies Inc.','Technology',30),stock('AFRM','Affirm Holdings, Inc.','Financial Technology',31),stock('O','Realty Income Corporation','Real Estate',32),
  ],
  groups:[
    {id:'market-cap-top10',name:'시총 TOP10',sortOrder:1,tickers:['NVDA','AAPL','GOOG','MSFT','AMZN','AVGO','SPCX','META','TSLA','BRK-B']},
    {id:'semiconductor',name:'반도체',sortOrder:2,tickers:['NVDA','AVGO','AMD','MU','TSM','ASML']},
    {id:'defense-space',name:'방산/드론/우주',sortOrder:3,tickers:['UMAC','RCAT','ONDS','RKLB','JOBY','LMT','SPCX']},
    {id:'energy',name:'에너지',sortOrder:4,tickers:['SMR','OKLO','DNN']},
    {id:'quantum',name:'양자',sortOrder:5,tickers:['IONQ','LAES','RZLV','RGTI','QUBT','QBTS']},
    {id:'paypal-mafia',name:'페이팔마피아',sortOrder:6,tickers:['TSLA','SPCX','PLTR','AFRM']},
    {id:'dividend',name:'배당주',sortOrder:7,tickers:['O']},
  ],
}

export const emptyMarketOverview:MarketOverviewItem[]=[
  {key:'sp500',label:'S&P500',value:null,change:null,changeUnit:'percent',source:'stored'},
  {key:'nasdaq',label:'NASDAQ',value:null,change:null,changeUnit:'percent',source:'stored'},
  {key:'dow',label:'DOW',value:null,change:null,changeUnit:'percent',source:'stored'},
  {key:'vix',label:'VIX',value:null,change:null,changeUnit:'percent',source:'stored'},
  {key:'us10y',label:'US10Y',value:null,change:null,changeUnit:'bp',source:'stored'},
]

export const defaultStockSnapshots:StockSnapshot[]=defaultCatalog.stocks.map(master=>referenceSnapshot.find(stock=>stock.ticker===master.ticker)??({ticker:master.ticker,company:master.company,sector:master.sector,marketCap:null,pe:null,eps:null,price:null,changePercent:null,ath:null,high52:null,drawdown52:null,low52:null,atl:null,mdd:{},yearOpen:null,ytdReturn:null,return1m:null,return3m:null,return6m:null,return1y:null,return3y:null,return5y:null,ma20:null,ma60:null,ma120:null,ma200:null,historyComplete:false,priceHistory:[],dataSource:'reference'}))
