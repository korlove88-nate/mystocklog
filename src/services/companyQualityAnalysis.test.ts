import { describe,expect,it } from 'vitest'
import { evaluateCompanyQuality } from './companyQualityAnalysis'
import type { SecFinancialQuarter } from '../types'

const row=(year:number,quarter:SecFinancialQuarter['fiscalQuarter'],revenue:number,eps:number):SecFinancialQuarter=>({ticker:'TEST',cik:'1',fiscalYear:year,fiscalQuarter:quarter,periodEnd:`${year}-${quarter==='Q1'?'03-31':quarter==='Q2'?'06-30':quarter==='Q3'?'09-30':'12-31'}`,filedAt:`${year}-12-31`,accessionNumber:`${year}-${quarter}`,revenue,operatingIncome:revenue*.3,netIncome:revenue*.2,epsBasic:eps,epsDiluted:eps,operatingCashFlow:revenue*.28,capex:revenue*.05,freeCashFlow:revenue*.23,cash:100,totalAssets:500,totalLiabilities:200,totalDebt:50,stockholdersEquity:300,source:'SEC'})
describe('company quality evaluation',()=>{
  it('calculates YoY, margins, FCF, ROE and normalized score',()=>{const rows=[row(2024,'Q1',100,1),row(2024,'Q2',110,1.1),row(2024,'Q3',120,1.2),row(2024,'Q4',130,1.3),row(2025,'Q1',140,1.5),row(2025,'Q2',155,1.7),row(2025,'Q3',170,1.9),row(2025,'Q4',190,2.2)],result=evaluateCompanyQuality(rows);expect(result.metrics.revenueYoy).toBeCloseTo(190/130-1);expect(result.metrics.operatingMargin).toBeCloseTo(.3);expect(result.metrics.netMargin).toBeCloseTo(.2);expect(result.metrics.freeCashFlow).toBeCloseTo(43.7);expect(result.score).not.toBeNull();expect(result.completeness).toBeGreaterThan(80)})
  it('does not score absent inputs as zero',()=>{const result=evaluateCompanyQuality([]);expect(result.score).toBeNull();expect(result.status).toBe('insufficient');expect(result.completeness).toBe(0)})
})
