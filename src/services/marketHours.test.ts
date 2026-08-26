import { describe, expect, it } from 'vitest'
import { getMarketHours, isStoredPriceStale, latestCompletedUsMarketDate } from './marketHours'

describe('getMarketHours',()=>{
  it('converts daylight-saving market hours to KST',()=>{
    expect(getMarketHours(new Date('2026-07-15T15:00:00Z')).kst).toBe('22:30–05:00')
  })
  it('converts standard-time market hours to KST',()=>{
    expect(getMarketHours(new Date('2026-01-15T15:00:00Z')).kst).toBe('23:30–06:00')
  })
  it('identifies pre-market, open, close, and weekend states',()=>{
    expect(getMarketHours(new Date('2026-07-15T12:00:00Z')).status).toBe('pre')
    expect(getMarketHours(new Date('2026-07-15T15:00:00Z')).status).toBe('open')
    expect(getMarketHours(new Date('2026-07-15T21:00:00Z')).status).toBe('closed')
    expect(getMarketHours(new Date('2026-07-18T15:00:00Z')).status).toBe('holiday')
  })
  it('does not open on US holidays and honors standard early closes',()=>{
    expect(getMarketHours(new Date('2026-07-03T16:00:00Z')).status).toBe('holiday')
    expect(getMarketHours(new Date('2026-11-27T17:30:00Z')).status).toBe('open')
    expect(getMarketHours(new Date('2026-11-27T18:00:00Z')).status).toBe('closed')
  })
  it('uses the latest completed regular session and skips weekends and holidays',()=>{
    expect(latestCompletedUsMarketDate(new Date('2026-08-21T01:00:00Z'))).toBe('2026-08-20')
    expect(latestCompletedUsMarketDate(new Date('2026-07-06T14:00:00Z'))).toBe('2026-07-02')
    expect(latestCompletedUsMarketDate(new Date('2026-07-06T21:00:00Z'))).toBe('2026-07-06')
  })
  it('warns only when the stored TOSS market date is older than that session',()=>{
    const now=new Date('2026-08-21T01:00:00Z')
    expect(isStoredPriceStale('2026-08-20',now)).toBe(false)
    expect(isStoredPriceStale('2026-08-19',now)).toBe(true)
  })
})
