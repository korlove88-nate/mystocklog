import {describe,expect,it} from 'vitest'
import {analyzeQuarterlyFundamentals} from './fundamentalsAnalysis'

describe('quarterly fundamentals',()=>{
  it('uses latest EPS and PER statistics differently',()=>{const result=analyzeQuarterlyFundamentals([{snapshotDate:'2025-01-02',eps:5,per:30},{snapshotDate:'2025-03-31',eps:5.2,per:40},{snapshotDate:'2025-04-01',eps:5.8,per:20},{snapshotDate:'2025-07-01',eps:6.4,per:25}],29.4,new Date('2025-10-01'));expect(result.quarters[0]).toMatchObject({eps:5.2,perAverage:35,perMin:30,perMax:40,perEnd:40});expect(result.ready).toBe(true);expect(result.epsDirection).toBe('상승')})
  it('does not evaluate before three completed quarters',()=>{const result=analyzeQuarterlyFundamentals([{snapshotDate:'2026-08-20',eps:5,per:30}],30,new Date('2026-08-21'));expect(result.completed).toHaveLength(0);expect(result.ready).toBe(false);expect(result.perDifference).toBeNull()})
})
