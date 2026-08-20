import { afterEach, describe, expect, it, vi } from 'vitest'
import { createStockDataProvider } from './stockData'

afterEach(()=>vi.unstubAllGlobals())

const response={ok:true,json:async()=>({payloads:{},catalog:{stocks:[{ticker:'NVDA',company:'NVIDIA',sector:'Semiconductors',active:true,sortOrder:1}],groups:[{id:'top',name:'시총 TOP10',sortOrder:1,tickers:['NVDA']}]},marketOverview:[]})}

describe('dashboard refresh',()=>{
  it('sends only the refresh header and has no legacy provider toggle',async()=>{const fetchMock=vi.fn().mockResolvedValue(response);vi.stubGlobal('fetch',fetchMock);await createStockDataProvider(true).getStocks();expect(fetchMock.mock.calls[0][1]?.headers).toEqual({'x-refresh-market-data':'1'})})
})
