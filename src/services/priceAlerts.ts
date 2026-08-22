import type { MetricValue } from '../types'

export type ZoneKind='buy'|'sell'
export type ZoneState='unknown'|'below'|'outside'|'approaching'|'inside'|'above'|'broken_below'|'broken_above'
export type AlertReason='price_entered_zone'|'zone_recalculated_around_price'|'price_reentered_zone'
export type ZoneSnapshot={low:number|null;high:number|null;price:number|null}

const valid=(value:unknown):value is number=>typeof value==='number'&&Number.isFinite(value)

export function classifyZone(kind:ZoneKind,price:MetricValue,low:MetricValue,high:MetricValue,approach=.03):ZoneState{
  if(!valid(price)||!valid(low)||!valid(high)||low<=0||high<low)return'unknown'
  if(price>=low&&price<=high)return'inside'
  if(kind==='buy'){
    if(price<low)return price<low*(1-approach)?'broken_below':'below'
    return price<=high*(1+approach)?'approaching':'above'
  }
  if(price>high)return price>high*(1+approach)?'broken_above':'above'
  return price>=low*(1-approach)?'approaching':'below'
}

export function alertReason(previousState:ZoneState,currentState:ZoneState,previous:ZoneSnapshot,current:ZoneSnapshot,hasPriorEntry:boolean):AlertReason|null{
  if(currentState!=='inside'||previousState==='inside')return null
  if(previousState==='unknown')return null
  const previousPriceInside=valid(previous.price)&&valid(previous.low)&&valid(previous.high)&&previous.price>=previous.low&&previous.price<=previous.high
  const currentPriceWasInsideOldZone=valid(current.price)&&valid(previous.low)&&valid(previous.high)&&current.price>=previous.low&&current.price<=previous.high
  if(!previousPriceInside&&currentPriceWasInsideOldZone)return hasPriorEntry?'price_reentered_zone':'price_entered_zone'
  return'zone_recalculated_around_price'
}

export function zoneDistance(price:MetricValue,low:MetricValue,high:MetricValue):number|null{
  if(!valid(price)||!valid(low)||!valid(high)||price<=0)return null
  return price<low?low/price-1:price>high?high/price-1:0
}

export const alertReasonLabel=(reason:AlertReason)=>reason==='zone_recalculated_around_price'?'분석 기준 변경으로 현재가가 구간에 포함되었습니다.':reason==='price_reentered_zone'?'가격구간에 다시 진입했습니다.':'종가가 가격구간에 진입했습니다.'
