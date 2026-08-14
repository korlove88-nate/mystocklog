import { afterEach, describe, expect, it, vi } from 'vitest'
import { ExternalMarketDataProvider } from './marketDataProvider'

afterEach(() => vi.unstubAllGlobals())

describe('ExternalMarketDataProvider', () => {
  it('loads a watchlist in one request and reuses the response for every field', async () => {
    const fetchMock=vi.fn().mockResolvedValue({ok:true,json:async()=>({payloads:{AAPL:{quote:{ticker:'AAPL',price:200,previousClose:198,changePercent:.01,marketDate:'2026-08-13'},fundamentals:null,historicalPrices:[{date:'2026-08-13',close:200}],historyComplete:false}}})})
    vi.stubGlobal('fetch',fetchMock)
    const provider=new ExternalMarketDataProvider('/api/market-data',false,['AAPL'])
    await Promise.all([provider.getQuote('AAPL'),provider.getHistoricalPrices('AAPL'),provider.getFundamentals('AAPL')])
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(String(fetchMock.mock.calls[0][0])).toContain('symbols=AAPL')
  })
})

