import { describe,expect,it } from 'vitest'
import { normalizeCompanyFacts, parseTickerCikMap } from './sec-edgar'

const fact=(fy:number,fp:string,start:string,end:string,val:number,filed='2025-02-01',form=fp==='FY'?'10-K':'10-Q',accn=`${fy}-${fp}-${filed}`)=>({fy,fp,start,end,val,filed,form,accn})
const concept=(rows:ReturnType<typeof fact>[],unit='USD')=>({units:{[unit]:rows}})
const fixture={cik:1,entityName:'TEST',facts:{'us-gaap':{
  Revenues:concept([
    fact(2024,'Q1','2024-01-01','2024-03-31',100,'2024-05-01'),fact(2024,'Q2','2024-01-01','2024-06-30',230,'2024-08-01'),fact(2024,'Q3','2024-01-01','2024-09-30',390,'2024-11-01'),fact(2024,'FY','2024-01-01','2024-12-31',560,'2025-02-01'),
    fact(2025,'Q1','2025-01-01','2025-03-31',140,'2025-05-01'),fact(2025,'Q2','2025-01-01','2025-06-30',300,'2025-08-01'),fact(2025,'Q3','2025-01-01','2025-09-30',480,'2025-11-01'),fact(2025,'FY','2025-01-01','2025-12-31',700,'2026-02-01'),
  ]),
  OperatingIncomeLoss:concept([fact(2025,'Q1','2025-01-01','2025-03-31',42,'2025-05-01'),fact(2025,'Q2','2025-01-01','2025-06-30',90,'2025-08-01'),fact(2025,'Q3','2025-01-01','2025-09-30',144,'2025-11-01'),fact(2025,'FY','2025-01-01','2025-12-31',210,'2026-02-01')]),
  NetIncomeLoss:concept([fact(2025,'Q1','2025-01-01','2025-03-31',30,'2025-05-01'),fact(2025,'Q2','2025-01-01','2025-06-30',65,'2025-08-01'),fact(2025,'Q3','2025-01-01','2025-09-30',105,'2025-11-01'),fact(2025,'FY','2025-01-01','2025-12-31',150,'2026-02-01')]),
  EarningsPerShareBasic:concept([fact(2025,'Q1','2025-01-01','2025-03-31',1,'2025-05-01'),fact(2025,'Q2','2025-01-01','2025-06-30',2.2,'2025-08-01'),fact(2025,'Q3','2025-01-01','2025-09-30',3.6,'2025-11-01'),fact(2025,'FY','2025-01-01','2025-12-31',5.2,'2026-02-01')],'USD/shares'),
  NetCashProvidedByUsedInOperatingActivities:concept([fact(2025,'Q1','2025-01-01','2025-03-31',50,'2025-05-01'),fact(2025,'Q2','2025-01-01','2025-06-30',110,'2025-08-01'),fact(2025,'Q3','2025-01-01','2025-09-30',180,'2025-11-01'),fact(2025,'FY','2025-01-01','2025-12-31',260,'2026-02-01')]),
  PaymentsToAcquirePropertyPlantAndEquipment:concept([fact(2025,'Q1','2025-01-01','2025-03-31',10,'2025-05-01'),fact(2025,'Q2','2025-01-01','2025-06-30',25,'2025-08-01'),fact(2025,'Q3','2025-01-01','2025-09-30',45,'2025-11-01'),fact(2025,'FY','2025-01-01','2025-12-31',70,'2026-02-01')]),
}}}

describe('SEC EDGAR normalization',()=>{
  it('maps ticker to zero-padded CIK',()=>expect(parseTickerCikMap({'0':{cik_str:320193,ticker:'aapl',title:'Apple'}})).toEqual({AAPL:'0000320193'}))
  it('uses revenue fallback and converts cumulative Q2/Q3/Q4 into standalone quarters',()=>{const rows=normalizeCompanyFacts('TEST','0000000001',fixture,'2026-03-01'),fy=rows.filter(row=>row.fiscalYear===2025);expect(fy.map(row=>row.revenue)).toEqual([140,160,180,220]);expect(fy.map(row=>row.operatingCashFlow)).toEqual([50,60,70,80]);expect(fy.map(row=>row.capex)).toEqual([10,15,20,25]);expect(fy.map(row=>row.freeCashFlow)).toEqual([40,45,50,55])})
  it('does not mix filings after the requested as-of date',()=>{const rows=normalizeCompanyFacts('TEST','0000000001',fixture,'2025-12-31');expect(rows.some(row=>row.fiscalYear===2025&&row.fiscalQuarter==='Q4')).toBe(false)})
})
