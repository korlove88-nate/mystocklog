import { afterEach, describe, expect, it, vi } from 'vitest'
import { loadGoogleFinanceWorkbook, marketOverviewFromValues, parseGoogleSheetDate } from './google-finance-sheets'

afterEach(()=>vi.unstubAllGlobals())

describe('Google Sheets date normalization',()=>{
  it('keeps ISO dates',()=>expect(parseGoogleSheetDate('2026-08-13')).toBe('2026-08-13'))
  it('converts Google serial dates',()=>expect(parseGoogleSheetDate('45401.66667')).toBe('2024-04-19'))
})

describe('GoogleFinance Bridge V2.1',()=>{
  it('reads only current fundamentals and market overview',async()=>{
    const result=(values:unknown)=>({ok:true,json:async()=>({valueRanges:[{values}]})})
    const fetchMock=vi.fn()
      .mockResolvedValueOnce(result([['Ticker','Company','Sector','Active','Sort Order'],['BRK-B','Berkshire Hathaway','Financials','Y','1'],['OLD','Old','Technology','N','2']]))
      .mockResolvedValueOnce(result([['Group ID','Group Name','Active','Sort Order'],['top','시총 TOP10','Y','1'],['semi','반도체','Y','2']]))
      .mockResolvedValueOnce(result([['Group ID','Ticker','Active','Sort Order'],['top','BRK-B','Y','1'],['semi','BRK-B','Y','1'],['top','OLD','Y','2']]))
      .mockResolvedValueOnce(result([['Ticker','GF Market Cap','GF PER','GF EPS'],['BRK-B','900B','12.5','40']]))
      .mockResolvedValueOnce(result([['Key','Display Value','Change Percent','Change BP'],['S&P500','7400','0.4%',''],['US10Y','4.48','','3']]))
    vi.stubGlobal('fetch',fetchMock)
    const workbook=await loadGoogleFinanceWorkbook({spreadsheetId:'sheet',apiKey:'key',masterRange:'STOCK_MASTER!A1:Z1000',historyRange:'PER_TICKER'})
    expect(fetchMock).toHaveBeenCalledTimes(5)
    expect(workbook.catalog.stocks.map(stock=>stock.ticker)).toEqual(['BRK-B'])
    expect(workbook.catalog.groups.map(group=>group.tickers)).toEqual([['BRK-B'],['BRK-B']])
    expect(workbook.records['BRK-B'].historicalPrices).toHaveLength(0)
    expect(workbook.records['BRK-B'].quote).toBeNull()
    expect(workbook.records['BRK-B'].fundamentals).toMatchObject({marketCap:900e9,pe:12.5,eps:40})
    expect(workbook.marketOverview[0].value).toBe(7400)
    expect(workbook.marketOverview[4]).toMatchObject({value:4.48,change:3,changeUnit:'bp'})
  })

  it('does not request GoogleFinance price history',async()=>{
    const result=(values:unknown)=>({ok:true,json:async()=>({valueRanges:[{values}]})})
    const fetchMock=vi.fn()
      .mockResolvedValueOnce(result([['Ticker','Company','Active'],['NVDA','NVIDIA','Y'],['MU','Micron','Y']]))
      .mockResolvedValueOnce(result([['Group','Active'],['반도체','Y']]))
      .mockResolvedValueOnce(result([['Group','Ticker','Active'],['반도체','NVDA','Y'],['반도체','MU','Y']]))
      .mockResolvedValueOnce(result([['Ticker','Price','History Sheet'],['NVDA','200','H_NVDA'],['MU','150','H_MISSING']]))
      .mockResolvedValueOnce(result([]))
    vi.stubGlobal('fetch',fetchMock)
    const workbook=await loadGoogleFinanceWorkbook({spreadsheetId:'sheet',apiKey:'key',masterRange:'STOCK_MASTER!A1:Z1000',historyRange:'PER_TICKER'})
    expect(fetchMock).toHaveBeenCalledTimes(5)
    expect(workbook.records.NVDA.historicalPrices).toHaveLength(0)
    expect(workbook.records.MU.historicalPrices).toHaveLength(0)
  })

  it('keeps market indicators when another sheet range fails',async()=>{
    const result=(values:unknown)=>({ok:true,json:async()=>({valueRanges:[{values}]})})
    const failed={ok:false,status:403,json:async()=>({})}
    const fetchMock=vi.fn()
      .mockResolvedValueOnce(failed)
      .mockResolvedValueOnce(result([]))
      .mockResolvedValueOnce(result([]))
      .mockResolvedValueOnce(result([]))
      .mockResolvedValueOnce(result([[],['Key','Display Value','Change Percent'],['NASDAQ','26200','0.6%'],['VIX','15.2','-2%']]))
    vi.stubGlobal('fetch',fetchMock)
    const workbook=await loadGoogleFinanceWorkbook({spreadsheetId:'sheet',apiKey:'key',masterRange:'STOCK_MASTER!A1:Z1000',historyRange:''})
    expect(workbook.catalog.stocks).toHaveLength(0)
    expect(workbook.marketOverview.find(item=>item.key==='nasdaq')).toMatchObject({value:26200,change:0.006})
    expect(workbook.marketOverview.find(item=>item.key==='vix')?.value).toBe(15.2)
    expect(workbook.marketOverview.find(item=>item.key==='sp500')?.value).toBeNull()
  })

  it('keeps missing market items null and uses US10Y Display Value directly',()=>{
    const items=marketOverviewFromValues([['Key','Display Value','Change Percent','Display Change'],['NASDAQ','26200','0.6%',''],['US10Y','4.48','','0.06%'],['USDKRW','1382.55','-0.2%','']])
    expect(items.find(item=>item.key==='nasdaq')?.value).toBe(26200)
    expect(items.find(item=>item.key==='sp500')?.value).toBeNull()
    expect(items.find(item=>item.key==='us10y')?.value).toBe(4.48)
    expect(items.find(item=>item.key==='us10y')?.change).toBeCloseTo(6)
    expect(items.find(item=>item.key==='usdkrw')).toMatchObject({value:1382.55,change:-0.002})
    expect(marketOverviewFromValues([['Key','Display Value','Change Percent'],['USDKRW','₩1,377.57','0.00%']]).find(item=>item.key==='usdkrw')).toMatchObject({value:1377.57,change:0})
    expect(items).toHaveLength(6)
  })
})
