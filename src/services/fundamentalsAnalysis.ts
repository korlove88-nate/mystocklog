import type { FundamentalHistoryPoint, MetricValue, PriceStability, StockSnapshot } from '../types'

export type EpsDirection='상승'|'보합'|'하락'
export type QuarterlyFundamental={quarter:string;completed:boolean;eps:number|null;epsChange:number|null;perAverage:number|null;perMin:number|null;perMax:number|null;perEnd:number|null}
export type QuarterlyAnalysis={quarters:QuarterlyFundamental[];completed:QuarterlyFundamental[];recent3:QuarterlyFundamental[];ready:boolean;epsDirection:EpsDirection|null;perAverage3:number|null;perDifference:number|null}

const quarterKey=(date:string)=>`${date.slice(0,4)}-Q${Math.floor((Number(date.slice(5,7))-1)/3)+1}`
const currentQuarter=(now:Date)=>`${now.getUTCFullYear()}-Q${Math.floor(now.getUTCMonth()/3)+1}`
export function analyzeQuarterlyFundamentals(points:FundamentalHistoryPoint[],currentPer:MetricValue,now=new Date()):QuarterlyAnalysis{
  const grouped=new Map<string,FundamentalHistoryPoint[]>();for(const point of points){const key=quarterKey(point.snapshotDate),rows=grouped.get(key)??[];rows.push(point);grouped.set(key,rows)}
  const quarters:QuarterlyFundamental[]=[...grouped.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([quarter,rows])=>{const ordered=[...rows].sort((a,b)=>a.snapshotDate.localeCompare(b.snapshotDate)),eps=ordered.filter(row=>typeof row.eps==='number').at(-1)?.eps??null,pers=ordered.filter(row=>typeof row.per==='number').map(row=>row.per as number);return{quarter,completed:quarter!==currentQuarter(now),eps:eps as number|null,epsChange:null,perAverage:pers.length?pers.reduce((a,b)=>a+b,0)/pers.length:null,perMin:pers.length?Math.min(...pers):null,perMax:pers.length?Math.max(...pers):null,perEnd:pers.at(-1)??null}})
  quarters.forEach((quarter,index)=>{const previous=quarters.slice(0,index).reverse().find(item=>item.eps!==null)?.eps;quarter.epsChange=quarter.eps!==null&&typeof previous==='number'&&previous!==0?quarter.eps/previous-1:null})
  const completed=quarters.filter(quarter=>quarter.completed&&quarter.eps!==null&&quarter.perAverage!==null),recent3=completed.slice(-3),ready=recent3.length===3
  let epsDirection:EpsDirection|null=null;if(ready){const first=recent3[0].eps!,last=recent3[2].eps!,change=first===0?0:last/first-1;epsDirection=change>.03?'상승':change<-.03?'하락':'보합'}
  const perAverage3=ready?recent3.reduce((sum,item)=>sum+item.perAverage!,0)/3:null,perDifference=perAverage3&&typeof currentPer==='number'?currentPer/perAverage3-1:null
  return{quarters,completed,recent3,ready,epsDirection,perAverage3,perDifference}
}

const clamp=(value:number,min=0,max=1)=>Math.max(min,Math.min(max,value))
export function opportunityScore(stock:StockSnapshot,peers:StockSnapshot[],analysis=analyzeQuarterlyFundamentals(stock.fundamentalsHistory??[],stock.pe)){
  const items:{key:string;label:string;score:number|null;max:number;status:string}[]=[]
  const mddValues=Object.values(stock.mdd).filter((value):value is number=>typeof value==='number'),reference=mddValues.length?[...mddValues].sort((a,b)=>Math.abs(a)-Math.abs(b))[Math.floor(mddValues.length/2)]:null,mddRatio=typeof stock.drawdown52==='number'&&reference?Math.abs(stock.drawdown52)/Math.abs(reference):null
  items.push({key:'mdd',label:'가격 위치',score:mddRatio===null?null:30*clamp(mddRatio),max:30,status:mddRatio===null?'데이터 없음':mddRatio>=.8?'MDD 근접':mddRatio>=.5?'MDD 관찰':'MDD 여유'})
  const ranked=peers.filter(peer=>typeof peer.drawdown52==='number').sort((a,b)=>a.drawdown52!-b.drawdown52!),rank=ranked.findIndex(peer=>peer.ticker===stock.ticker),relative=rank<0?null:ranked.length===1?20:20*(ranked.length-1-rank)/(ranked.length-1)
  items.push({key:'relative',label:'상대 낙폭',score:relative,max:20,status:rank<0?'데이터 없음':`그룹 ${rank+1}위`})
  const epsScore=analysis.ready?analysis.epsDirection==='상승'?20:analysis.epsDirection==='보합'?10:0:null
  items.push({key:'eps',label:'EPS 추세',score:epsScore,max:20,status:analysis.ready?analysis.epsDirection!:`분기 데이터 ${analysis.completed.length}/3`})
  const d=analysis.perDifference,perScore=!analysis.ready||d===null?null:d<=-.2?15:d<=-.1?12:d<=0?9:d<=.1?6:d<=.2?3:0
  items.push({key:'per',label:'PER 위치',score:perScore,max:15,status:analysis.ready&&d!==null?`3분기 평균 대비 ${(d*100).toFixed(1)}%`:`분기 데이터 ${analysis.completed.length}/3`})
  const stabilityScores:Record<PriceStability,number>={'하락 지속':0,'관찰':5,'안정 시도':11,'안정':15},stability=stock.priceStability??null
  items.push({key:'stability',label:'가격 안정성',score:stability?stabilityScores[stability]:null,max:15,status:stability??'데이터 없음'})
  const available=items.filter(item=>item.score!==null),earned=available.reduce((sum,item)=>sum+item.score!,0),maximum=available.reduce((sum,item)=>sum+item.max,0),score=maximum?Math.round(earned/maximum*100):null,completeness=maximum
  return{score,completeness,status:score===null?'데이터 축적 중':score>=80?'조건 충족 높음':score>=60?'관찰 우선':'조건 충족 낮음',items}
}
