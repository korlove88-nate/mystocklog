import type { HistoricalPrice, MetricValue, StockSnapshot } from '../types'
import { opportunityScore } from './fundamentalsAnalysis'
import { ANALYSIS_THRESHOLDS as T } from './analysisConstants'
import { calculateMovingAverageSeries, normalizeHistoricalPrices } from './metricsCalculator'

export type MaKey='ma20'|'ma60'|'ma120'|'ma200'
export type MaDirection='상승 중'|'횡보'|'하락 중'|'데이터 부족'
export type TrendState='강한 상승'|'상승 우세'|'방향 탐색'|'약세 우세'|'강한 하락'
export type VolumeState='거래 집중'|'참여 증가'|'평소 수준'|'관심 감소'|'데이터 부족'
export type PriceZone={low:number;high:number;status:string;distance:MetricValue;relation:string;reasons:ZoneReason[];method:'ATR'|'현재가 비율'}
export type ZoneReason={name:string;price:number;date:string|null;source:string}
export type StockAnalysis={
  asOf:string|null;price:MetricValue;opportunity:ReturnType<typeof opportunityScore>;opportunityLabel:string;opportunityMeaning:string;
  completeness:number;ma:Record<MaKey,{value:MetricValue;difference:MetricValue;direction:MaDirection}>;arrangement:'정배열'|'역배열'|'혼조 배열'|'데이터 부족';trend:TrendState;
  latestVolume:MetricValue;averageVolume20:MetricValue;volumeRatio:MetricValue;volumeState:VolumeState;priceVolumeState:string;trendSummary:string;
  buyZone:PriceZone|null;sellZone:PriceZone|null;title:string;summary:string;plainTrendMeaning:string;nextTrendCheck:string;arrangementMeaning:string;volumeMeaning:string;missing:string[];source:string;series:ReturnType<typeof calculateMovingAverageSeries>;
}

const valid=(value:unknown):value is number=>typeof value==='number'&&Number.isFinite(value)
const priceOf=(point:HistoricalPrice)=>valid(point.adjustedClose)?point.adjustedClose:point.close
const median=(values:number[])=>{const sorted=[...values].sort((a,b)=>a-b);return sorted.length?sorted[Math.floor(sorted.length/2)]:null}
const pctDistance=(price:number,low:number,high:number)=>price<low?low/price-1:price>high?high/price-1:0

export function opportunityInterpretation(score:MetricValue){
  if(score===null)return{label:'분석 준비 중',meaning:'계산 가능한 투자조건이 부족합니다.'}
  if(score>=80)return{label:'조건 충족도 높음',meaning:'설정한 가격·실적 조건 대부분이 충족된 구간입니다.'}
  if(score>=65)return{label:'관찰 우선',meaning:'가격 매력은 있으나 추가 확인이 필요한 구간입니다.'}
  if(score>=45)return{label:'일부 충족',meaning:'일부 투자조건만 충족된 중립 구간입니다.'}
  return{label:'매력 제한',meaning:'현재 기준으로 투자조건 충족도가 낮은 구간입니다.'}
}

export function volumeStatistics(prices:HistoricalPrice[]){
  const points=normalizeHistoricalPrices(prices),latest=points.at(-1),previous=points.at(-2)
  const prior=points.slice(-21,-1).map(point=>point.volume).filter(valid)
  if(!latest||!valid(latest.volume)||prior.length<20)return{latest:latest?.volume??null,average:null,ratio:null,state:'데이터 부족' as VolumeState,priceDirection:null}
  const average=prior.reduce((sum,value)=>sum+value,0)/20,ratio=average>0?latest.volume/average:null
  const state:VolumeState=ratio===null?'데이터 부족':ratio>=T.volumeConcentrated?'거래 집중':ratio>=T.volumeIncreased?'참여 증가':ratio<T.volumeLow?'관심 감소':'평소 수준'
  const priceDirection=!previous?null:priceOf(latest)>priceOf(previous)?'상승':priceOf(latest)<priceOf(previous)?'하락':'보합'
  return{latest:latest.volume,average,ratio,state,priceDirection}
}

const maDirection=(series:ReturnType<typeof calculateMovingAverageSeries>,key:MaKey):MaDirection=>{
  const current=series.at(-1)?.[key],prior=series.at(-6)?.[key]
  if(!valid(current)||!valid(prior)||prior===0)return'데이터 부족'
  const change=current/prior-1
  return change>T.maDirectionChange?'상승 중':change<-T.maDirectionChange?'하락 중':'횡보'
}

export function trendAnalysis(prices:HistoricalPrice[],currentPrice:MetricValue){
  const series=calculateMovingAverageSeries(prices),price=currentPrice??series.at(-1)?.price??null,keys:MaKey[]=['ma20','ma60','ma120','ma200']
  const ma=Object.fromEntries(keys.map(key=>{const value=series.at(-1)?.[key]??null;return[key,{value,difference:valid(price)&&valid(value)?price/value-1:null,direction:maDirection(series,key)}]})) as StockAnalysis['ma']
  const values=keys.map(key=>ma[key].value),complete=valid(price)&&values.every(valid)
  let arrangement:StockAnalysis['arrangement']='데이터 부족'
  if(complete){const [a,b,c,d]=values as number[];arrangement=price>a&&a>b&&b>c&&c>d?'정배열':price<a&&a<b&&b<c&&c<d?'역배열':'혼조 배열'}
  const above=valid(price)?keys.filter(key=>valid(ma[key].value)&&price>ma[key].value!).length:0
  const rising=keys.filter(key=>ma[key].direction==='상승 중').length,falling=keys.filter(key=>ma[key].direction==='하락 중').length,available=keys.filter(key=>valid(ma[key].value)).length
  let trend:TrendState='방향 탐색'
  if(available>=2){if(arrangement==='정배열'&&rising>=2)trend='강한 상승';else if(arrangement==='역배열'&&falling>=2)trend='강한 하락';else if(above>=Math.ceil(available*.75)||above>=2&&rising>=2)trend='상승 우세';else if(above<=Math.floor(available*.25)||above<2&&falling>=2)trend='약세 우세'}
  return{series,ma,arrangement,trend}
}

const averageTrueRange=(prices:HistoricalPrice[])=>{const points=normalizeHistoricalPrices(prices).slice(-15);if(points.length<15||points.some(point=>!valid(point.high)||!valid(point.low)))return null;const ranges=points.slice(1).map((point,index)=>Math.max(point.high!-point.low!,Math.abs(point.high!-points[index].close),Math.abs(point.low!-points[index].close)));return ranges.reduce((a,b)=>a+b,0)/ranges.length}
const cluster=(reasons:ZoneReason[],price:number,method:PriceZone['method'],tolerance:number,type:'buy'|'sell'):PriceZone|null=>{
  const candidates=reasons.filter(reason=>reason.price>0).sort((a,b)=>a.price-b.price)
  let best:ZoneReason[]=[]
  for(let i=0;i<candidates.length;i++){const group=candidates.filter(item=>Math.abs(item.price-candidates[i].price)/price<=tolerance);if(group.length>best.length)best=group}
  if(best.length<2){const eligible=candidates.filter(item=>type==='buy'?item.price<=price*1.15:item.price>=price*.85),nearest=[...(eligible.length?eligible:candidates)].sort((a,b)=>Math.abs(a.price-price)-Math.abs(b.price-price))[0];if(!nearest)return null;const band=Math.max(nearest.price*.005,price*tolerance*.25),low=nearest.price-band,high=nearest.price+band,distance=pctDistance(price,low,high),relation=price>high?`${type==='buy'?'관심':'차익관리'} 구간까지 ${(distance*100).toFixed(1)}%`:price<low?(type==='buy'?'관심 구간을 하향 이탈':`차익관리 구간까지 +${(distance*100).toFixed(1)}%`):(type==='buy'?'현재 매수 관심 구간':'현재 차익관리 구간');return{low,high,status:'신뢰도 낮음 · 단일 기준',distance,relation,reasons:[nearest],method}}
  const low=Math.min(...best.map(item=>item.price)),high=Math.max(...best.map(item=>item.price)),distance=pctDistance(price,low,high)
  const relation=price>high?`${type==='buy'?'관심':'차익관리'} 구간까지 ${(distance*100).toFixed(1)}%`:price<low?(type==='buy'?'관심 구간을 하향 이탈':`차익관리 구간까지 +${(distance*100).toFixed(1)}%`):(type==='buy'?'현재 매수 관심 구간':'현재 차익관리 구간')
  return{low,high,status:type==='buy'?(best.length>=4?'강한 관심 후보':best.length===3?'2차 관심':'1차 관심'):'저항 중첩',distance,relation,reasons:best,method}
}

export function calculatePriceZones(stock:StockSnapshot){
  if(!valid(stock.price))return{buyZone:null,sellZone:null}
  const points=normalizeHistoricalPrices(stock.priceHistory),price=stock.price,latestDate=points.at(-1)?.date??null,atr=averageTrueRange(points),tolerance=Math.max(.015,Math.min(.08,atr?atr/price*T.clusterAtrMultiplier:T.clusterFallbackPercent)),method:PriceZone['method']=atr?'ATR':'현재가 비율'
  const recent=points.slice(-60),swingLow=recent.length?Math.min(...recent.map(point=>point.low??priceOf(point))):null,swingHigh=recent.length?Math.max(...recent.map(point=>point.high??priceOf(point))):null
  const mdds=Object.values(stock.mdd).filter(valid).map(Math.abs),mddMedian=median(mdds),mddPrice=valid(stock.high52)&&mddMedian!==null?stock.high52*(1-mddMedian):null
  const reason=(name:string,value:MetricValue,source='앱 계산'):ZoneReason[]=>valid(value)?[{name,price:value,date:latestDate,source}]:[]
  const buyReasons=[...reason('최근 스윙 저점',swingLow),...reason('52주 저점',stock.low52),...reason('MDD 기준가격',mddPrice),...reason('MA60',stock.ma60),...reason('MA120',stock.ma120),...reason('MA200',stock.ma200)]
  const sellReasons=[...reason('최근 스윙 고점',swingHigh),...reason('52주 고점',stock.high52),...reason('ATH',stock.ath),...reason('MA60',valid(stock.ma60)&&stock.ma60>price?stock.ma60:null),...reason('MA120',valid(stock.ma120)&&stock.ma120>price?stock.ma120:null),...reason('MA200',valid(stock.ma200)&&stock.ma200>price?stock.ma200:null)]
  const buyZone=cluster(buyReasons,price,method,tolerance,'buy'),sellZone=cluster(sellReasons,price,method,tolerance,'sell')
  if(buyZone&&sellZone&&buyZone.high>=sellZone.low){buyZone.status='판단 제한 · 가격대 중첩';sellZone.status='판단 제한 · 가격대 중첩'}
  return{buyZone,sellZone}
}

function combinedPriceVolume(priceDirection:string|null,ratio:MetricValue,trend:TrendState){
  if(!priceDirection||ratio===null)return'거래량 데이터가 부족해 가격 움직임의 확인이 제한됩니다.'
  const increased=ratio>=T.volumeIncreased
  if(priceDirection==='상승')return increased?'가격 상승과 거래량 증가가 함께 나타났습니다.':'가격은 상승했지만 거래량 확인이 더 필요합니다.'
  if(priceDirection==='하락')return increased?'가격 하락과 거래량 증가가 함께 나타나 매도 압력 지속 여부를 확인해야 합니다.':'거래가 줄어든 조정 가능성이 있어 추가 방향 확인이 필요합니다.'
  return trend.includes('상승')?'상승 구조 안에서 거래량은 뚜렷한 방향을 보이지 않습니다.':'가격과 거래량 모두 방향을 탐색하고 있습니다.'
}

export function explainTrendForUser(trend:TrendState,arrangement:StockAnalysis['arrangement'],volumeState:VolumeState){
  const plainTrendMeaning:Record<TrendState,string>={
    '강한 상승':'현재 가격과 여러 이동평균선이 같은 상승 방향을 가리킵니다. 단기·중장기 흐름이 비교적 고르게 좋아진 상태입니다.',
    '상승 우세':'중장기 흐름은 유리하지만 일부 단기 이동평균선은 아직 정리되지 않았습니다. 상승 가능성이 더 크지만 확인이 필요한 상태입니다.',
    '방향 탐색':'상승과 하락 신호가 섞여 있어 어느 방향이 우세한지 아직 분명하지 않습니다.',
    '약세 우세':'오늘 가격이 올랐더라도 주요 이동평균선의 방향은 아직 아래쪽입니다. 짧은 반등보다 넓은 기간의 하락 흐름이 더 강한 상태입니다.',
    '강한 하락':'현재 가격이 주요 이동평균선 아래에 있고 평균선도 하락하고 있습니다. 여러 기간에서 약세가 함께 나타난 상태입니다.',
  }
  const nextTrendCheck:Record<TrendState,string>={
    '강한 상승':'급하게 따라가기보다 MA20·MA60 위에서 가격이 유지되는지, 상승할 때 거래량이 함께 늘어나는지 확인하세요.',
    '상승 우세':'MA20·MA60 지지 여부와 거래량 회복을 확인하세요. 두 조건이 함께 나타나면 상승 흐름의 신뢰도가 높아집니다.',
    '방향 탐색':'가격이 MA60 또는 MA120 위아래 어느 쪽으로 자리 잡는지 기다리고, 그 움직임에 거래량이 동반되는지 확인하세요.',
    '약세 우세':'낙폭만 보고 판단하지 말고 MA20 회복, MA60 접근, 하락일 거래량 감소가 순서대로 나타나는지 확인하세요.',
    '강한 하락':'바닥을 단정하지 말고 저점 갱신이 멈추는지, MA20·MA60을 다시 회복하는지, 하락 거래량이 줄어드는지 확인하세요.',
  }
  const arrangementMeaning:Record<StockAnalysis['arrangement'],string>={
    '정배열':'단기 평균선이 장기 평균선보다 위에 있어 상승 흐름이 순서대로 정돈된 상태',
    '역배열':'단기 평균선이 장기 평균선보다 아래에 있어 하락 흐름이 여러 기간에 이어진 상태',
    '혼조 배열':'단기·중기·장기 평균선의 순서가 뒤섞여 서로 다른 방향을 가리키는 상태',
    '데이터 부족':'이동평균선의 순서를 비교할 만큼 가격 이력이 충분하지 않은 상태',
  }
  const volumeMeaning:Record<VolumeState,string>={
    '거래 집중':'평소보다 거래가 크게 늘었습니다. 가격 방향을 강화할 수 있으므로 발생 원인을 함께 확인해야 합니다.',
    '참여 증가':'평소보다 많은 참여가 동반됐습니다. 현재 가격 움직임의 힘이 커지는지 확인할 구간입니다.',
    '평소 수준':'거래량에서 특별히 강하거나 약한 신호가 나타나지 않았습니다.',
    '관심 감소':'평소보다 거래가 적어 현재 가격 움직임을 뒷받침하는 힘이 약합니다.',
    '데이터 부족':'직전 20거래일과 비교할 거래량 데이터가 부족합니다.',
  }
  return{plainTrendMeaning:plainTrendMeaning[trend],nextTrendCheck:nextTrendCheck[trend],arrangementMeaning:arrangementMeaning[arrangement],volumeMeaning:volumeMeaning[volumeState]}
}

export function buildStockAnalysis(stock:StockSnapshot,peers:StockSnapshot[]):StockAnalysis{
  const opportunity=opportunityScore(stock,peers),interpretation=opportunityInterpretation(opportunity.score),trendResult=trendAnalysis(stock.priceHistory,stock.price),volume=volumeStatistics(stock.priceHistory),zones=calculatePriceZones(stock)
  const missing:string[]=[];for(const [key,label] of [['ma20','MA20'],['ma60','MA60'],['ma120','MA120'],['ma200','MA200']] as const)if(!valid(trendResult.ma[key].value))missing.push(`${label} 데이터 부족`)
  if(volume.ratio===null)missing.push(`거래량 ${Math.min(stock.priceHistory.filter(point=>valid(point.volume)).length,20)}/20일 수집`)
  if(stock.return1y===null)missing.push('52주 데이터 부족');if(!valid(stock.eps)||stock.eps<=0)missing.push('EPS가 없거나 0 이하로 PER 가격 분석 제외');if(Object.values(stock.mdd).filter(valid).length<5)missing.push('5년 가격 이력이 부족해 MDD 신뢰도 제한')
  const measurable=10-missing.length,completeness=Math.max(0,Math.round(measurable/10*100)),priceVolumeState=combinedPriceVolume(volume.priceDirection,volume.ratio,trendResult.trend)
  const trendSummary=`${trendResult.arrangement==='데이터 부족'?'이동평균 데이터 축적 중':`${trendResult.arrangement} · ${trendResult.trend}`}. ${priceVolumeState}`
  let title='가격과 추세 모두 방향을 탐색하고 있습니다.'
  if((opportunity.score??0)>=65&&trendResult.trend.includes('상승'))title='가격 매력과 단기 추세가 함께 개선되고 있습니다.'
  else if((opportunity.score??0)>=65&&trendResult.trend.includes('하락'))title='낙폭은 크지만 하락 추세가 이어지고 있습니다.'
  else if((opportunity.score??100)<45&&trendResult.trend.includes('상승'))title='상승 추세는 유지되지만 가격 부담이 커졌습니다.'
  else if((opportunity.score??0)>=65)title='가격 매력은 높지만 추세 확인이 필요합니다.'
  const zoneSentence=zones.buyZone?`${zones.buyZone.relation}입니다.`:zones.sellZone?`${zones.sellZone.relation}입니다.`:'가격 구간은 추가 데이터 축적이 필요합니다.'
  const summary=`기회점수는 ${opportunity.score??'—'}점으로 ${interpretation.label} 상태이며, ${zoneSentence} 현재 추세는 ${trendResult.trend}, 거래량은 ${volume.state} 상태입니다.`
  const plain=explainTrendForUser(trendResult.trend,trendResult.arrangement,volume.state)
  return{asOf:stock.priceHistory.at(-1)?.date??null,price:stock.price,opportunity,opportunityLabel:interpretation.label,opportunityMeaning:interpretation.meaning,completeness,ma:trendResult.ma,arrangement:trendResult.arrangement,trend:trendResult.trend,latestVolume:volume.latest,averageVolume20:volume.average,volumeRatio:volume.ratio,volumeState:volume.state,priceVolumeState,trendSummary,buyZone:zones.buyZone,sellZone:zones.sellZone,title,summary,...plain,missing,source:stock.sources?.history==='toss'?'TOSS 정규장 일봉 · 앱 계산':'저장 일봉 · 앱 계산',series:trendResult.series}
}
