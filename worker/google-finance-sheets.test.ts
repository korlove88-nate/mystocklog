import { afterEach, describe, expect, it, vi } from 'vitest'
import { loadGoogleFinanceWorkbook, parseGoogleSheetDate } from './google-finance-sheets'

afterEach(()=>vi.unstubAllGlobals())

describe('Google Sheets date normalization',()=>{
  it('keeps ISO dates',()=>expect(parseGoogleSheetDate('2026-08-13')).toBe('2026-08-13'))
  it('converts Google serial dates',()=>expect(parseGoogleSheetDate('45401.66667')).toBe('2024-04-19'))
})

describe('GoogleFinance Bridge V2',()=>{
  it('loads active stocks, overlapping groups, quotes and per-ticker history in two sheet calls',async()=>{
    const fetchMock=vi.fn()
      .mockResolvedValueOnce({ok:true,json:async()=>({valueRanges:[
        {values:[['Ticker','Company','Sector','Active','Sort Order','History Sheet'],['NVDA','NVIDIA','Semiconductors','Y','1','H_NVDA'],['OLD','Old','Technology','N','2','H_OLD']]},
        {values:[['Group ID','Group Name','Active','Sort Order'],['top','시총 TOP10','Y','1'],['semi','반도체','Y','2']]},
        {values:[['Group ID','Ticker','Active','Sort Order'],['top','NVDA','Y','1'],['semi','NVDA','Y','1'],['top','OLD','Y','2']]},
        {values:[['Ticker','Current Price','Change Percent','52W High','52W Low'],['NVDA','200','1.5%','220','120'],['SP500','7000','0.4%','','']]},
      ]})})
      .mockResolvedValueOnce({ok:true,json:async()=>({valueRanges:[{values:[['Date','Close'],['2026-08-13','198'],['2026-08-14','200']]}]})})
    vi.stubGlobal('fetch',fetchMock)
    const workbook=await loadGoogleFinanceWorkbook({spreadsheetId:'sheet',apiKey:'key',masterRange:'STOCK_MASTER!A1:Z1000',historyRange:'PER_TICKER'})
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(workbook.catalog.stocks.map(stock=>stock.ticker)).toEqual(['NVDA'])
    expect(workbook.catalog.groups.map(group=>group.tickers)).toEqual([['NVDA'],['NVDA']])
    expect(workbook.records.NVDA.historicalPrices).toHaveLength(2)
    expect(workbook.records.NVDA.quote?.changePercent).toBe(.015)
    expect(workbook.marketOverview[0].value).toBe(7000)
  })
})
