import { DatabaseSync } from 'node:sqlite'
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const source=JSON.parse(readFileSync('backtest/results/phase1_5-full.json','utf8'))
const existing=JSON.parse(readFileSync('backtest/results/phase1_8-summary.json','utf8'))
const root='.wrangler/state/v3/d1/miniflare-D1DatabaseObject'
const file=existsSync(root)?readdirSync(root).find(x=>x.endsWith('.sqlite')&&x!=='metadata.sqlite'):null
if(!file)throw new Error('로컬 TOSS D1 데이터가 없습니다.')
const db=new DatabaseSync(join(root,file),{readOnly:true})
const rows=db.prepare("SELECT ticker,market_date date,open,high,low,close,volume FROM daily_prices WHERE source='TOSS' ORDER BY ticker,market_date").all()
db.close()
const series=Object.groupBy(rows,x=>x.ticker)
const mean=x=>x.length?x.reduce((a,b)=>a+b,0)/x.length:null
const median=x=>{const a=[...x].sort((a,b)=>a-b);return a.length?a[Math.floor(a.length/2)]:null}
const ma=(points,n)=>points.length<n?null:mean(points.slice(-n).map(x=>x.close))
const atr=points=>{const a=points.slice(-15);if(a.length<15)return null;const ranges=a.slice(1).map((p,i)=>Math.max(p.high-p.low,Math.abs(p.high-a[i].close),Math.abs(p.low-a[i].close)));return mean(ranges)}
const tolerance=(points,price)=>Math.max(.015,Math.min(.08,(atr(points)??0)/price*1.5||.03))

function zone(points,type){
  const last=points.at(-1);if(!last)return null
  const price=last.close, recent=points.slice(-60), trailing=points.slice(-252)
  const swing=type==='buy'?Math.min(...recent.map(x=>x.low)):Math.max(...recent.map(x=>x.high))
  const annual=[];for(const year of [...new Set(points.map(x=>x.date.slice(0,4)))].slice(-5)){let peak=0,draw=0;for(const p of points.filter(x=>x.date.startsWith(year))){peak=Math.max(peak,p.high);draw=Math.min(draw,p.close/peak-1)}if(peak)annual.push(Math.abs(draw))}
  const high52=Math.max(...trailing.map(x=>x.high)), low52=Math.min(...trailing.map(x=>x.low)), ref=median(annual)
  const values=type==='buy'?[swing,low52,ref===null?null:high52*(1-ref),ma(points,60),ma(points,120),ma(points,200)]:[swing,high52,Math.max(...points.map(x=>x.close)),...[ma(points,60),ma(points,120),ma(points,200)].map(x=>x!==null&&x>price?x:null)]
  const candidates=values.filter(x=>Number.isFinite(x)).sort((a,b)=>a-b), t=tolerance(points,price)
  if(!candidates.length)return null
  let best=[];for(const candidate of candidates){const group=candidates.filter(x=>Math.abs(x-candidate)/price<=t);if(group.length>best.length)best=group}
  if(best.length<2){const eligible=candidates.filter(x=>type==='buy'?x<=price*1.15:x>=price*.85);const nearest=[...(eligible.length?eligible:candidates)].sort((a,b)=>Math.abs(a-price)-Math.abs(b-price))[0],band=Math.max(nearest*.005,price*t*.25);return{low:nearest-band,high:nearest+band,mid:nearest}}
  return{low:Math.min(...best),high:Math.max(...best),mid:median(best)}
}

const score=r=>Math.round((r.mdd+r.relative+r.stability)/65*100)
const entries=source.records.filter(r=>r.hit&&score(r)>=70).map(r=>{
  const points=series[r.ticker]??[], index=points.findIndex(p=>p.date===r.date)
  const buy=index>=0?zone(points.slice(0,index+1),'buy'):null
  return {...r,index,buy}
}).filter(r=>r.index>=0&&r.buy)

function evaluate(entry,mode){
  const points=series[entry.ticker], entryMid=entry.buy.mid, fixed=zone(points.slice(0,entry.index+1),'sell')
  if(!fixed)return null
  let maxHigh=-Infinity,minLow=Infinity
  for(let i=entry.index+1;i<points.length;i++){
    const current=points[i], target=mode==='fixed'?fixed:zone(points.slice(0,i),'sell')
    if(!target||target.mid<=entryMid)continue
    maxHigh=Math.max(maxHigh,current.high);minLow=Math.min(minLow,current.low)
    if(current.low<=target.mid&&current.high>=target.mid)return{ticker:entry.ticker,entryDate:entry.date,arrivalDate:current.date,days:i-entry.index,return:target.mid/entryMid-1,mae:minLow/entryMid-1,mfe:maxHigh/entryMid-1}
  }
  return{ticker:entry.ticker,entryDate:entry.date,arrivalDate:null,days:null,return:null,mae:minLow===Infinity?null:minLow/entryMid-1,mfe:maxHigh===-Infinity?null:maxHigh/entryMid-1}
}

const fixed=entries.map(x=>evaluate(x,'fixed')).filter(Boolean),dynamic=entries.map(x=>evaluate(x,'dynamic')).filter(Boolean)
const summarize=items=>{const arrived=items.filter(x=>x.arrivalDate), v=key=>arrived.map(x=>x[key]).filter(Number.isFinite);return{events:items.length,arrivals:arrived.length,arrivalRate:items.length?arrived.length/items.length:null,nonArrivalRate:items.length?(items.length-arrived.length)/items.length:null,medianDays:median(v('days')),medianReturn:median(v('return')),meanMae:mean(v('mae')),meanMfe:mean(v('mfe'))}}
const fixedSummary=summarize(fixed),dynamicSummary=summarize(dynamic)
const byTicker=Object.keys(series).filter(t=>entries.some(x=>x.ticker===t)).map(t=>{const x=fixed.filter(e=>e.ticker===t),s=summarize(x);return{ticker:t,events:s.events,arrivalRate:s.arrivalRate,medianReturn:s.medianReturn}}).sort((a,b)=>b.events-a.events)
const range=byTicker.map(x=>x.arrivalRate).filter(Number.isFinite),bias=range.length&&Math.max(...range)-Math.min(...range)>.45?'종목별 도달률 차이가 커서 일부 종목 의존 가능성이 있습니다.':'표본 내 특정 한 종목만 결과를 과도하게 끌어올리는 패턴은 뚜렷하지 않습니다.'
const recommended='Fixed'
const recommendationReason='Dynamic은 도달은 빠르지만 목표 가격이 매일 바뀌어 종료 기준이 느슨해질 수 있어, 2차-1의 실전 운용 검증은 진입일 목표를 고정하는 Fixed가 더 적절합니다.'
const conclusion=`복합매수 ${entries.length}건에서 Fixed 방식은 도달률 ${(fixedSummary.arrivalRate*100).toFixed(0)}%, 중앙 도달기간 ${fixedSummary.medianDays}거래일이었습니다. ${recommendationReason}`
const linked={title:'복합매수 후 도달 분석',summary:`복합매수 ${entries.length}건 · Dynamic 도달 ${dynamicSummary.arrivals}건`,reportData:{rows:[{label:'복합매수 이벤트',...dynamicSummary}]},sortOrder:4}
const comparison={title:'Fixed vs Dynamic',summary:`2차-1 권장: ${recommended}`,reportData:{rows:[{label:'Fixed',...fixedSummary},{label:'Dynamic',...dynamicSummary}],byTicker,recommended,recommendationReason,bias},sortOrder:5}
const run={...existing,algorithmVersion:'BT-v1.8-linked',summary:{...existing.summary,linked:{fixed:fixedSummary,dynamic:dynamicSummary,byTicker,recommended,bias}},conclusion,sections:existing.sections.map(s=>s.id==='linked'?{...s,...linked,reportData:linked.reportData}:s.id==='fixedDynamic'?{...s,...comparison,reportData:comparison.reportData}:s)}
writeFileSync('backtest/results/phase1_8-linked-summary.json',JSON.stringify(run,null,2))
writeFileSync('backtest/results/phase1_8-linked-events.json',JSON.stringify({fixed,dynamic,byTicker},null,2))
const appendedSections=run.sections.filter(s=>s.id==='linked'||s.id==='fixedDynamic').map(s=>({...s,id:`${run.id}-${s.id}`,parentId:null}))
let storage='local-only';if(!process.env.BACKTEST_LOCAL_ONLY&&process.env.MARKET_SYNC_URL&&process.env.MARKET_SYNC_TOKEN){const url=process.env.MARKET_SYNC_URL.replace(/\/api\/market-data.*$/,'/api/backtests'),res=await fetch(url,{method:'PATCH',headers:{Authorization:`Bearer ${process.env.MARKET_SYNC_TOKEN}`,'Content-Type':'application/json',...(process.env.SITES_BYPASS_TOKEN?{'OAI-Sites-Authorization':`Bearer ${process.env.SITES_BYPASS_TOKEN}`}:{})},body:JSON.stringify({runId:run.id,sections:appendedSections})});if(!res.ok)throw new Error(`D1 저장 실패 ${res.status}: ${await res.text()}`);storage='D1 sections appended'}
console.log(JSON.stringify({storage,entries:entries.length,fixed:fixedSummary,dynamic:dynamicSummary,byTicker,recommended,bias},null,2))
