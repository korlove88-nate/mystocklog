import { afterEach, describe, expect, it, vi } from 'vitest'
import { createStockDataProvider } from './stockData'

afterEach(()=>vi.unstubAllGlobals())

const response={ok:true,json:async()=>({payloads:{},catalog:{stocks:[{ticker:'NVDA',company:'NVIDIA',sector:'Semiconductors',active:true,sortOrder:1}],groups:[{id:'top',name:'시총 TOP10',sortOrder:1,tickers:['NVDA']}]},marketOverview:[]})}

describe('dashboard FMP opt-in',()=>{
  it('does not send the FMP header when the setting is off',async()=>{const fetchMock=vi.fn().mockResolvedValue(response);vi.stubGlobal('fetch',fetchMock);await createStockDataProvider(true,false).getStocks();expect(fetchMock.mock.calls[0][1]?.headers).not.toHaveProperty('x-use-fmp')})
  it('sends the FMP header only when explicitly enabled',async()=>{const fetchMock=vi.fn().mockResolvedValue(response);vi.stubGlobal('fetch',fetchMock);await createStockDataProvider(true,true).getStocks();expect(fetchMock.mock.calls[0][1]?.headers).toHaveProperty('x-use-fmp','1')})
})
