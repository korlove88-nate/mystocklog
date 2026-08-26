import { afterEach, describe, expect, it, vi } from 'vitest'
import { createStockDataProvider } from './stockData'

afterEach(()=>vi.unstubAllGlobals())

const response={ok:true,json:async()=>({payloads:{},catalog:{stocks:[{ticker:'NVDA',company:'NVIDIA',sector:'Semiconductors',active:true,sortOrder:1}],groups:[{id:'top',name:'시총 TOP10',sortOrder:1,tickers:['NVDA']}]},marketOverview:[]})}

describe('dashboard latest-price load',()=>{
  it('uses the stored dashboard route and never asks the Worker to call Toss',async()=>{const fetchMock=vi.fn().mockResolvedValue(response);vi.stubGlobal('fetch',fetchMock);await createStockDataProvider(true).getStocks();expect(fetchMock.mock.calls[0][0]).toBe('/api/market-data?dashboard=1');expect(fetchMock.mock.calls[0][1]?.headers).toBeUndefined()})
})
