import { afterEach, describe, expect, it, vi } from 'vitest'
import { loadTossDailyPrices, loadTossPrices, resetTossTokenForTest, TossApiError } from './toss-securities'

afterEach(()=>{vi.unstubAllGlobals();resetTossTokenForTest()})
const response=(body:unknown)=>({ok:true,json:async()=>body})

describe('Toss Securities provider',()=>{
  it('uses one batch request for current prices',async()=>{
    const fetchMock=vi.fn().mockResolvedValueOnce(response({access_token:'token',expires_in:3600})).mockResolvedValueOnce(response({result:[{symbol:'AAPL',timestamp:'2026-08-19T16:00:00-04:00',lastPrice:'230.25',currency:'USD'}]}))
    vi.stubGlobal('fetch',fetchMock)
    const prices=await loadTossPrices(['AAPL'],{clientId:'id',clientSecret:'secret'})
    expect(prices.AAPL).toMatchObject({price:230.25,marketDate:'2026-08-19'})
    expect(String(fetchMock.mock.calls[1][0])).toContain('/api/v1/prices?symbols=AAPL')
  })

  it('normalizes and de-duplicates daily OHLCV candles',async()=>{
    const candle={timestamp:'2026-08-19T09:00:00-04:00',openPrice:'225',highPrice:'232',lowPrice:'224',closePrice:'230',volume:'123456',currency:'USD'}
    const fetchMock=vi.fn().mockResolvedValueOnce(response({access_token:'token',expires_in:3600})).mockResolvedValueOnce(response({result:{candles:[candle,candle],nextBefore:null}}))
    vi.stubGlobal('fetch',fetchMock)
    expect(await loadTossDailyPrices('AAPL',{clientId:'id',clientSecret:'secret'})).toEqual([{date:'2026-08-19',open:225,high:232,low:224,close:230,adjustedClose:230,volume:123456}])
  })

  it('keeps only a masked TOSS HTTP error diagnostic',async()=>{
    const failed={ok:false,status:403,json:async()=>({code:'IP_NOT_ALLOWED',message:'IP is not registered for this client_secret=tssk_live_example'})}
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue(failed))
    await expect(loadTossPrices(['AAPL'],{clientId:'id',clientSecret:'secret'})).rejects.toMatchObject({status:403,code:'IP_NOT_ALLOWED',apiMessage:'IP is not registered for this client_secret=[redacted]'})
    await expect(loadTossPrices(['AAPL'],{clientId:'id',clientSecret:'secret'})).rejects.toBeInstanceOf(TossApiError)
  })
})
