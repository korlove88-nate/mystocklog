import { afterEach, describe, expect, it, vi } from 'vitest'
import { loadGoogleFinanceWorkbook, marketOverviewFromValues, parseGoogleSheetDate } from './google-finance-sheets'

afterEach(()=>vi.unstubAllGlobals())

describe('Google Sheets date normalization',()=>{
  it('keeps ISO dates',()=>expect(parseGoogleSheetDate('2026-08-13')).toBe('2026-08-13'))
  it('converts Google serial dates',()=>expect(parseGoogleSheetDate('45401.66667')).toBe('2024-04-19'))
})

describe('GoogleFinance Bridge V2.1',()=>{
  it('uses STOCK_MASTER History Sheet and reads MARKET_OVERVIEW independently',async()=>{
    const fetchMock=vi.fn()
      .mockResolvedValueOnce({ok:true,json:async()=>({valueRanges:[
        {values:[['Ticker','Company','Sector','Active','Sort Order'],['BRK-B','Berkshire Hathaway','Financials','Y','1'],['OLD','Old','Technology','N','2']]},
        {values:[['Group ID','Group Name','Active','Sort Order'],['top','시총 TOP10','Y','1'],['semi','반도체','Y','2']]},
        {values:[['Group ID','Ticker','Active','Sort Order'],['top','BRK-B','Y','1'],['semi','BRK-B','Y','1'],['top','OLD','Y','2']]},
        {values:[['Ticker','Current Price','Change Percent','52W High','52W Low','History Sheet'],['BRK-B','500','1.5%','520','400','H_BRKB']]},
      ]})})
      .mockResolvedValueOnce({ok:true,json:async()=>({valueRanges:[{values:[['Date','Close'],['2026-08-13','498'],['2026-08-14','500']]}]})})
      .mockResolvedValueOnce({ok:true,json:async()=>({valueRanges:[{values:[['Key','Display Value','Change Percent','Change BP'],['S&P500','7400','0.4%',''],['US10Y','4.48','','3']]}]})})
    vi.stubGlobal('fetch',fetchMock)
    const workbook=await loadGoogleFinanceWorkbook({spreadsheetId:'sheet',apiKey:'key',masterRange:'STOCK_MASTER!A1:Z1000',historyRange:'PER_TICKER'})
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(String(fetchMock.mock.calls[1][0])).toContain('H_BRKB')
    expect(String(fetchMock.mock.calls[1][0])).not.toContain('H_BRK_B')
    expect(workbook.catalog.stocks.map(stock=>stock.ticker)).toEqual(['BRK-B'])
    expect(workbook.catalog.groups.map(group=>group.tickers)).toEqual([['BRK-B'],['BRK-B']])
    expect(workbook.records['BRK-B'].historicalPrices).toHaveLength(2)
    expect(workbook.records['BRK-B'].quote?.changePercent).toBe(.015)
    expect(workbook.marketOverview[0].value).toBe(7400)
    expect(workbook.marketOverview[4]).toMatchObject({value:4.48,change:3,changeUnit:'bp'})
  })

  it('isolates a missing history sheet instead of failing all symbols',async()=>{
    const fetchMock=vi.fn()
      .mockResolvedValueOnce({ok:true,json:async()=>({valueRanges:[
        {values:[['Ticker','Company','Active'],['NVDA','NVIDIA','Y'],['MU','Micron','Y']]},
        {values:[['Group','Active'],['반도체','Y']]},
        {values:[['Group','Ticker','Active'],['반도체','NVDA','Y'],['반도체','MU','Y']]},
        {values:[['Ticker','Price','History Sheet'],['NVDA','200','H_NVDA'],['MU','150','H_MISSING']]},
      ]})})
      .mockResolvedValueOnce({ok:false,status:400,json:async()=>({})})
      .mockResolvedValueOnce({ok:true,json:async()=>({valueRanges:[{values:[['Date','Close'],['2026-08-14','200']]}]})})
      .mockResolvedValueOnce({ok:false,status:400,json:async()=>({})})
      .mockResolvedValueOnce({ok:true,json:async()=>({valueRanges:[]})})
    vi.stubGlobal('fetch',fetchMock)
    const workbook=await loadGoogleFinanceWorkbook({spreadsheetId:'sheet',apiKey:'key',masterRange:'STOCK_MASTER!A1:Z1000',historyRange:'PER_TICKER'})
    expect(workbook.records.NVDA.historicalPrices).toHaveLength(1)
    expect(workbook.records.MU.historicalPrices).toHaveLength(0)
  })

  it('keeps missing market items null and uses US10Y Display Value directly',()=>{
    const items=marketOverviewFromValues([['Key','Display Value','Change Percent','Display Change'],['NASDAQ','26200','0.6%',''],['US10Y','4.48','','0.06%']])
    expect(items.find(item=>item.key==='nasdaq')?.value).toBe(26200)
    expect(items.find(item=>item.key==='sp500')?.value).toBeNull()
    expect(items.find(item=>item.key==='us10y')?.value).toBe(4.48)
    expect(items.find(item=>item.key==='us10y')?.change).toBeCloseTo(6)
  })
})
