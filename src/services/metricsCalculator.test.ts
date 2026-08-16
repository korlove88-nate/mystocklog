import { describe, expect, it } from 'vitest'
import type { HistoricalPrice } from '../types'
import { calculateAnnualMdd, calculateDrawdown, calculateMddProximity, calculateMetrics, calculateMovingAverage, calculateMovingAverageSeries } from './metricsCalculator'

const series = (values: number[], start = '2026-01-02'): HistoricalPrice[] => {
  const startDate = new Date(`${start}T00:00:00Z`)
  return values.map((close, index) => ({ date: new Date(startDate.getTime() + index * 86_400_000).toISOString().slice(0,10), close }))
}

describe('metricsCalculator', () => {
  it('calculates ATH and ATL only for complete history', () => {
    const metrics = calculateMetrics(series([100,120,90]), 90, 2026, true)
    expect(metrics.ath).toBe(120)
    expect(metrics.atl).toBe(90)
    expect(calculateMetrics(series([100,120,90]), 90, 2026, false).ath).toBeNull()
  })

  it('calculates annual MDD within the year', () => {
    expect(calculateAnnualMdd(series([100,120,150,100]), 2026)).toBeCloseTo(-1/3, 10)
  })

  it('calculates 52-week drawdown', () => {
    expect(calculateDrawdown(180,200)).toBeCloseTo(-0.1, 10)
  })

  it('calculates YTD from the first trading close', () => {
    const metrics = calculateMetrics(series([100,110,120]),120,2026,true)
    expect(metrics.yearOpen).toBe(100)
    expect(metrics.ytdReturn).toBeCloseTo(0.2,10)
  })

  it('calculates a moving average', () => {
    expect(calculateMovingAverage(series([1,2,3,4,5]),5)).toBe(3)
  })

  it('returns null for unavailable 3Y and 5Y periods', () => {
    const metrics = calculateMetrics(series([100,110,120]),120,2026,true)
    expect(metrics.return3y).toBeNull()
    expect(metrics.return5y).toBeNull()
  })

  it('builds chart moving averages without inventing early values', () => {
    const result = calculateMovingAverageSeries(series(Array.from({length: 20}, (_, index) => index + 1)))
    expect(result[18].ma20).toBeNull()
    expect(result[19].ma20).toBe(10.5)
    expect(result[19].ma60).toBeNull()
  })

  it('classifies MDD proximity from the median of exactly three annual MDD values',()=>{
    expect(calculateMddProximity(-.18,[-.2,-.25,-.3])).toEqual({ratio:.72,level:'interest'})
    expect(calculateMddProximity(-.225,[-.2,-.25,-.3])?.level).toBe('near')
    expect(calculateMddProximity(-.25,[-.2,-.25,-.3])?.level).toBe('mdd')
    expect(calculateMddProximity(-.1,[-.2,-.25,-.3])?.level).toBe('normal')
    expect(calculateMddProximity(-.18,[-.2,null,-.3])).toBeNull()
  })
})
