import {describe,expect,it} from 'vitest'
import {alertReason,classifyZone,zoneDistance,type ZoneState} from './priceAlerts'

describe('price alert state engine',()=>{
  it.each([
    ['buy',80,'broken_below'],['buy',98,'below'],['buy',102,'inside'],['buy',104,'inside'],['buy',106,'approaching'],['buy',120,'above'],
    ['sell',80,'below'],['sell',98,'approaching'],['sell',102,'inside'],['sell',104,'inside'],['sell',106,'above'],['sell',120,'broken_above'],
  ] as const)('%s price %s -> %s',(kind,price,state)=>expect(classifyZone(kind,price,100,105)).toBe(state))
  it('does not notify on first unknown observation',()=>expect(alertReason('unknown','inside',{low:null,high:null,price:null},{low:100,high:105,price:102},false)).toBeNull())
  it('detects first price entry',()=>expect(alertReason('above','inside',{low:100,high:105,price:110},{low:100,high:105,price:102},false)).toBe('price_entered_zone'))
  it('detects price re-entry',()=>expect(alertReason('above','inside',{low:100,high:105,price:110},{low:100,high:105,price:102},true)).toBe('price_reentered_zone'))
  it('detects recalculated zone',()=>expect(alertReason('above','inside',{low:90,high:95,price:110},{low:105,high:112,price:110},false)).toBe('zone_recalculated_around_price'))
  it.each(['inside','below','above','approaching','broken_below','broken_above'] as ZoneState[])('does not repeat while current state is not a new entry: %s',state=>expect(alertReason('inside',state,{low:100,high:105,price:102},{low:100,high:105,price:102},true)).toBeNull())
  it('returns null for insufficient data',()=>expect(classifyZone('buy',null,100,105)).toBe('unknown'))
  it('calculates distance without inventing values',()=>{expect(zoneDistance(110,100,105)).toBeCloseTo(-.04545);expect(zoneDistance(null,100,105)).toBeNull()})
})
