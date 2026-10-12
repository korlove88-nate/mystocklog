import { mkdirSync, writeFileSync } from 'node:fs'

const BASE_URL='https://openapi.tossinvest.com'
const START='2016-01-01',END='2025-12-31',WARMUP_START='2015-01-01'
const PHASE=process.env.EXTERNAL_PHASE??'5.0',OUTPUT=process.env.EXTERNAL_OUTPUT??'phase5_0',IS_SEMICONDUCTOR=PHASE==='5.1',IS_ALL_INTEREST=PHASE==='5.2'
const baselineTickers=(process.env.EXTERNAL_REFERENCE_TICKERS??'AAPL,GOOG,MSFT,AMZN,AVGO,META').split(',').filter(Boolean)
const externalTickers=(process.env.EXTERNAL_TEST_TICKERS??'BRK-B,MU,TSM,ASML,LMT,O').split(',').filter(Boolean)
const allTickers=[...new Set([...baselineTickers,...externalTickers])]
const catalogGroups=JSON.parse(process.env.EXTERNAL_CATALOG_GROUPS??'[]')
const catalogCompanies=JSON.parse(process.env.EXTERNAL_CATALOG_COMPANIES??'{}')
const tickerNames={'BRK-B':'Berkshire Hathaway Class B',NVDA:'NVIDIA',AMD:'Advanced Micro Devices',MU:'Micron Technology',TSM:'Taiwan Semiconductor Manufacturing',ASML:'ASML Holding',LMT:'Lockheed Martin',O:'Realty Income',AAPL:'Apple',GOOG:'Alphabet Class C',MSFT:'Microsoft',AMZN:'Amazon',AVGO:'Broadcom',META:'Meta Platforms'}
const styles={value:['BRK-B'],semiconductor:['MU','TSM','ASML'],defense:['LMT'],dividend:['O']}
const styleNames={value:'대형 가치/복합',semiconductor:'반도체',defense:'방산',dividend:'배당/리츠'}
const valid=value=>typeof value==='number'&&Number.isFinite(value)
const avg=values=>values.length?values.reduce((sum,value)=>sum+value,0)/values.length:null
const median=values=>{const sorted=values.filter(valid).sort((a,b)=>a-b);return!sorted.length?null:sorted.length%2?sorted[(sorted.length-1)/2]:(sorted[sorted.length/2-1]+sorted[sorted.length/2])/2}
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value))
const period=date=>date<='2019-12-31'?'2016~2019':date<='2021-12-31'?'2020~2021':date<='2022-12-31'?'2022':'2023~2025'

async function accessToken(){
  if(!process.env.TOSS_CLIENT_ID||!process.env.TOSS_CLIENT_SECRET)throw new Error('TOSS_CLIENT_ID / TOSS_CLIENT_SECRET이 필요합니다.')
  const response=await fetch(`${BASE_URL}/oauth2/token`,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'client_credentials',client_id:process.env.TOSS_CLIENT_ID,client_secret:process.env.TOSS_CLIENT_SECRET})})
  if(!response.ok)throw new Error(`TOSS OAuth HTTP ${response.status}`)
  const body=await response.json();if(typeof body.access_token!=='string')throw new Error('TOSS OAuth 응답에 access token이 없습니다.')
  return body.access_token
}

async function loadCandles(ticker,token){
  const symbol=ticker==='BRK-B'?'BRK.B':ticker
  let before=null,rows=[]
  for(let page=0;page<100;page++){
    const query=new URLSearchParams({symbol,interval:'1d',count:'200',adjusted:'true'});if(before)query.set('before',before)
    const response=await fetch(`${BASE_URL}/api/v1/candles?${query}`,{headers:{Authorization:`Bearer ${token}`}})
    if(!response.ok)throw new Error(`${ticker} /candles HTTP ${response.status}`)
    const body=await response.json(),candles=body?.result?.candles??[]
    rows.push(...candles.map(candle=>({date:String(candle.timestamp??'').slice(0,10),open:Number(candle.openPrice),high:Number(candle.highPrice),low:Number(candle.lowPrice),close:Number(candle.closePrice),volume:Number(candle.volume)})).filter(row=>row.date.length===10&&[row.open,row.high,row.low,row.close].every(valid)&&row.low>0&&row.low<=row.high))
    const next=body?.result?.nextBefore??null
    if(!next||next===before){before=null;break}
    before=next
  }
  if(before!==null)throw new Error(`${ticker} 이력 페이지 한도에 도달했습니다.`)
  return [...new Map(rows.map(row=>[row.date,row])).values()].sort((a,b)=>a.date.localeCompare(b.date)).filter(row=>row.date<=END)
}

const ma=(points,length)=>points.length<length?null:avg(points.slice(-length).map(point=>point.close))
const atr=points=>{const recent=points.slice(-15);return recent.length<15?null:avg(recent.slice(1).map((point,index)=>Math.max(point.high-point.low,Math.abs(point.high-recent[index].close),Math.abs(point.low-recent[index].close))))}
const annualMdd=(points,year)=>{let peak=-Infinity,mdd=0,count=0;for(const point of points)if(point.date.startsWith(String(year))){peak=Math.max(peak,point.close);mdd=Math.min(mdd,point.close/peak-1);count++}return count>=200?Math.abs(mdd):null}
const mddReference=points=>{const year=Number(points.at(-1).date.slice(0,4)),years=[year-5,year-4,year-3,year-2,year-1],values=years.map(value=>annualMdd(points,value));return values.every(valid)?{years,values,value:avg(values)}:{years,values,value:null}}
const stability=points=>{const ma20=ma(points,20),ma60=ma(points,60),price=points.at(-1).close;if(!valid(ma20)||!valid(ma60)||points.length<25)return 0;const recentLow=Math.min(...points.slice(-5).map(point=>point.low)),priorLow=Math.min(...points.slice(-25,-5).map(point=>point.low));if(recentLow<=priorLow&&price<ma20&&ma20<ma60)return 0;if(price>=ma20&&ma20>=ma60)return 15;if(price>=ma20)return 11;return 5}

function scoreMap(histories,tickers){
  const dates=new Map(),scores=new Map()
  for(const ticker of tickers){const points=histories[ticker];for(let index=251;index<points.length;index++){
    const day=points[index];if(day.date<START||day.date>END)continue
    const past=points.slice(0,index+1),reference=mddReference(past).value;if(!valid(reference))continue
    const high=Math.max(...past.slice(-252).map(point=>point.high)),drawdown=day.close/high-1,row={ticker,date:day.date,drawdown,mdd:30*clamp(Math.abs(drawdown)/reference,0,1),stability:stability(past)}
    const group=dates.get(day.date)??[];group.push(row);dates.set(day.date,group)
  }}
  for(const rows of dates.values()){const ranked=[...rows].sort((a,b)=>a.drawdown-b.drawdown);for(const row of rows){const rank=ranked.findIndex(item=>item.ticker===row.ticker),relative=ranked.length<2?20:20*(ranked.length-1-rank)/(ranked.length-1);scores.set(`${row.ticker}|${row.date}`,Math.round((row.mdd+relative+row.stability)/65*100))}}
  return scores
}

function zone(points,type){
  const current=points.at(-1).close,recent=points.slice(-60),year=points.slice(-252),reference=mddReference(points).value,tolerance=clamp((atr(points)??current*.03)/current*1.25,.015,.08),mas=[60,120,200].map(length=>[`ma${length}`,ma(points,length)])
  const raw=type==='buy'?[['swing60',Math.min(...recent.map(point=>point.low))],['low52',Math.min(...year.map(point=>point.low))],['mdd',reference?Math.max(...year.map(point=>point.high))*(1-reference):null],...mas]:[['swing60',Math.max(...recent.map(point=>point.high))],['high52',Math.max(...year.map(point=>point.high))],['ath',Math.max(...points.map(point=>point.close))],...mas.map(([name,price])=>[name,valid(price)&&price>current?price:null])]
  const items=raw.filter(([,price])=>valid(price)).filter(([name,price])=>!(type==='buy'&&String(name).startsWith('ma')&&price>current)).map(([name,price])=>({name,price}))
  if(!items.length)return null
  let candidates=[];for(const item of items){const group=items.filter(candidate=>Math.abs(candidate.price-item.price)/current<=tolerance);if(group.length>candidates.length)candidates=group}
  if(candidates.length<2){const eligible=items.filter(item=>type==='buy'?item.price<=current*1.15:item.price>=current*.85);candidates=[(eligible.length?eligible:items).sort((a,b)=>Math.abs(a.price-current)-Math.abs(b.price-current))[0]]}
  const make=values=>{const prices=values.map(item=>item.price),mid=median(prices);return{low:Math.min(...prices),high:Math.max(...prices),mid,width:(Math.max(...prices)-Math.min(...prices))/mid}}
  const original=make(candidates),outlier=candidates.length>=3?[...candidates].sort((a,b)=>Math.abs(b.price-original.mid)-Math.abs(a.price-original.mid))[0]:null,trimmed=type==='buy'&&original.width>=.05&&candidates.length>=3&&Boolean(outlier),finalCandidates=trimmed?candidates.filter(item=>item!==outlier):candidates
  return{...make(finalCandidates),candidates,finalCandidates,trimmed,outlier:trimmed?outlier:null,tolerance,current}
}

const equityMdd=curve=>{let peak=-Infinity,mdd=0;for(const point of curve){peak=Math.max(peak,point.value);mdd=Math.min(mdd,point.value/peak-1)}return mdd}
const mergeCurves=curves=>{const dates=[...new Set(curves.flatMap(curve=>curve.map(point=>point.date)))].sort();return dates.map(date=>({date,value:avg(curves.map(curve=>[...curve].reverse().find(point=>point.date<=date)?.value??1))}))}
const metrics=(trades,curve)=>{const closed=trades.filter(trade=>trade.closed);return{entries:trades.length,closed:closed.length,targetRate:trades.length?closed.length/trades.length:null,medianReturn:median(closed.map(trade=>trade.net)),meanReturn:avg(closed.map(trade=>trade.net)),cumulative:curve.length?curve.at(-1).value/curve[0].value-1:null,equityMdd:curve.length?equityMdd(curve):null,meanMae:avg(trades.map(trade=>trade.mae)),medianMae:median(trades.map(trade=>trade.mae)),meanMfe:avg(trades.map(trade=>trade.mfe)),medianMfe:median(trades.map(trade=>trade.mfe)),medianDays:median(closed.map(trade=>trade.days)),open:trades.length-closed.length,openRate:trades.length?(trades.length-closed.length)/trades.length:null}}

function simulate(histories,tickers,label){
  const scores=scoreMap(histories,tickers),trades=[],curves={},perTicker=[],diagnostics={}
  for(const ticker of tickers){const points=histories[ticker],own=[],curve=[];let cash=1,shares=0,position=null,evaluationDays=0,score70=0,zoneTouches=0,evaluationStart=null,evaluationEnd=null
    for(let index=251;index<points.length;index++){const day=points[index];if(day.date<START||day.date>END)continue;const past=points.slice(0,index+1),score=scores.get(`${ticker}|${day.date}`);if(!valid(score))continue;evaluationDays++
      evaluationStart??=day.date;evaluationEnd=day.date;const buy=zone(past,'buy'),sell=zone(past,'sell'),touch=Boolean(buy&&day.low<=buy.high&&day.high>=buy.low);if(score>=70){score70++;if(touch)zoneTouches++}
      if(!position&&score>=70&&touch&&buy&&sell&&sell.mid>buy.mid){shares=cash*.9995/buy.mid;cash=0;position={ticker,entryDate:day.date,entryIndex:index,entry:buy.mid,target:sell.mid,score,low:day.low,high:day.high,buy,sell}}
      else if(position){position.low=Math.min(position.low,day.low);position.high=Math.max(position.high,day.high);if(index>position.entryIndex&&day.high>=position.target){cash=shares*position.target*.9995;own.push({...position,closed:true,exitDate:day.date,days:index-position.entryIndex,net:position.target/position.entry*.99900025-1,mae:Math.min(0,position.low/position.entry-1),mfe:position.high/position.entry-1});shares=0;position=null}}
      curve.push({date:day.date,value:cash+shares*day.close})
    }
    if(position){const last=curve.at(-1),lastIndex=points.findIndex(point=>point.date===last.date);own.push({...position,closed:false,exitDate:last.date,days:lastIndex-position.entryIndex,net:last.value-1,mae:Math.min(0,position.low/position.entry-1),mfe:position.high/position.entry-1})}
    curves[ticker]=curve;trades.push(...own);diagnostics[ticker]={evaluationStart,evaluationEnd,evaluationDays,score70,zoneTouches};perTicker.push({ticker,company:catalogCompanies[ticker]??tickerNames[ticker]??ticker,...diagnostics[ticker],...metrics(own,curve)})
  }
  const curve=mergeCurves(Object.values(curves).filter(item=>item.length));return{label,tickers,scores,trades,curves,curve,diagnostics,perTicker,summary:{...metrics(trades,curve),evaluationDays:Object.values(diagnostics).reduce((sum,row)=>sum+row.evaluationDays,0),score70:Object.values(diagnostics).reduce((sum,row)=>sum+row.score70,0),zoneTouches:Object.values(diagnostics).reduce((sum,row)=>sum+row.zoneTouches,0)}}
}

function structure(histories,tickers){
  const rows=[],perTicker=[]
  for(const ticker of tickers){const points=histories[ticker],own=[];for(let index=251;index<points.length;index++){const day=points[index];if(day.date<START||day.date>END)continue;const past=points.slice(0,index+1);if(!valid(mddReference(past).value))continue;const buy=zone(past,'buy'),sell=zone(past,'sell');if(buy&&sell){const row={ticker,date:day.date,buy,sell};rows.push(row);own.push(row)}}const buys=own.map(row=>row.buy),sells=own.map(row=>row.sell);perTicker.push({ticker,zones:own.length,buyMeanWidth:avg(buys.map(item=>item.width)),buyMedianWidth:median(buys.map(item=>item.width)),sellMeanWidth:avg(sells.map(item=>item.width)),sellMedianWidth:median(sells.map(item=>item.width)),trimApplied:buys.filter(item=>item.trimmed).length,mddCandidateIncludedRate:buys.length?buys.filter(item=>item.finalCandidates.some(candidate=>candidate.name==='mdd')).length/buys.length:null,mddOutlier:buys.filter(item=>item.outlier?.name==='mdd').length})}
  const buys=rows.map(row=>row.buy),sells=rows.map(row=>row.sell);return{rows,perTicker,summary:{zones:rows.length,buyMeanWidth:avg(buys.map(item=>item.width)),buyMedianWidth:median(buys.map(item=>item.width)),sellMeanWidth:avg(sells.map(item=>item.width)),sellMedianWidth:median(sells.map(item=>item.width)),trimApplied:buys.filter(item=>item.trimmed).length,mddCandidateIncludedRate:buys.length?buys.filter(item=>item.finalCandidates.some(candidate=>candidate.name==='mdd')).length/buys.length:null,mddOutlier:buys.filter(item=>item.outlier?.name==='mdd').length}}
}

const token=await accessToken(),histories={}
for(const ticker of allTickers){histories[ticker]=await loadCandles(ticker,token);console.log(`TOSS candles loaded: ${ticker} ${histories[ticker][0]?.date}~${histories[ticker].at(-1)?.date} · ${histories[ticker].length}`)}
const availability=allTickers.map(ticker=>({ticker,company:catalogCompanies[ticker]??tickerNames[ticker]??ticker,firstDate:histories[ticker][0]?.date??null,lastDate:histories[ticker].at(-1)?.date??null,count:histories[ticker].length,warmupStart:histories[ticker].find(point=>point.date>=WARMUP_START)?.date??null,testStart:histories[ticker].find(point=>point.date>=START)?.date??null,testEnd:[...histories[ticker]].reverse().find(point=>point.date<=END)?.date??null}))
const externalSimulation=simulate(histories,externalTickers,IS_ALL_INTEREST?'관심종목 전체':'신규 외부검증군'),externalStructure=structure(histories,externalTickers)
const simulations={baseline:simulate(histories,baselineTickers,'기존 기준군'),external:externalSimulation,combined:IS_ALL_INTEREST?externalSimulation:simulate(histories,allTickers,'전체 통합 참고')}
const structures={baseline:structure(histories,baselineTickers),external:externalStructure,combined:IS_ALL_INTEREST?externalStructure:structure(histories,allTickers)}
const groupSummary=Object.entries(simulations).map(([group,simulation])=>({group,label:simulation.label,...simulation.summary,...structures[group].summary}))
const externalByTicker=simulations.external.perTicker.map(row=>({...row,...structures.external.perTicker.find(item=>item.ticker===row.ticker)}))
const styleSummary=IS_SEMICONDUCTOR?[]:Object.entries(styles).map(([style,tickers])=>{const simulation=simulations.external,curve=mergeCurves(tickers.map(ticker=>simulation.curves[ticker]));return{style,label:styleNames[style],tickers,...metrics(simulation.trades.filter(trade=>tickers.includes(trade.ticker)),curve)}})
const periodSummary=['2016~2019','2020~2021','2022','2023~2025'].map(label=>({period:label,...metrics(simulations.external.trades.filter(trade=>period(trade.entryDate)===label),simulations.external.curve.filter(point=>period(point.date)===label))}))
const scoreBuckets=[{label:'70~74',min:70,max:74},{label:'75~79',min:75,max:79},{label:'80+',min:80,max:Infinity}].map(bucket=>({bucket:bucket.label,...metrics(simulations.external.trades.filter(trade=>trade.score>=bucket.min&&trade.score<=bucket.max),[])}))
const leaveOneOut=externalTickers.map(excluded=>{const tickers=externalTickers.filter(ticker=>ticker!==excluded),simulation=simulations.external,curve=mergeCurves(tickers.map(ticker=>simulation.curves[ticker]));return{excluded,...metrics(simulation.trades.filter(trade=>trade.ticker!==excluded),curve)}})
const yearComplete=(ticker,year)=>histories[ticker].filter(point=>point.date.startsWith(String(year))).length>=200
const availabilityDetailed=availability.map(row=>{const diagnostic=simulations.external.diagnostics[row.ticker]??simulations.baseline.diagnostics[row.ticker],long=Array.from({length:15},(_,index)=>2011+index).every(year=>yearComplete(row.ticker,year)),classification=long?'장기검증군':diagnostic?.evaluationDays>0?'부분기간검증군':'MDD 데이터 부족군';return{...row,categories:catalogGroups.filter(group=>group.tickers.includes(row.ticker)).map(group=>group.name),verificationStart:diagnostic?.evaluationStart??null,verificationEnd:diagnostic?.evaluationEnd??null,classification}})
const longTickers=availabilityDetailed.filter(row=>row.classification==='장기검증군').map(row=>row.ticker),partialTickers=availabilityDetailed.filter(row=>row.classification==='부분기간검증군').map(row=>row.ticker),mddInsufficientTickers=availabilityDetailed.filter(row=>row.classification==='MDD 데이터 부족군').map(row=>row.ticker)
const subset=(tickers,simulation=simulations.external)=>{const usable=tickers.filter(ticker=>simulation.curves[ticker]?.length),curve=mergeCurves(usable.map(ticker=>simulation.curves[ticker])),trades=simulation.trades.filter(trade=>tickers.includes(trade.ticker));return{tickers:usable,stockCount:usable.length,...metrics(trades,curve)}}
const structureSubset=tickers=>{const rows=structures.external.rows.filter(row=>tickers.includes(row.ticker)),buys=rows.map(row=>row.buy),sells=rows.map(row=>row.sell);return{zones:rows.length,buyMeanWidth:avg(buys.map(item=>item.width)),buyMedianWidth:median(buys.map(item=>item.width)),sellMeanWidth:avg(sells.map(item=>item.width)),sellMedianWidth:median(sells.map(item=>item.width))}}
const annualizedVolatility=ticker=>{const points=histories[ticker].filter(point=>point.date>='2021-01-01'&&point.date<='2025-12-31'),returns=[];for(let index=1;index<points.length;index++)returns.push(points[index].close/points[index-1].close-1);if(returns.length<252)return null;const mean=avg(returns),variance=avg(returns.map(value=>(value-mean)**2));return Math.sqrt(variance*252)}
const volatilityRows=externalTickers.map(ticker=>({ticker,volatility:annualizedVolatility(ticker)})),highVolatilityTickers=volatilityRows.filter(row=>valid(row.volatility)&&row.volatility>=.5).map(row=>row.ticker),evaluatedTickers=[...longTickers,...partialTickers],highVolatilityResult={...subset(evaluatedTickers.filter(ticker=>highVolatilityTickers.includes(ticker))),...structureSubset(evaluatedTickers.filter(ticker=>highVolatilityTickers.includes(ticker)))},normalVolatilityResult={...subset(evaluatedTickers.filter(ticker=>!highVolatilityTickers.includes(ticker))),...structureSubset(evaluatedTickers.filter(ticker=>!highVolatilityTickers.includes(ticker)))}
const longResult={...subset(longTickers),...structureSubset(longTickers)},partialResult={...subset(partialTickers),...structureSubset(partialTickers)}
const categoryResults=catalogGroups.map(group=>{const memberTickers=group.tickers.filter(ticker=>externalTickers.includes(ticker)),validTickers=memberTickers.filter(ticker=>evaluatedTickers.includes(ticker)),base={category:group.name,totalStocks:memberTickers.length,validStocks:validTickers.length,mddInsufficient:memberTickers.filter(ticker=>mddInsufficientTickers.includes(ticker)).length,...subset(validTickers),...structureSubset(validTickers)},scoreBuckets=[{label:'70~74',min:70,max:74},{label:'75~79',min:75,max:79},{label:'80+',min:80,max:Infinity}].map(bucket=>({bucket:bucket.label,...metrics(simulations.external.trades.filter(trade=>validTickers.includes(trade.ticker)&&trade.score>=bucket.min&&trade.score<=bucket.max),[])})),period2022=metrics(simulations.external.trades.filter(trade=>validTickers.includes(trade.ticker)&&period(trade.entryDate)==='2022'),mergeCurves(validTickers.map(ticker=>simulations.external.curves[ticker]).filter(Boolean)).filter(point=>period(point.date)==='2022')),loo=validTickers.length>=3?validTickers.map(excluded=>{const selected=validTickers.filter(ticker=>ticker!==excluded);return{excluded,...subset(selected)}}):[];let validity='D. 표본 부족';if(base.entries>=12&&base.validStocks>=3&&base.targetRate>=.85&&base.medianReturn>0&&base.meanMae>=-.25)validity='A. 유효';else if(base.entries>=6&&base.validStocks>=2&&base.targetRate>=.7&&base.medianReturn>0)validity='B. 조건부 유효';else if(base.entries>=6&&((base.targetRate??0)<.7||(base.medianReturn??0)<=0))validity='C. 유효성 낮음';return{...base,period2022,scoreBuckets,loo,validity}})
const longLeaveOneOut=longTickers.map(excluded=>{const selected=longTickers.filter(ticker=>ticker!==excluded);return{excluded,...subset(selected)}})
const external=simulations.external.summary,baseline=simulations.baseline.summary,closedTickerCount=externalByTicker.filter(row=>row.closed>0).length,medianReturns=externalByTicker.map(row=>row.medianReturn).filter(valid),tickerSpread=medianReturns.length?Math.max(...medianReturns)-Math.min(...medianReturns):null,looMedian=leaveOneOut.map(row=>row.medianReturn).filter(valid),looSpread=looMedian.length?Math.max(...looMedian)-Math.min(...looMedian):null
let verdict='A. 신규군에서도 구조적으로 안정적'
if(external.entries<20||closedTickerCount<4)verdict='E. 표본 부족으로 판단 보류'
else if((external.medianReturn??-Infinity)<(baseline.medianReturn??0)*.65||(external.targetRate??0)<(baseline.targetRate??0)-.15||(external.equityMdd??-1)<(baseline.equityMdd??0)-.08)verdict='D. 기존 대형주 편향 가능성 있음'
else if((tickerSpread??0)>.25||(looSpread??0)>.08)verdict='C. 종목별 편차가 커 추가 분리검증 필요'
else if(styleSummary.filter(row=>row.entries>=3&&row.targetRate!==null&&row.targetRate<.5).length)verdict='B. 일부 산업군에서만 안정적'
if(IS_SEMICONDUCTOR){
  if(external.entries<12||closedTickerCount<3)verdict='E. 표본 부족'
  else if((external.medianReturn??-Infinity)<(baseline.medianReturn??0)*.65||(external.targetRate??0)<(baseline.targetRate??0)-.15)verdict='D. 기존 NVDA/AVGO 편향 가능성 있음'
  else if((tickerSpread??0)>.25||(looSpread??0)>.08)verdict='C. 종목별 편차가 커 추가 분리 필요'
  else if(externalByTicker.some(row=>row.entries>=3&&(row.targetRate??0)<.7))verdict='B. 일부 반도체 유형에서만 안정적'
  else verdict='A. 반도체 4종목에서도 구조적으로 안정적'
}
if(IS_ALL_INTEREST){
  const low=categoryResults.filter(row=>row.validity.startsWith('C.')).length,insufficient=categoryResults.filter(row=>row.validity.startsWith('D.')).length
  if(mddInsufficientTickers.length>=Math.ceil(externalTickers.length/3)||insufficient>=4)verdict='E. 데이터/표본 부족으로 판단 보류'
  else if(low>=2)verdict='C. 특정 카테고리 중심으로만 유효'
  else if(low===1||insufficient>0)verdict='B. 대부분 적용 가능, 일부 카테고리 주의'
  else verdict='A. 관심종목 전체에 폭넓게 적용 가능'
}
const conclusion=`${verdict} · 참고군 ${baselineTickers.length}종목과 신규 검증군 ${externalTickers.length}종목은 상대낙폭 순위를 서로 섞지 않고 독립 시뮬레이션했으며, 통합 ${allTickers.length}종목은 참고값으로만 계산했습니다. 운영 알고리즘 변경은 0건입니다.`
const date=new Date().toISOString().slice(0,10),runId=`phase${PHASE.replace('.','-')}-${date}`
const commonSections=[['availability','데이터 가용성',availability],['comparison',IS_SEMICONDUCTOR?'반도체 통합':'그룹 비교',groupSummary],...(!IS_SEMICONDUCTOR?[['style','산업·스타일별',styleSummary]]:[]),['period','기간별',periodSummary],['score','점수구간별',scoreBuckets],['loo','Leave-One-Stock-Out',leaveOneOut],['reference',IS_SEMICONDUCTOR?'기존 NVDA/AVGO 참고 비교':'기존 기준군',simulations.baseline.perTicker.map(row=>({...row,...structures.baseline.perTicker.find(item=>item.ticker===row.ticker)}))],['conclusion','최종 판정',[{label:'판정',value:verdict},{label:'운영 변경',value:'0건'},{label:'근거',value:conclusion}]]]
const allInterestSections=[['availability','데이터 가용성',availabilityDetailed],['tickers','전체 종목 결과',externalByTicker],['long','장기검증군',[longResult]],['partial','부분기간검증군',[partialResult]],['insufficient','MDD 데이터 부족군',availabilityDetailed.filter(row=>row.classification==='MDD 데이터 부족군')],['category','카테고리별',categoryResults],['volatility','고변동군 vs 일반군',[{group:'고변동군',...highVolatilityResult},{group:'일반군',...normalVolatilityResult}]],['period','기간별',periodSummary],['score','점수구간별',scoreBuckets],['loo','Leave-One-Stock-Out',longLeaveOneOut],['conclusion','최종 판정',[{label:'판정',value:verdict},{label:'운영 변경',value:'0건'},{label:'근거',value:conclusion}]]]
const sectionRows=IS_ALL_INTEREST?allInterestSections:IS_SEMICONDUCTOR?[commonSections[0],...externalByTicker.map(row=>[row.ticker.toLowerCase(),row.ticker,[row]]),...commonSections.slice(1)]:[commonSections[0],['external','신규 6종목',externalByTicker],...commonSections.slice(1)]
const sections=sectionRows.map(([id,title,rows],index)=>({id:`${runId}-${id}`,parentId:null,sectionType:'report',title,summary:'TOSS 전체 장기 일봉 · 2015 워밍업 · 2016~2025 · 미래정보 차단 · Fixed 차익관리',reportData:{rows},sortOrder:index+1}))
const run={id:runId,runDate:date,phase:IS_ALL_INTEREST?'5.2차 · 관심종목 전체 외부검증':IS_SEMICONDUCTOR?'5.1차 · 반도체 확장 외부검증':'5.0차 · 관심종목 1차 외부검증',title:IS_ALL_INTEREST?'관심종목 전체 외부검증':IS_SEMICONDUCTOR?'반도체 확장 외부검증':'관심종목 1차 외부검증',algorithmVersion:`BT-v${PHASE}`,periodStart:START,periodEnd:END,universe:IS_ALL_INTEREST?`Supabase 관심종목 ${externalTickers.length} · SPCX 제외`:`참고군 ${baselineTickers.length} · 신규 외부검증군 ${externalTickers.length} · 통합 ${allTickers.length} 참고`,config:{scoreThreshold:70,weights:'30/20/15',mdd:'직전 5개 완료연도 Mean',mddUsage:'Dual · score + buy-zone candidate',maDirection:true,maSlope:false,atrMultiplier:1.25,minTolerance:.015,atrCap:.08,zone:'min~max',trim:'폭>=5% · 후보>=3 · outlier 1개 제거',fixedTarget:'entry-day sell midpoint',groups:{reference:baselineTickers,external:externalTickers,combined:allTickers},operatingAlgorithmChanged:false},summary:{availability:IS_ALL_INTEREST?availabilityDetailed:availability,groups:groupSummary,externalByTicker,styleSummary,periodSummary,scoreBuckets,leaveOneOut:IS_ALL_INTEREST?longLeaveOneOut:leaveOneOut,longResult,partialResult,mddInsufficientTickers,categoryResults,highVolatilityResult,normalVolatilityResult,verdict},conclusion,createdAt:new Date().toISOString(),sections}
mkdirSync('backtest/results',{recursive:true})
writeFileSync(`backtest/results/${OUTPUT}-summary.json`,JSON.stringify(run,null,2))
writeFileSync(`backtest/results/${OUTPUT}-full.json`,JSON.stringify({run,trades:Object.fromEntries(Object.entries(simulations).map(([key,value])=>[key,value.trades])),curves:Object.fromEntries(Object.entries(simulations).map(([key,value])=>[key,value.curve])),structures:Object.fromEntries(Object.entries(structures).map(([key,value])=>[key,{summary:value.summary,perTicker:value.perTicker}]))},null,2))

async function supabaseUpsert(table,rows,onConflict){
  const base=process.env.SUPABASE_URL?.replace(/\/$/,'')??'',key=process.env.SUPABASE_SERVICE_ROLE_KEY??process.env.SUPABASE_SECRET_KEY??''
  if(!base||!key)return false
  const response=await fetch(`${base}/rest/v1/${table}?on_conflict=${encodeURIComponent(onConflict)}`,{method:'POST',headers:{apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json',Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify(rows)})
  if(!response.ok)throw new Error(`Supabase ${table} HTTP ${response.status}: ${await response.text()}`)
  return true
}
let storage='local-only'
if(!process.env.BACKTEST_LOCAL_ONLY&&(process.env.SUPABASE_SERVICE_ROLE_KEY||process.env.SUPABASE_SECRET_KEY)){
  await supabaseUpsert('backtest_runs',[{id:run.id,run_date:run.runDate,phase:run.phase,title:run.title,algorithm_version:run.algorithmVersion,period_start:run.periodStart,period_end:run.periodEnd,universe:run.universe,config_json:run.config,summary_json:run.summary,conclusion:run.conclusion,created_at:run.createdAt}],'id')
  await supabaseUpsert('backtest_sections',sections.map(section=>({id:section.id,run_id:run.id,parent_id:section.parentId,section_type:section.sectionType,title:section.title,summary:section.summary,report_data_json:section.reportData,sort_order:section.sortOrder})),'id')
  storage='Supabase saved'
}
console.log(JSON.stringify({storage,runId,groups:groupSummary,externalByTicker,styleSummary,periodSummary,scoreBuckets,leaveOneOut,verdict},null,2))
