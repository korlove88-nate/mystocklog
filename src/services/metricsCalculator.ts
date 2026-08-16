import type { HistoricalPrice, MetricValue } from '../types'

const valid = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)
const dateValue = (date: string) => Date.parse(`${date}T00:00:00Z`)
const isoDate = (date: Date) => date.toISOString().slice(0, 10)
const analyticalPrice = (point: HistoricalPrice) => valid(point.adjustedClose) ? point.adjustedClose : point.close

export function normalizeHistoricalPrices(prices: HistoricalPrice[]): HistoricalPrice[] {
  const byDate = new Map<string, HistoricalPrice>()
  for (const point of prices) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(point.date) || !valid(point.close) || point.close <= 0) continue
    byDate.set(point.date, point)
  }
  return [...byDate.values()].sort((a, b) => dateValue(a.date) - dateValue(b.date))
}

export const calculateDrawdown = (current: MetricValue, high: MetricValue): MetricValue =>
  valid(current) && valid(high) && high > 0 ? current / high - 1 : null

export function calculateAnnualMdd(prices: HistoricalPrice[], year: number): MetricValue {
  const points = normalizeHistoricalPrices(prices).filter(point => Number(point.date.slice(0, 4)) === year)
  if (!points.length) return null
  let peak = -Infinity
  let mdd = 0
  for (const point of points) {
    const price = analyticalPrice(point)
    peak = Math.max(peak, price)
    mdd = Math.min(mdd, price / peak - 1)
  }
  return mdd
}

export function calculateMovingAverage(prices: HistoricalPrice[], period: number): MetricValue {
  const points = normalizeHistoricalPrices(prices)
  if (!Number.isInteger(period) || period <= 0 || points.length < period) return null
  const window = points.slice(-period)
  return window.reduce((sum, point) => sum + analyticalPrice(point), 0) / period
}

export type MddProximityLevel = 'normal'|'interest'|'near'|'mdd'
export type MddProximity = { ratio:number; level:MddProximityLevel } | null

export function calculateMddProximity(drawdown52:MetricValue,mddValues:MetricValue[]):MddProximity{
  if(!valid(drawdown52)||mddValues.length!==3||mddValues.some(value=>!valid(value)))return null
  const sorted=(mddValues as number[]).map(Math.abs).sort((a,b)=>a-b)
  const median=sorted[1]
  if(!valid(median)||median<=0)return null
  const ratio=Math.abs(drawdown52)/median
  return{ratio,level:ratio>=1?'mdd':ratio>=.85?'near':ratio>=.7?'interest':'normal'}
}

export type MovingAveragePoint = { date: string; price: number; ma20: MetricValue; ma60: MetricValue; ma120: MetricValue; ma200: MetricValue }

export function calculateMovingAverageSeries(prices: HistoricalPrice[]): MovingAveragePoint[] {
  const points = normalizeHistoricalPrices(prices)
  const periods = [20, 60, 120, 200] as const
  const sums: Record<number, number> = {20:0,60:0,120:0,200:0}
  return points.map((point, index) => {
    const price = analyticalPrice(point)
    for (const period of periods) {
      sums[period] += price
      if (index >= period) sums[period] -= analyticalPrice(points[index - period])
    }
    return {
      date: point.date, price,
      ma20: index >= 19 ? sums[20] / 20 : null,
      ma60: index >= 59 ? sums[60] / 60 : null,
      ma120: index >= 119 ? sums[120] / 120 : null,
      ma200: index >= 199 ? sums[200] / 200 : null,
    }
  })
}

function subtractUtc(reference: Date, amount: number, unit: 'month' | 'year') {
  const result = new Date(reference)
  if (unit === 'month') result.setUTCMonth(result.getUTCMonth() - amount)
  else result.setUTCFullYear(result.getUTCFullYear() - amount)
  return result
}

export function calculatePeriodReturn(prices: HistoricalPrice[], amount: number, unit: 'month' | 'year'): MetricValue {
  const points = normalizeHistoricalPrices(prices)
  if (points.length < 2) return null
  const latest = points.at(-1)!
  const target = isoDate(subtractUtc(new Date(`${latest.date}T00:00:00Z`), amount, unit))
  if (points[0].date > target) return null
  const base = [...points].reverse().find(point => point.date <= target)
  if (!base) return null
  const basePrice = analyticalPrice(base)
  return basePrice > 0 ? analyticalPrice(latest) / basePrice - 1 : null
}

export type CalculatedMetrics = {
  ath: MetricValue; atl: MetricValue; high52: MetricValue; low52: MetricValue; drawdown52: MetricValue;
  yearOpen: MetricValue; ytdReturn: MetricValue; mdd: Record<number, MetricValue>;
  return1m: MetricValue; return3m: MetricValue; return6m: MetricValue; return1y: MetricValue; return3y: MetricValue; return5y: MetricValue;
  ma20: MetricValue; ma60: MetricValue; ma120: MetricValue; ma200: MetricValue;
}

export function calculateMetrics(prices: HistoricalPrice[], currentPrice: MetricValue, currentYear: number, historyComplete = false): CalculatedMetrics {
  const points = normalizeHistoricalPrices(prices)
  const latestDate = points.at(-1)?.date
  const cutoff = latestDate ? isoDate(subtractUtc(new Date(`${latestDate}T00:00:00Z`), 1, 'year')) : null
  const trailingYear = cutoff ? points.filter(point => point.date >= cutoff) : []
  const rawCloses = points.map(point => point.close)
  const yearPoints = points.filter(point => Number(point.date.slice(0, 4)) === currentYear)
  const yearOpen = yearPoints[0]?.close ?? null
  const high52 = trailingYear.length ? Math.max(...trailingYear.map(point => point.high ?? point.close)) : null
  const low52 = trailingYear.length ? Math.min(...trailingYear.map(point => point.low ?? point.close)) : null
  const effectiveCurrent = currentPrice ?? points.at(-1)?.close ?? null
  const years = [currentYear - 2, currentYear - 1, currentYear]
  return {
    ath: historyComplete && rawCloses.length ? Math.max(...rawCloses) : null,
    atl: historyComplete && rawCloses.length ? Math.min(...rawCloses) : null,
    high52, low52, drawdown52: calculateDrawdown(effectiveCurrent, high52), yearOpen,
    ytdReturn: calculateDrawdown(effectiveCurrent, yearOpen),
    mdd: Object.fromEntries(years.map(year => [year, calculateAnnualMdd(points, year)])),
    return1m: calculatePeriodReturn(points, 1, 'month'), return3m: calculatePeriodReturn(points, 3, 'month'),
    return6m: calculatePeriodReturn(points, 6, 'month'), return1y: calculatePeriodReturn(points, 1, 'year'),
    return3y: calculatePeriodReturn(points, 3, 'year'), return5y: calculatePeriodReturn(points, 5, 'year'),
    ma20: calculateMovingAverage(points, 20), ma60: calculateMovingAverage(points, 60),
    ma120: calculateMovingAverage(points, 120), ma200: calculateMovingAverage(points, 200),
  }
}
