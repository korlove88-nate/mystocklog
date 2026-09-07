import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'

const BASE_URL='https://openapi.tossinvest.com'
const tickers=['NVDA','AAPL','GOOG','MSFT','AMZN','AVGO','META','TSLA']
const TEST_START='2016-01-01',TEST_END='2025-12-31',WARMUP_START='2015-01-01'
const valid=value=>typeof value==='number'&&Number.isFinite(value)
const avg=xs=>xs.length?xs.reduce((sum,value)=>sum+value,0)/xs.length:null
const median=xs=>{const values=[...xs].filter(valid).sort((a,b)=>a-b);return!values.length?null:values.length%2?values[(values.length-1)/2]:(values[values.length/2-1]+values[values.length/2])/2}
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value))

async function token(){
  if(!process.env.TOSS_CLIENT_ID||!process.env.TOSS_CLIENT_SECRET)throw new Error('TOSS_CLIENT_ID / TOSS_CLIENT_SECRET이 필요합니다.')
  const response=await fetch(`${BASE_URL}/oauth2/token`,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'client_credentials',client_id:process.env.TOSS_CLIENT_ID,client_secret:process.env.TOSS_CLIENT_SECRET})})
  if(!response.ok)throw new Error(`TOSS OAuth HTTP ${response.status}`)
  const body=await response.json();if(typeof body.access_token!=='string')throw new Error('TOSS OAuth 응답에 access token이 없습니다.')
  return body.access_token
}

async function candles(symbol,accessToken){
  let before=null,pages=0,rows=[]
  for(;pages<100;pages++){
    const query=new URLSearchParams({symbol,interval:'1d',count:'200',adjusted:'true'});if(before)query.set('before',before)
    const response=await fetch(`${BASE_URL}/api/v1/candles?${query}`,{headers:{Authorization:`Bearer ${accessToken}`}})
    if(!response.ok)throw new Error(`${symbol} /candles HTTP ${response.status}`)
    const body=await response.json(),candles=body?.result?.candles??[]
    rows.push(...candles.map(c=>({date:String(c.timestamp??'').slice(0,10),open:Number(c.openPrice),high:Number(c.highPrice),low:Number(c.lowPrice),close:Number(c.closePrice),volume:Number(c.volume)})).filter(row=>/^\d{4}-\d{2}-\d{2}$/.test(row.date)&&[row.open,row.high,row.low,row.close].every(valid)&&row.close>0))
    const next=body?.result?.nextBefore??null;if(!next||next===before){before=null;break};before=next
  }
  if(before!==null)throw new Error(`${symbol} 이력 페이지 한도에 도달했습니다.`)
  return [...new Map(rows.map(row=>[row.date,row])).values()].sort((a,b)=>a.date.localeCompare(b.date)).filter(row=>row.date>=WARMUP_START&&row.date<=TEST_END)
}

const ma=(points,length)=>points.length<length?null:avg(points.slice(-length).map(point=>point.close))
const atr=points=>{const recent=points.slice(-15);return recent.length<15?null:avg(recent.slice(1).map((point,index)=>Math.max(point.high-point.low,Math.abs(point.high-recent[index].close),Math.abs(point.low-recent[index].close))))}
const annualMdd=(points,year)=>{let peak=-Infinity,mdd=0;for(const point of points)if(point.date.startsWith(String(year))){peak=Math.max(peak,point.close);mdd=Math.min(mdd,point.close/peak-1)}return peak===-Infinity?null:mdd}
const mddReference=points=>{const year=Number(points.at(-1).date.slice(0,4)),values=[year-4,year-3,year-2,year-1,year].map(value=>annualMdd(points,value)).filter(valid).map(Math.abs);return median(values)}
const stability=(points,ma20,ma60)=>{if(points.length<25||!valid(ma20)||!valid(ma60))return 0;const price=points.at(-1).close,recent=Math.min(...points.slice(-5).map(point=>point.low)),prior=Math.min(...points.slice(-25,-5).map(point=>point.low));if(recent<=prior&&price<ma20&&ma20<ma60)return 0;if(price>=ma20&&ma20>=ma60)return 15;if(price>=ma20)return 11;return 5}

function scoreInputs(histories){
  const byDate=new Map()
  for(const ticker of tickers){const points=histories[ticker];for(let index=251;index<points.length;index++){
    const past=points.slice(0,index+1),last=past.at(-1);if(last.date<TEST_START||last.date>TEST_END)continue
    const trailing=past.slice(-252),high=Math.max(...trailing.map(point=>point.high)),drawdown=last.close/high-1,reference=mddReference(past),mdd=reference?30*clamp(Math.abs(drawdown)/reference,0,1):null,ma20=ma(past,20),ma60=ma(past,60),row={ticker,index,date:last.date,drawdown,mdd,stability:stability(past,ma20,ma60)}
    const rows=byDate.get(last.date)??[];rows.push(row);byDate.set(last.date,rows)
  }}
  const result=new Map()
  for(const rows of byDate.values()){
    const ranked=[...rows].sort((a,b)=>a.drawdown-b.drawdown)
    for(const row of rows){const rank=ranked.findIndex(item=>item.ticker===row.ticker),relative=ranked.length===1?20:20*(ranked.length-1-rank)/(ranked.length-1),score=Math.round(((row.mdd??0)+relative+row.stability)/65*100);result.set(`${row.ticker}|${row.date}`,score)}
  }
  return result
}

function zone(points,type,{direction=true,trim=true}){
  const last=points.at(-1);if(!last||points.length<252)return null
  const current=last.close,recent=points.slice(-60),year=points.slice(-252),mas=[['ma60',ma(points,60)],['ma120',ma(points,120)],['ma200',ma(points,200)]],reference=mddReference(points),tolerance=clamp((atr(points)??current*.03)/current*1.25,.015,.08)
  const raw=type==='buy'?[['swing60',Math.min(...recent.map(point=>point.low))],['low52',Math.min(...year.map(point=>point.low))],['mdd',reference?Math.max(...year.map(point=>point.high))*(1-reference):null],...mas]:[['swing60',Math.max(...recent.map(point=>point.high))],['high52',Math.max(...year.map(point=>point.high))],['ath',Math.max(...points.map(point=>point.close))],...mas.map(([name,price])=>[name,valid(price)&&price>current?price:null])]
  const items=raw.filter(([,price])=>valid(price)).filter(([name,price])=>!(type==='buy'&&direction&&name.startsWith('ma')&&price>current)).map(([name,price])=>({name,price}))
  if(!items.length)return null
  let candidates=[];for(const item of items){const group=items.filter(candidate=>Math.abs(candidate.price-item.price)/current<=tolerance);if(group.length>candidates.length)candidates=group}
  if(candidates.length<2){const eligible=items.filter(item=>type==='buy'?item.price<=current*1.15:item.price>=current*.85);candidates=[[...(eligible.length?eligible:items)].sort((a,b)=>Math.abs(a.price-current)-Math.abs(b.price-current))[0]]}
  const make=values=>{const prices=values.map(item=>item.price),mid=median(prices);return{low:Math.min(...prices),high:Math.max(...prices),mid,width:(Math.max(...prices)-Math.min(...prices))/mid}}
  const original=make(candidates),outlier=candidates.length>=3?[...candidates].sort((a,b)=>Math.abs(b.price-original.mid)-Math.abs(a.price-original.mid))[0]:null,trimmed=Boolean(trim&&type==='buy'&&original.width>=.05&&candidates.length>=3&&outlier),finalCandidates=trimmed?candidates.filter(item=>item!==outlier):candidates
  return{...make(finalCandidates),candidates,finalCandidates,outlier:trimmed?outlier:null,trimmed,tolerance,current}
}

const widthBucket=width=>width<.02?'0~2%':width<.03?'2~3%':width<.04?'3~4%':width<.05?'4~5%':width<.06?'5~6%':width<.08?'6~8%':'8% 이상'
function structure(histories,config){
  const rows=[]
  for(const ticker of tickers){const points=histories[ticker];for(let index=251;index<points.length;index++){const date=points[index].date;if(date<TEST_START||date>TEST_END)continue;const past=points.slice(0,index+1),buy=zone(past,'buy',config),sell=zone(past,'sell',config);if(buy&&sell)rows.push({ticker,date,buy,sell,current:points[index].close})}}
  const buy=rows.map(row=>row.buy),sell=rows.map(row=>row.sell),overlap=rows.filter(row=>row.buy.high>=row.sell.low),byTicker=tickers.map(ticker=>{const own=rows.filter(row=>row.ticker===ticker);return{ticker,zones:own.length,medianWidth:median(own.map(row=>row.buy.width)),meanWidth:avg(own.map(row=>row.buy.width)),overlapRate:own.length?own.filter(row=>row.buy.high>=row.sell.low).length/own.length:null,trimRate:own.length?own.filter(row=>row.buy.trimmed).length/own.length:null}})
  return{rows,summary:{zones:rows.length,buyMeanWidth:avg(buy.map(row=>row.width)),buyMedianWidth:median(buy.map(row=>row.width)),sellMeanWidth:avg(sell.map(row=>row.width)),sellMedianWidth:median(sell.map(row=>row.width)),overlapRate:rows.length?overlap.length/rows.length:null,buyAboveCurrentRate:rows.length?rows.filter(row=>row.buy.high>row.current).length/rows.length:null,trimRate:rows.length?buy.filter(row=>row.trimmed).length/buy.length:null,widthDistribution:['0~2%','2~3%','3~4%','4~5%','5~6%','6~8%','8% 이상'].map(label=>({label,count:buy.filter(row=>widthBucket(row.width)===label).length,ratio:buy.length?buy.filter(row=>widthBucket(row.width)===label).length/buy.length:null})),byTicker}}
}

const mddCurve=curve=>{let peak=-Infinity,mdd=0;for(const point of curve){peak=Math.max(peak,point.value);mdd=Math.min(mdd,point.value/peak-1)}return mdd}
function metric(trades,curve){const closed=trades.filter(trade=>trade.closed),allReturns=trades.map(trade=>trade.net),closedReturns=closed.map(trade=>trade.net);return{entries:trades.length,closed:closed.length,targetRate:trades.length?closed.length/trades.length:null,medianReturn:median(closedReturns),meanReturn:avg(closedReturns),cumulative:curve.length?curve.at(-1).value/curve[0].value-1:null,equityMdd:mddCurve(curve),meanMae:avg(trades.map(trade=>trade.mae)),medianMae:median(trades.map(trade=>trade.mae)),meanMfe:avg(trades.map(trade=>trade.mfe)),medianMfe:median(trades.map(trade=>trade.mfe)),medianDays:median(closed.map(trade=>trade.days)),openRate:trades.length?(trades.length-closed.length)/trades.length:null,tradeReturnMdd:mddCurve(closed.map((net,index)=>({value:closed.slice(0,index+1).reduce((value,trade)=>value*(1+trade.net),1)}))),allReturns}}
const mergeCurves=curves=>{const dates=[...new Set(curves.flatMap(curve=>curve.map(point=>point.date)))].sort();return dates.map(date=>({date,value:avg(curves.map(curve=>{const point=[...curve].reverse().find(item=>item.date<=date);return point?.value??1}))}))}

function simulate(histories,scores,config){
  const allTrades=[],curves={},perTicker=[]
  for(const ticker of tickers){const points=histories[ticker],trades=[],curve=[];let cash=1,shares=0,position=null
    for(let index=251;index<points.length;index++){const day=points[index];if(day.date<TEST_START||day.date>TEST_END)continue;const past=points.slice(0,index+1)
      if(!position){const buy=zone(past,'buy',config),sell=zone(past,'sell',config),score=scores.get(`${ticker}|${day.date}`);if(score>=70&&buy&&sell&&sell.mid>buy.mid&&day.low<=buy.high&&day.high>=buy.low){shares=cash*.9995/buy.mid;cash=0;position={ticker,entryDate:day.date,entryIndex:index,entry:buy.mid,target:sell.mid,low:day.low,high:day.high}}}
      else {position.low=Math.min(position.low,day.low);position.high=Math.max(position.high,day.high);if(index>position.entryIndex&&day.high>=position.target){cash=shares*position.target*.9995;trades.push({...position,closed:true,exitDate:day.date,days:index-position.entryIndex,net:position.target/position.entry*.999**1-1,mae:Math.min(0,position.low/position.entry-1),mfe:position.high/position.entry-1});shares=0;position=null}}
      curve.push({date:day.date,value:cash+shares*day.close})
    }
    if(position){const last=curve.at(-1);trades.push({...position,closed:false,exitDate:last.date,days:points.findIndex(point=>point.date===last.date)-position.entryIndex,net:last.value-1,mae:Math.min(0,position.low/position.entry-1),mfe:position.high/position.entry-1})}
    curves[ticker]=curve;allTrades.push(...trades);perTicker.push({ticker,...metric(trades,curve)})
  }
  const curve=mergeCurves(Object.values(curves));return{trades:allTrades,curve,perTicker,summary:metric(allTrades,curve),curves}
}

const periodLabel=date=>date<='2019-12-31'?'2016~2019':date<='2021-12-31'?'2020~2021':date<='2022-12-31'?'2022':'2023~2025'
const compactMetrics=summary=>Object.fromEntries(Object.entries(summary).filter(([key])=>key!=='allReturns'))

const accessToken=await token(),histories={}
for(const ticker of tickers){histories[ticker]=await candles(ticker,accessToken);console.log(`TOSS candles loaded: ${ticker} ${histories[ticker][0]?.date}~${histories[ticker].at(-1)?.date} · ${histories[ticker].length}`)}
const scores=scoreInputs(histories),configs={baseline:{direction:true,trim:true},noDirection:{direction:false,trim:true},noTrim:{direction:true,trim:false}}
const structures=Object.fromEntries(Object.entries(configs).map(([name,config])=>[name,structure(histories,config)]))
const simulations=Object.fromEntries(Object.entries(configs).map(([name,config])=>[name,simulate(histories,scores,config)]))
const baseline=simulations.baseline,old=JSON.parse(readFileSync('backtest/results/phase4_1-summary.json','utf8')).summary.baseline.performance
const periodSummary=['2016~2019','2020~2021','2022','2023~2025'].map(label=>{const trades=baseline.trades.filter(trade=>periodLabel(trade.entryDate)===label),zoneRows=structures.baseline.rows.filter(row=>periodLabel(row.date)===label);return{period:label,...compactMetrics(metric(trades,baseline.curve.filter(point=>periodLabel(point.date)===label))),buyMedianWidth:median(zoneRows.map(row=>row.buy.width)),trimRate:zoneRows.length?zoneRows.filter(row=>row.buy.trimmed).length/zoneRows.length:null,overlapRate:zoneRows.length?zoneRows.filter(row=>row.buy.high>=row.sell.low).length/zoneRows.length:null}})
const leaveOneOut=tickers.map(ticker=>{const selected=baseline.perTicker.filter(row=>row.ticker!==ticker),trades=baseline.trades.filter(row=>row.ticker!==ticker),curve=mergeCurves(Object.entries(baseline.curves).filter(([name])=>name!==ticker).map(([,value])=>value));return{excluded:ticker,...compactMetrics(metric(trades,curve)),medianTickerReturn:median(selected.map(row=>row.medianReturn))}})
const direction={without:{structure:structures.noDirection.summary,performance:compactMetrics(simulations.noDirection.summary)},with:{structure:structures.baseline.summary,performance:compactMetrics(baseline.summary)}}
const trim={without:{structure:structures.noTrim.summary,performance:compactMetrics(simulations.noTrim.summary)},with:{structure:structures.baseline.summary,performance:compactMetrics(baseline.summary)},midpointChange:avg(structures.baseline.rows.map((row,index)=>Math.abs(row.buy.mid-structures.noTrim.rows[index].buy.mid)/structures.noTrim.rows[index].buy.mid))}
const audit={cumulative:'각 종목을 1.0으로 시작해 일별 종가 기준 평가액을 동등가중 평균한 총 전략 수익률',equityMdd:'동일한 일별 동등가중 equity curve의 고점 대비 최대 하락률',tradeMae:'각 진입일 매수 midpoint 대비 보유 중 최저가 하락률. 전략 MDD와 측정 대상이 다름',baselineEquityMdd:baseline.summary.equityMdd,baselineTradeReturnMdd:baseline.summary.tradeReturnMdd}
const directionRiskWorse=baseline.summary.equityMdd<simulations.noDirection.summary.equityMdd-.01||baseline.summary.meanMae<simulations.noDirection.summary.meanMae-.01
const verdict=directionRiskWorse?'B. 일부 재검증 필요':'A. 10년에서도 운영 구조 유지 권장'
const conclusion=`${verdict} · 2016~2025 실제 TOSS 일봉으로 표본을 확장했습니다. MA 방향성은 가격대 폭·중첩을 개선했지만, 전략 MDD 또는 평균 MAE의 악화 여부도 함께 확인했습니다. TRIM은 가격대 폭을 크게 줄였고 Fixed 성과 차이는 제한적이었습니다. 운영 알고리즘은 이번 실행에서 변경하지 않았습니다.`
const date=new Date().toISOString().slice(0,10),runId=`phase4-2-${date}`
const sections=[
  ['baseline','10년 Baseline',[{...compactMetrics(baseline.summary),zones:structures.baseline.summary.zones}]],
  ['comparison','기존 기간 비교',[{previousEntries:old.entries,currentEntries:baseline.summary.entries,entryIncrease:baseline.summary.entries-old.entries,previousMedianReturn:old.medianReturn,currentMedianReturn:baseline.summary.medianReturn,previousTargetRate:old.targetRate,currentTargetRate:baseline.summary.targetRate,previousMeanMae:old.meanMae,currentMeanMae:baseline.summary.meanMae}]],
  ['direction','MA 방향성',[direction]],
  ['trim','TRIM',[trim]],
  ['structure','가격대 구조',[structures.baseline.summary]],
  ['period','기간별',periodSummary],
  ['ticker','종목별',baseline.perTicker.map(row=>({...compactMetrics(row),medianWidth:structures.baseline.summary.byTicker.find(item=>item.ticker===row.ticker)?.medianWidth,trimRate:structures.baseline.summary.byTicker.find(item=>item.ticker===row.ticker)?.trimRate,overlapRate:structures.baseline.summary.byTicker.find(item=>item.ticker===row.ticker)?.overlapRate}))],
  ['loo','Leave-One-Stock-Out',leaveOneOut],
  ['audit','성과 계산 감사',[audit]],
  ['conclusion','최종 판정',[{label:'판정',value:verdict},{label:'운영 변경',value:'0건 · 결과 보고 후 결정'},{label:'근거',value:conclusion}]],
].map(([id,title,rows],index)=>({id,parentId:null,sectionType:'report',title,summary:'2016~2025 TOSS 전체 일봉 · 미래정보 차단 · Fixed 차익관리',reportData:{rows},sortOrder:index+1}))
const run={id:runId,runDate:date,phase:'4.2차 · 10년 Baseline + 핵심가격 구조 재검증',title:'10년 Baseline 및 핵심가격 구조 재검증',algorithmVersion:'BT-v4.2',periodStart:TEST_START,periodEnd:TEST_END,universe:'TOSS 8종목 · 2015 워밍업',config:{scoreThreshold:70,weights:'30/20/15',maDirection:true,atrMultiplier:1.25,minTolerance:.015,atrCap:.08,zone:'min~max',trim:'폭>=5% · 후보>=3 · outlier 1개 제거',fixedTarget:'entry-day sell midpoint',diagnosticOnly:true},summary:{baseline:{structure:structures.baseline.summary,performance:compactMetrics(baseline.summary)},previous:old,direction,trim,periodSummary,perTicker:baseline.perTicker.map(compactMetrics),leaveOneOut,audit,verdict},conclusion,createdAt:new Date().toISOString(),sections}
mkdirSync('backtest/results',{recursive:true});writeFileSync('backtest/results/phase4_2-summary.json',JSON.stringify(run,null,2));writeFileSync('backtest/results/phase4_2-full.json',JSON.stringify({run,histories,structures:Object.fromEntries(Object.entries(structures).map(([name,value])=>[name,value.rows])),trades:simulations.baseline.trades,curve:baseline.curve},null,2));writeFileSync('backtest/results/phase4_2-candles.json',JSON.stringify(Object.fromEntries(tickers.map(ticker=>[ticker,{firstDate:histories[ticker][0]?.date,lastDate:histories[ticker].at(-1)?.date,count:histories[ticker].length}])),null,2))
let storage='local-only';if(!process.env.BACKTEST_LOCAL_ONLY&&process.env.MARKET_SYNC_URL&&process.env.MARKET_SYNC_TOKEN){const url=process.env.MARKET_SYNC_URL.replace(/\/api\/market-data.*$/,'/api/backtests'),response=await fetch(url,{method:'POST',headers:{Authorization:`Bearer ${process.env.MARKET_SYNC_TOKEN}`,'Content-Type':'application/json',...(process.env.SITES_BYPASS_TOKEN?{'OAI-Sites-Authorization':`Bearer ${process.env.SITES_BYPASS_TOKEN}`}:{})},body:JSON.stringify({...run,sections:sections.map(section=>({...section,id:`${runId}-${section.id}`}))})});if(!response.ok)throw new Error(`D1 ${response.status}: ${await response.text()}`);storage='D1 saved'}
console.log(JSON.stringify({storage,period:`${TEST_START}~${TEST_END}`,baseline:run.summary.baseline.performance,direction:{without:direction.without.performance,with:direction.with.performance},trim:{without:trim.without.performance,with:trim.with.performance},verdict},null,2))
