import type { CompanyQualityAxis, CompanyQualityEvaluation, MetricValue, SecFinancialQuarter } from '../types'

type Item={value:MetricValue;score:(value:number)=>number;weight:number}
const clamp=(value:number,min=0,max=1)=>Math.max(min,Math.min(max,value))
const growthScore=(value:number)=>clamp((value+.1)/.4)
const marginScore=(value:number,target:number)=>clamp(value/target)
const trend=(values:MetricValue[])=>{
  const clean=values.filter((value):value is number=>typeof value==='number').slice(-4)
  if(clean.length<3)return'데이터 부족'
  const changes=clean.slice(1).map((value,index)=>value-clean[index]),positive=changes.filter(value=>value>0).length,negative=changes.filter(value=>value<0).length,total=Math.abs(clean[0])||1,change=(clean.at(-1)!-clean[0])/total
  if(positive===changes.length&&change>.05)return'개선'
  if(negative===changes.length&&change<-.05)return'악화'
  if(change<-.05||negative>positive)return'둔화'
  return'안정'
}
const trendScore=(value:string)=>value==='개선'?1:value==='안정'?0.7:value==='둔화'?0.35:value==='악화'?0:NaN
const yoy=(latest:MetricValue,prior:MetricValue)=>typeof latest==='number'&&typeof prior==='number'&&prior!==0?latest/prior-1:null
const ratio=(a:MetricValue,b:MetricValue)=>typeof a==='number'&&typeof b==='number'&&b!==0?a/b:null
const axis=(key:CompanyQualityAxis['key'],label:string,max:number,items:Item[],interpretation:string):CompanyQualityAxis=>{
  const available=items.filter(item=>typeof item.value==='number'&&Number.isFinite(item.value)),availableWeight=available.reduce((sum,item)=>sum+item.weight,0),earned=available.reduce((sum,item)=>sum+item.score(item.value as number)*item.weight,0)
  return{key,label,max,score:availableWeight?Math.round(earned/availableWeight*max):null,completeness:Math.round(availableWeight/max*100),interpretation}
}
export function evaluateCompanyQuality(quarters:SecFinancialQuarter[]):CompanyQualityEvaluation{
  const rows=[...quarters].sort((a,b)=>a.periodEnd.localeCompare(b.periodEnd)).slice(-8),latest=rows.at(-1),priorYear=latest?rows.find(row=>row.periodEnd<latest.periodEnd&&row.fiscalQuarter===latest.fiscalQuarter&&row.fiscalYear===latest.fiscalYear-1):undefined
  const revenueYoy=yoy(latest?.revenue??null,priorYear?.revenue??null),epsYoy=yoy(latest?.epsDiluted??latest?.epsBasic??null,priorYear?.epsDiluted??priorYear?.epsBasic??null),operatingMargin=ratio(latest?.operatingIncome??null,latest?.revenue??null),netMargin=ratio(latest?.netIncome??null,latest?.revenue??null)
  const previous=rows.at(-2),averageEquity=typeof latest?.stockholdersEquity==='number'&&typeof previous?.stockholdersEquity==='number'?(latest.stockholdersEquity+previous.stockholdersEquity)/2:null,roe=ratio(latest?.netIncome??null,averageEquity),debtToEquity=ratio(latest?.totalDebt??null,latest?.stockholdersEquity??null),cashToDebt=ratio(latest?.cash??null,latest?.totalDebt??null)
  const revenueDirection=trend(rows.map(row=>row.revenue)),epsDirection=trend(rows.map(row=>row.epsDiluted??row.epsBasic)),operatingIncomeDirection=trend(rows.map(row=>row.operatingIncome)),fcfDirection=trend(rows.map(row=>row.freeCashFlow))
  const axes=[
    axis('growth','성장성',30,[{value:revenueYoy,score:growthScore,weight:15},{value:epsYoy,score:growthScore,weight:15}],revenueYoy!==null&&epsYoy!==null?(revenueYoy>0&&epsYoy>0?'매출과 이익이 함께 증가하는 흐름입니다.':'매출과 이익의 성장 방향이 엇갈립니다.'):'전년 동기 비교 데이터가 더 필요합니다.'),
    axis('profitability','수익성',25,[{value:operatingMargin,score:value=>marginScore(value,.3),weight:10},{value:netMargin,score:value=>marginScore(value,.25),weight:8},{value:roe,score:value=>marginScore(value,.08),weight:7}],operatingMargin!==null&&netMargin!==null?(operatingMargin>.2&&netMargin>.15?'높은 수익성을 유지하고 있습니다.':'수익성 수준과 변화 방향을 함께 확인해야 합니다.'):'수익성 데이터가 부족합니다.'),
    axis('health','재무건전성',25,[{value:latest?.freeCashFlow??null,score:value=>value>0?1:0,weight:8},{value:debtToEquity,score:value=>clamp(1-value/2),weight:8},{value:cashToDebt,score:value=>clamp(value),weight:5},{value:trendScore(fcfDirection),score:value=>value,weight:4}],latest?.freeCashFlow!==null&&latest?.freeCashFlow!==undefined?(latest.freeCashFlow>0?'현금흐름이 양수이며 재무여력을 확인할 수 있습니다.':'잉여현금흐름이 음수입니다.'):'현금흐름 데이터가 부족합니다.'),
    axis('direction','실적 방향',20,[revenueDirection,epsDirection,operatingIncomeDirection,fcfDirection].map(value=>({value:trendScore(value),score:score=>score,weight:5})),[revenueDirection,epsDirection,operatingIncomeDirection,fcfDirection].filter(value=>value==='개선').length>=2?'최근 실적 흐름은 전반적으로 개선 중입니다.':'최근 실적 항목별 방향이 혼재합니다.'),
  ]
  const available=axes.reduce((sum,item)=>sum+item.max*item.completeness/100,0),earned=axes.reduce((sum,item)=>sum+(item.score??0)*item.completeness/100,0),completeness=Math.round(available),score=available>=50?Math.round(earned/available*100):null
  const grade=score===null?'평가 데이터 부족':score>=90?'매우 우수':score>=80?'우수':score>=70?'양호':score>=60?'보통':score>=50?'주의':'취약'
  return{score,grade,completeness,status:score===null?'insufficient':'ready',summary:score===null?'SEC 공식 재무데이터가 더 필요합니다.':`가격과 무관한 SEC 재무데이터 기준 기업 상태는 ${grade}입니다.`,asOf:latest?.periodEnd??null,source:'SEC',axes,metrics:{revenueYoy,epsYoy,operatingMargin,netMargin,roe,debtToEquity,cashToDebt,freeCashFlow:latest?.freeCashFlow??null,revenueDirection,epsDirection,operatingIncomeDirection,fcfDirection}}
}

export function explainCompanyQuality(evaluation:CompanyQualityEvaluation,latest:SecFinancialQuarter){
  const {score,metrics}=evaluation
  const headline=score===null?'공식 재무데이터가 더 쌓여야 기업 상태를 판단할 수 있습니다.':score>=80?'성장성·수익성·재무상태가 전반적으로 탄탄한 편입니다.':score>=70?'전반적으로 양호하지만 일부 약한 항목을 함께 확인해야 합니다.':score>=60?'좋은 항목과 약한 항목이 섞여 있어 세부 확인이 필요합니다.':'현재 재무지표에서 수익성 또는 현금흐름 부담이 확인됩니다.'
  const revenue=metrics.revenueYoy,eps=metrics.epsYoy
  const growth=typeof revenue!=='number'||typeof eps!=='number'?'전년 동기 비교 데이터가 부족해 성장 속도는 아직 판단하기 어렵습니다.':revenue>.05&&eps>.05?'매출과 주당이익(EPS)이 함께 늘어 성장의 질이 좋은 흐름입니다.':revenue>.05&&eps<=0?'매출은 늘었지만 EPS는 감소했습니다. 외형 성장만큼 이익이 따라오는지 확인해야 합니다.':revenue<=0&&eps>0?'매출은 줄었지만 EPS는 늘었습니다. 비용 절감 등으로 이익이 개선됐을 수 있습니다.':'매출과 EPS가 전년보다 줄어 실적 둔화가 나타납니다.'
  const operatingMargin=metrics.operatingMargin,netMargin=metrics.netMargin
  const profitability=typeof operatingMargin!=='number'||typeof netMargin!=='number'?'이익률 데이터가 부족해 수익성을 판단하기 어렵습니다.':operatingMargin>=.2&&netMargin>=.15?'매출에서 실제 이익으로 남는 비율이 높은 편입니다.':operatingMargin>=.1&&netMargin>=.08?'수익성은 보통 수준이며 개선 여부를 이어서 확인할 필요가 있습니다.':'매출 대비 남는 이익이 적어 수익성이 약한 편입니다.'
  const cashFlow=typeof latest.freeCashFlow!=='number'?'잉여현금흐름(FCF) 계산에 필요한 데이터가 부족합니다.':latest.freeCashFlow>0?'영업활동과 투자지출 후에도 현금이 남아 현금창출력이 양수입니다.':'영업현금흐름에서 투자지출을 뺀 FCF가 음수라, 현재는 투자 후 남는 현금이 부족합니다.'
  return{headline,points:[growth,profitability,cashFlow]}
}
