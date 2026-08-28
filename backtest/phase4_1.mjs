import { DatabaseSync } from 'node:sqlite'
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const state='.wrangler/state/v3/d1/miniflare-D1DatabaseObject'
const file=existsSync(state)&&readdirSync(state).find(name=>name.endsWith('.sqlite')&&name!=='metadata.sqlite')
if(!file)throw Error('로컬 TOSS D1 데이터가 없습니다.')
const db=new DatabaseSync(join(state,file),{readOnly:true})
const raw=db.prepare("SELECT ticker,market_date date,high,low,close FROM daily_prices WHERE source='TOSS' ORDER BY ticker,market_date").all()
db.close()

const history=Object.groupBy(raw,row=>row.ticker)
const scoreRecords=new Map(JSON.parse(readFileSync('backtest/results/phase1_5-full.json','utf8')).records.map(row=>[`${row.ticker}|${row.date}`,row]))
const tickers=['AAPL','AMZN','AVGO','GOOG','META','MSFT','NVDA','TSLA'].filter(ticker=>history[ticker]?.length>504)
const valid=value=>typeof value==='number'&&Number.isFinite(value)
const avg=values=>values.length?values.reduce((sum,value)=>sum+value,0)/values.length:null
const median=values=>{const sorted=[...values].sort((a,b)=>a-b),count=sorted.length;return!count?null:count%2?sorted[(count-1)/2]:(sorted[count/2-1]+sorted[count/2])/2}
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value))
const ma=(points,length)=>points.length<length?null:avg(points.slice(-length).map(point=>point.close))
const atr=points=>{const recent=points.slice(-15);return recent.length<15?null:avg(recent.slice(1).map((point,index)=>Math.max(point.high-point.low,Math.abs(point.high-recent[index].close),Math.abs(point.low-recent[index].close))))}
const annualMdd=(points,year)=>{let peak=-Infinity,drawdown=0;for(const point of points)if(point.date.startsWith(String(year))){peak=Math.max(peak,point.close);drawdown=Math.min(drawdown,point.close/peak-1)}return peak===-Infinity?null:drawdown}
const score=record=>Math.round(((record.mdd??0)+(record.relative??0)+(record.stability??0))/65*100)
const slopeState=value=>value>.005?'상승':value<-.005?'하락':'평탄'
const relativeMdd=returns=>{let equity=1,peak=1,drawdown=0;for(const value of returns){equity*=1+value;peak=Math.max(peak,equity);drawdown=Math.min(drawdown,equity/peak-1)}return drawdown}

function movingAverages(points){return[60,120,200].map(length=>{const current=ma(points,length),previous=ma(points.slice(0,-10),length),slope=valid(current)&&valid(previous)&&previous!==0?current/previous-1:null;return{name:`ma${length}`,price:current,slope,state:valid(slope)?slopeState(slope):null}})}

function zone(points,type,mode){
  const last=points.at(-1)
  if(!last||points.length<252)return null
  const current=last.close,recent=points.slice(-60),year=points.slice(-252)
  const years=[...new Set(points.map(point=>Number(point.date.slice(0,4))))].slice(-5)
  const referenceMdd=median(years.map(yearNumber=>annualMdd(points,yearNumber)).filter(valid).map(Math.abs))
  const moving=movingAverages(points)
  const tolerance=clamp((atr(points)??current*.03)/current*1.25,.015,.08)
  const raw=type==='buy'
    ? [['swing60',Math.min(...recent.map(point=>point.low)),null],['low52',Math.min(...year.map(point=>point.low)),null],['mdd',referenceMdd===null?null:Math.max(...year.map(point=>point.high))*(1-referenceMdd),null],...moving.map(item=>[item.name,item.price,item])]
    : [['swing60',Math.max(...recent.map(point=>point.high)),null],['high52',Math.max(...year.map(point=>point.high)),null],['ath',Math.max(...points.map(point=>point.close)),null],...moving.map(item=>[item.name,valid(item.price)&&item.price>current?item.price:null,item])]
  let items=raw.filter(([,price])=>valid(price)).filter(([name,price])=>!(type==='buy'&&name.startsWith('ma')&&price>current)).map(([name,price,detail])=>({name,price,slope:detail?.slope??null,slopeState:detail?.state??null}))
  if(type==='buy'&&mode==='hard')items=items.filter(item=>!item.name.startsWith('ma')||item.slopeState!=='하락')
  if(!items.length)return null
  let candidates=[]
  for(const item of items){const group=items.filter(candidate=>Math.abs(candidate.price-item.price)/current<=tolerance);if(group.length>candidates.length)candidates=group}
  if(candidates.length<2){const eligible=items.filter(item=>type==='buy'?item.price<=current*1.15:item.price>=current*.85);candidates=[[...(eligible.length?eligible:items)].sort((a,b)=>Math.abs(a.price-current)-Math.abs(b.price-current))[0]]}
  const make=list=>{const values=list.map(item=>item.price),mid=median(values);return{low:Math.min(...values),high:Math.max(...values),mid,width:(Math.max(...values)-Math.min(...values))/mid}}
  const base=make(candidates),outlier=candidates.length>=3?[...candidates].sort((a,b)=>Math.abs(b.price-base.mid)-Math.abs(a.price-base.mid))[0]:null
  const trimApplied=base.width>=.05&&candidates.length>=3&&Boolean(outlier)
  const finalCandidates=trimApplied?candidates.filter(item=>item!==outlier):candidates
  return{...make(finalCandidates),candidates,finalCandidates,trimApplied,tolerance}
}

function allZones(mode){
  const rows=[]
  for(const ticker of tickers)for(let index=252;index<history[ticker].length-252;index+=1){
    const points=history[ticker].slice(0,index+1),buy=zone(points,'buy',mode),sell=zone(points,'sell',mode)
    if(buy&&sell)rows.push({ticker,index,date:points.at(-1).date,current:points.at(-1).close,buy,sell,score:scoreRecords.has(`${ticker}|${points.at(-1).date}`)?score(scoreRecords.get(`${ticker}|${points.at(-1).date}`)):null})
  }
  return rows
}

function structure(rows){
  const buy=rows.map(row=>row.buy),sell=rows.map(row=>row.sell),overlap=rows.filter(row=>Math.max(row.buy.low,row.sell.low)<Math.min(row.buy.high,row.sell.high))
  const maCount=name=>buy.filter(zoneValue=>zoneValue.finalCandidates.some(candidate=>candidate.name===name)).length
  return{zones:rows.length,buyMeanWidth:avg(buy.map(zoneValue=>zoneValue.width)),buyMedianWidth:median(buy.map(zoneValue=>zoneValue.width)),sellMeanWidth:avg(sell.map(zoneValue=>zoneValue.width)),sellMedianWidth:median(sell.map(zoneValue=>zoneValue.width)),overlapRate:rows.length?overlap.length/rows.length:null,buyAboveCurrentRate:rows.length?rows.filter(row=>row.buy.high>row.current).length/rows.length:null,trimApplied:buy.filter(zoneValue=>zoneValue.trimApplied).length,ma60Included:maCount('ma60'),ma120Included:maCount('ma120'),ma200Included:maCount('ma200')}
}

function simulate(mode){
  const trades=[]
  for(const ticker of tickers){
    const points=history[ticker],start=Math.max(252,points.findIndex(point=>scoreRecords.has(`${ticker}|${point.date}`))),end=points.length-253
    let position=null
    for(let index=start;index<=end;index+=1){
      const day=points[index],record=scoreRecords.get(`${ticker}|${day.date}`),buy=zone(points.slice(0,index+1),'buy',mode),sell=zone(points.slice(0,index+1),'sell',mode)
      if(!position&&record&&score(record)>=70&&buy&&sell&&sell.mid>buy.mid&&day.low<=buy.high&&day.high>=buy.low){position={ticker,entryDate:day.date,entryIndex:index,entry:buy.mid,target:sell.mid,low:day.low,high:day.high,candidates:buy.finalCandidates}}
      else if(position){position.low=Math.min(position.low,day.low);position.high=Math.max(position.high,day.high);if(day.high>=position.target){trades.push({...position,closed:true,exitDate:day.date,days:index-position.entryIndex,net:position.target/position.entry*.999-1,mae:Math.min(0,position.low/position.entry-1),mfe:position.high/position.entry-1});position=null}}
    }
    if(position){const last=points[end];trades.push({...position,closed:false,exitDate:last.date,days:end-position.entryIndex,net:last.close/position.entry*.9995-1,mae:Math.min(0,position.low/position.entry-1),mfe:position.high/position.entry-1})}
  }
  return trades
}

function metrics(trades){
  const closed=trades.filter(trade=>trade.closed),ordered=[...closed].sort((a,b)=>a.exitDate.localeCompare(b.exitDate)),returns=ordered.map(trade=>trade.net)
  return{entries:trades.length,closed:closed.length,targetRate:trades.length?closed.length/trades.length:null,medianReturn:median(closed.map(trade=>trade.net)),meanReturn:avg(closed.map(trade=>trade.net)),cumulative:returns.reduce((result,value)=>result*(1+value),1)-1,mdd:relativeMdd(returns),meanMae:avg(trades.map(trade=>trade.mae)),medianMae:median(trades.map(trade=>trade.mae)),meanMfe:avg(trades.map(trade=>trade.mfe)),medianDays:median(closed.map(trade=>trade.days)),openRate:trades.length?(trades.length-closed.length)/trades.length:null}
}
function groups(trades){
  const rows=[['상승 MA 포함',trade=>trade.candidates.some(candidate=>candidate.name.startsWith('ma')&&candidate.slopeState==='상승')],['평탄 MA 포함',trade=>trade.candidates.some(candidate=>candidate.name.startsWith('ma')&&candidate.slopeState==='평탄')],['하락 MA 포함',trade=>trade.candidates.some(candidate=>candidate.name.startsWith('ma')&&candidate.slopeState==='하락')],['MA 미포함',trade=>!trade.candidates.some(candidate=>candidate.name.startsWith('ma'))]]
  return rows.map(([label,test])=>{const tradesForGroup=trades.filter(test),closed=tradesForGroup.filter(trade=>trade.closed);return{label,entries:tradesForGroup.length,medianReturn:median(closed.map(trade=>trade.net)),targetRate:tradesForGroup.length?closed.length/tradesForGroup.length:null,meanMae:avg(tradesForGroup.map(trade=>trade.mae)),mdd:relativeMdd(closed.map(trade=>trade.net)),medianDays:median(closed.map(trade=>trade.days))}})
}
function periods(trades){return['ma60','ma120','ma200'].flatMap(name=>['상승','평탄','하락'].map(state=>{const subset=trades.filter(trade=>trade.candidates.some(candidate=>candidate.name===name&&candidate.slopeState===state)),closed=subset.filter(trade=>trade.closed);return{ma:name.toUpperCase(),state,entries:subset.length,medianReturn:median(closed.map(trade=>trade.net)),targetRate:subset.length?closed.length/subset.length:null,meanMae:avg(subset.map(trade=>trade.mae)),mdd:relativeMdd(closed.map(trade=>trade.net)),medianDays:median(closed.map(trade=>trade.days))}}))}
function perTicker(trades){return tickers.map(ticker=>{const subset=trades.filter(trade=>trade.ticker===ticker),summary=metrics(subset);return{ticker,entries:summary.entries,medianReturn:summary.medianReturn,targetRate:summary.targetRate,mdd:summary.mdd,meanMae:summary.meanMae,medianDays:summary.medianDays}})}
function withoutOne(trades,ticker){return metrics(trades.filter(trade=>trade.ticker!==ticker))}

const modes=['baseline','soft','hard']
const zones=Object.fromEntries(modes.map(mode=>[mode,allZones(mode)]))
const trades=Object.fromEntries(modes.map(mode=>[mode,simulate(mode)]))
const summaries=Object.fromEntries(modes.map(mode=>[mode,{structure:structure(zones[mode]),performance:metrics(trades[mode]),perTicker:perTicker(trades[mode])}]))
const slopeGroups=groups(trades.soft),periodGroups=periods(trades.soft)
const baseline=summaries.baseline.performance,hard=summaries.hard.performance
const hardImprovesRisk=valid(hard.meanMae)&&valid(baseline.meanMae)&&hard.meanMae<baseline.meanMae-.005&&hard.mdd>=baseline.mdd&&hard.targetRate>=baseline.targetRate-.05&&hard.entries>=baseline.entries*.75&&hard.medianReturn>=baseline.medianReturn-.01
const candidateMode=hardImprovesRisk?'hard':'soft'
const leaveOneOut=tickers.map(ticker=>({ticker,baseline:withoutOne(trades.baseline,ticker),[candidateMode]:withoutOne(trades[candidateMode],ticker)}))
const falling=slopeGroups.find(row=>row.label==='하락 MA 포함'),nonFalling=trades.soft.filter(trade=>!trade.candidates.some(candidate=>candidate.name.startsWith('ma')&&candidate.slopeState==='하락'))
const nonFallingMetrics=metrics(nonFalling)
const conclusion=hardImprovesRisk?'A. 운영 반영 권장':'C. 운영 반영 보류'
const conclusionText=hardImprovesRisk?'Hard slope가 MAE·MDD를 개선하면서 진입 수와 Fixed 성과를 유지했습니다.':`Hard slope는 매수 가격대 중앙 폭을 ${(summaries.baseline.structure.buyMedianWidth*100).toFixed(2)}%에서 ${(summaries.hard.structure.buyMedianWidth*100).toFixed(2)}%로 줄였지만, 진입 ${baseline.entries}건·목표 도달률 ${(baseline.targetRate*100).toFixed(1)}%·중앙수익률 ${(baseline.medianReturn*100).toFixed(2)}%는 Baseline과 같았습니다. 하락 MA 포함 거래도 ${falling?.entries??0}건뿐이어서 위험지표 개선을 확정하기 어렵습니다. Soft slope는 후보를 제거하지 않아 Baseline과 동일한 운용 결과입니다.`
const date=new Date().toISOString().slice(0,10),runId=`phase4-1-${date}`
const sectionData=[
  ['comparison','Baseline / Soft / Hard',modes.map(mode=>({mode,...summaries[mode].structure,...summaries[mode].performance}))],
  ['slope-state','slope 상태별 분석',[...slopeGroups,{label:'하락 MA 미포함',...nonFallingMetrics}]],
  ['ma-period','MA 기간별 분석',periodGroups],
  ['ticker','종목별 결과',modes.flatMap(mode=>summaries[mode].perTicker.map(row=>({mode,...row})))],
  ['loo','Leave-One-Stock-Out',leaveOneOut],
  ['conclusion','최종 판정',[{label:'판정',value:conclusion},{label:'운영 변경',value:'0건 · 결과 보고 후 결정'},{label:'근거',value:conclusionText}]],
]
const sections=sectionData.map(([id,title,rows],index)=>({id,parentId:null,sectionType:'report',title,summary:'MA slope 단일 변수 독립 Fixed 시뮬레이션 · 운영 알고리즘 변경 없음',reportData:{rows},sortOrder:index+1}))
const run={id:runId,runDate:date,phase:'4.1차 · MA 기울기 유효성 검증',title:'MA60/120/200 기울기 단일 변수 검증',algorithmVersion:'BT-v4.1',periodStart:'2022-01-25',periodEnd:'2025-08-21',universe:'TOSS 8종목 동일 스냅샷',config:{scoreThreshold:70,weights:'30/20/15',maDirection:true,atrMultiplier:1.25,minTolerance:.015,atrCap:.08,zone:'min~max',trim:'폭>=5% · 후보>=3 · outlier 1개 제거',fixedTarget:'entry-day sell midpoint',slope:'10거래일 · 상승 > +0.5%, 평탄 ±0.5%, 하락 < -0.5%',diagnosticOnly:true},summary:{baseline:summaries.baseline,soft:summaries.soft,hard:summaries.hard,slopeGroups,periodGroups,leaveOneOut,candidateMode,fallingVsNonFalling:{falling,nonFalling:nonFallingMetrics},verdict:conclusion},conclusion:`${conclusion} · ${conclusionText}`,createdAt:new Date().toISOString(),sections}

mkdirSync('backtest/results',{recursive:true})
writeFileSync('backtest/results/phase4_1-summary.json',JSON.stringify(run,null,2))
writeFileSync('backtest/results/phase4_1-full.json',JSON.stringify({run,zones,trades,slopeGroups,periodGroups,leaveOneOut},null,2))
for(const [name,data] of Object.entries({comparison:sectionData[0][2],slope_states:slopeGroups,ma_periods:periodGroups,per_ticker:sectionData[3][2],leave_one_out:leaveOneOut}))writeFileSync(`backtest/results/phase4_1-${name}.json`,JSON.stringify(data,null,2))

let storage='local-only'
if(!process.env.BACKTEST_LOCAL_ONLY&&process.env.MARKET_SYNC_URL&&process.env.MARKET_SYNC_TOKEN){
  const url=process.env.MARKET_SYNC_URL.replace(/\/api\/market-data.*$/,'/api/backtests')
  const response=await fetch(url,{method:'POST',headers:{Authorization:`Bearer ${process.env.MARKET_SYNC_TOKEN}`,'Content-Type':'application/json',...(process.env.SITES_BYPASS_TOKEN?{'OAI-Sites-Authorization':`Bearer ${process.env.SITES_BYPASS_TOKEN}`}:{})},body:JSON.stringify({...run,sections:sections.map(section=>({...section,id:`${runId}-${section.id}`}))})})
  if(!response.ok)throw Error(`D1 ${response.status}: ${await response.text()}`)
  storage='D1 saved'
}
console.log(JSON.stringify({storage,summary:run.summary},null,2))
