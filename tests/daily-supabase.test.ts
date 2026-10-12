import { describe, expect, it } from 'vitest'
import { collectCandles, mergeConfirmed } from '../scripts/daily-supabase.mjs'

const point = (date: string, close = 100) => ({ date, open: close, high: close + 1, low: close - 1, close, volume: 10 })
const candle = (date: string) => ({ timestamp: `${date}T00:00:00Z`, openPrice: '100', highPrice: '101', lowPrice: '99', closePrice: '100', volume: '10' })
describe('incremental confirmed candles', () => {
  it('preserves history, rejects unfinished bars and is idempotent', () => {
    const history = [point('2026-09-03')]
    const merged = mergeConfirmed(history, [point('2026-09-03'), point('2026-09-04'), point('2026-09-08')], '2026-09-04')
    expect(merged.added).toHaveLength(1)
    expect(merged.history).toHaveLength(2)
    expect(history).toHaveLength(1)
    expect(mergeConfirmed(merged.history, merged.history, '2026-09-04').added).toHaveLength(0)
  })
  it('fails before saving when overlap suggests a split or data revision', () => {
    expect(() => mergeConfirmed([point('2026-09-03')], [point('2026-09-03', 50)], '2026-09-04')).toThrow('HISTORICAL_PRICE_MISMATCH')
    expect(() => mergeConfirmed([], [{ ...point('2026-09-04'), volume: null }], '2026-09-04')).toThrow('INVALID_CANDLE')
  })
  it('requests only a small incremental window and paginates to the previous date', async () => {
    const requests: Array<{ count: number; before: string | null }> = []
    const result = await collectCandles('AAPL', '2026-09-03', '2026-09-04', async (request: { count: number; before: string | null }) => {
      requests.push(request)
      return request.before ? { result: { candles: [candle('2026-09-03')] } } : { result: { candles: [candle('2026-09-04')], nextBefore: 'cursor' } }
    })
    expect(requests.map(r => r.count)).toEqual([5, 5])
    expect(result).toHaveLength(2)
  })
  it('does not silently skip a gap if the API stops before the stored date', async () => {
    await expect(collectCandles('AAPL', '2026-09-03', '2026-09-11', async () => ({ result: { candles: [candle('2026-09-11')] } }))).rejects.toThrow('CANDLE_COVERAGE_INCOMPLETE')
  })
})
