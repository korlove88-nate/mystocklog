import { describe,expect,it } from 'vitest'
import { verifiedTossSyncItem } from './market-data'

const valid={quote:{ticker:'AAPL',price:102,previousClose:100,changePercent:.02,marketDate:'2026-08-20'},historicalPrices:[{date:'2026-08-19',open:99,high:101,low:98,close:100,volume:10},{date:'2026-08-20',open:100,high:103,low:99,close:102,volume:20}]}
describe('verified Toss sync import',()=>{
  it('accepts complete same-date TOSS OHLCV',()=>expect(verifiedTossSyncItem('AAPL',valid)?.historicalPrices).toHaveLength(2))
  it('rejects incomplete or mismatched data',()=>{expect(verifiedTossSyncItem('AAPL',{...valid,historicalPrices:[{date:'2026-08-20',close:102}]})).toBeNull();expect(verifiedTossSyncItem('MSFT',valid)).toBeNull()})
})
