import { DatabaseSync } from 'node:sqlite'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const COLLECTOR_ID='toss_live_collector'
const TOSS_BASE_URL='https://openapi.tossinvest.com'
const SUPABASE_URL=process.env.SUPABASE_URL?.replace(/\/$/,'')
const SUPABASE_KEY=process.env.SUPABASE_SERVICE_ROLE_KEY
const CLIENT_ID=process.env.TOSS_CLIENT_ID
const CLIENT_SECRET=process.env.TOSS_CLIENT_SECRET
const databaseRoot='.wrangler/state/v3/d1/miniflare-D1DatabaseObject'
let accessToken=null
let accessTokenExpiresAt=0
let lastKnownIp=null

const fail=(message)=>{throw new Error(message)}
if(!SUPABASE_URL||!SUPABASE_KEY)fail('SUPABASE_URL과 SUPABASE_SERVICE_ROLE_KEY가 필요합니다.')
if(!CLIENT_ID||!CLIENT_SECRET)fail('TOSS_CLIENT_ID와 TOSS_CLIENT_SECRET이 필요합니다.')

const delay=(ms)=>new Promise(resolve=>setTimeout(resolve,ms))
const nowIso=()=>new Date().toISOString()
const finite=value=>typeof value==='number'&&Number.isFinite(value)
const validTicker=value=>/^[A-Z][A-Z0-9.-]{0,9}$/.test(value)
const supabaseHeaders={'apikey':SUPABASE_KEY,'Authorization':`Bearer ${SUPABASE_KEY}`,'Content-Type':'application/json'}

const nyParts=(now=new Date())=>Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit',weekday:'short',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(now).filter(part=>part.type!=='literal').map(part=>[part.type,part.value]))
const isoDate=date=>date.toISOString().slice(0,10)
const observed=(year,month,day)=>{const date=new Date(Date.UTC(year,month-1,day)),weekday=date.getUTCDay();if(weekday===6)date.setUTCDate(date.getUTCDate()-1);if(weekday===0)date.setUTCDate(date.getUTCDate()+1);return isoDate(date)}
const nthWeekday=(year,month,weekday,nth)=>{const date=new Date(Date.UTC(year,month-1,1));date.setUTCDate(1+(weekday-date.getUTCDay()+7)%7+(nth-1)*7);return isoDate(date)}
const lastWeekday=(year,month,weekday)=>{const date=new Date(Date.UTC(year,month,0));date.setUTCDate(date.getUTCDate()-(date.getUTCDay()-weekday+7)%7);return isoDate(date)}
const easterSunday=year=>{const a=year%19,b=Math.floor(year/100),c=year%100,d=Math.floor(b/4),e=b%4,f=Math.floor((b+8)/25),g=Math.floor((b-f+1)/3),h=(19*a+b-d-g+15)%30,i=Math.floor(c/4),k=c%4,l=(32+2*e+2*i-h-k)%7,m=Math.floor((a+11*h+22*l)/451),month=Math.floor((h+l-7*m+114)/31),day=(h+l-7*m+114)%31+1;return new Date(Date.UTC(year,month-1,day))}
const marketHolidays=year=>{const easter=easterSunday(year);easter.setUTCDate(easter.getUTCDate()-2);return new Set([observed(year,1,1),nthWeekday(year,1,1,3),nthWeekday(year,2,1,3),isoDate(easter),lastWeekday(year,5,1),observed(year,6,19),observed(year,7,4),nthWeekday(year,9,1,1),nthWeekday(year,11,4,4),observed(year,12,25)])}
const isTradingDay=(year,month,day)=>{const date=new Date(Date.UTC(year,month-1,day));return date.getUTCDay()!==0&&date.getUTCDay()!==6&&!marketHolidays(year).has(isoDate(date))}
const isEarlyClose=(year,month,day)=>{const date=new Date(Date.UTC(year,month-1,day)),thanksgiving=nthWeekday(year,11,4,4),blackFriday=new Date(`${thanksgiving}T00:00:00Z`);blackFriday.setUTCDate(blackFriday.getUTCDate()+1);const value=isoDate(date);return value===isoDate(blackFriday)||(value===`${year}-12-24`&&isTradingDay(year,month,day))||(value===`${year}-07-03`&&isTradingDay(year,month,day)&&!marketHolidays(year).has(value))}
const marketIsOpen=(now=new Date())=>{const parts=nyParts(now),year=Number(parts.year),month=Number(parts.month),day=Number(parts.day),minute=Number(parts.hour)*60+Number(parts.minute);if(!isTradingDay(year,month,day))return false;const closeMinute=(isEarlyClose(year,month,day)?13:16)*60;return minute>=9*60+30&&minute<closeMinute}

function localPriceContext(){
  const databaseFile=existsSync(databaseRoot)?readdirSync(databaseRoot).find(name=>name.endsWith('.sqlite')&&name!=='metadata.sqlite'):null
  if(!databaseFile)fail('로컬 D1 데이터베이스를 찾을 수 없습니다. 일일 수집을 먼저 완료하세요.')
  const db=new DatabaseSync(join(databaseRoot,databaseFile),{readOnly:true})
  try{
    const rows=db.prepare("SELECT ticker, close FROM daily_prices WHERE source = 'TOSS' AND (ticker, market_date) IN (SELECT ticker, MAX(market_date) FROM daily_prices WHERE source = 'TOSS' GROUP BY ticker)").all()
    return new Map(rows.filter(row=>validTicker(row.ticker)&&row.ticker!=='SPCX'&&finite(row.close)).map(row=>[row.ticker,row.close]))
  }finally{db.close()}
}

async function supabaseGet(path){const response=await fetch(`${SUPABASE_URL}/rest/v1/${path}`,{headers:supabaseHeaders});if(!response.ok)fail(`Supabase 조회 실패 (${response.status})`);return response.json()}
async function upsert(table,rows,conflict){const response=await fetch(`${SUPABASE_URL}/rest/v1/${table}?on_conflict=${encodeURIComponent(conflict)}`,{method:'POST',headers:{...supabaseHeaders,Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify(rows)});if(!response.ok)fail(`Supabase ${table} 저장 실패 (${response.status})`)}
async function loadStatus(){const rows=await supabaseGet(`collector_status?collector_id=eq.${COLLECTOR_ID}&select=*`);return Array.isArray(rows)?rows[0]??null:null}
async function saveStatus(next){await upsert('collector_status',[{collector_id:COLLECTOR_ID,...next,updated_at:nowIso()}],'collector_id')}

async function publicIp(){const response=await fetch('https://api.ipify.org?format=json',{signal:AbortSignal.timeout(10_000)});if(!response.ok)fail(`공인 IP 확인 실패 (${response.status})`);const body=await response.json();if(typeof body.ip!=='string'||!body.ip)return fail('공인 IP 확인값이 없습니다.');return body.ip}
async function inspectStartupIp(){
  const [previous,current]=await Promise.all([loadStatus(),publicIp()]);lastKnownIp=current
  if(previous?.current_ip&&previous.current_ip!==current){await saveStatus({status:'IP_CHANGED',previous_ip:previous.current_ip,current_ip:current,detected_at:nowIso(),last_success_at:previous.last_success_at??null,last_error_code:null,last_error_message:null});console.warn(`공인 IP 변경 감지: ${previous.current_ip} → ${current}`);return}
  await saveStatus({status:previous?.status==='IP_CHANGED'?'IP_CHANGED':'NORMAL',previous_ip:previous?.previous_ip??null,current_ip:current,detected_at:previous?.detected_at??null,last_success_at:previous?.last_success_at??null,last_error_code:null,last_error_message:null})
}

class TossHttpError extends Error{constructor(status,code,message){super(`TOSS HTTP ${status}`);this.status=status;this.code=code;this.apiMessage=message}}
const safeError=(body)=>{const source=body&&typeof body==='object'?body:{};const code=typeof source.code==='string'?source.code:typeof source.error_code==='string'?source.error_code:null;const message=typeof source.message==='string'?source.message:typeof source.error_description==='string'?source.error_description:null;return{code:code?.slice(0,120)??null,message:message?.slice(0,240)??null}}
async function tossToken(){
  if(accessToken&&Date.now()<accessTokenExpiresAt)return accessToken
  const response=await fetch(`${TOSS_BASE_URL}/oauth2/token`,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'client_credentials',client_id:CLIENT_ID,client_secret:CLIENT_SECRET})})
  const body=await response.json().catch(()=>null);if(!response.ok){const detail=safeError(body);throw new TossHttpError(response.status,detail.code,detail.message)}
  if(typeof body?.access_token!=='string')throw new TossHttpError(response.status,'INVALID_TOKEN_RESPONSE','access_token missing')
  accessToken=body.access_token;accessTokenExpiresAt=Date.now()+Math.max(60,Number(body.expires_in??3600)-60)*1000;return accessToken
}
async function tossPrices(tickers){
  const token=await tossToken(),response=await fetch(`${TOSS_BASE_URL}/api/v1/prices?symbols=${encodeURIComponent(tickers.join(','))}`,{headers:{Authorization:`Bearer ${token}`}}),body=await response.json().catch(()=>null)
  if(!response.ok){const detail=safeError(body);throw new TossHttpError(response.status,detail.code,detail.message)}
  const rows=Array.isArray(body?.result)?body.result:[]
  return Object.fromEntries(rows.map(row=>[String(row.symbol??row.ticker??'').toUpperCase(),Number(row.lastPrice??row.price??row.close)]).filter(([ticker,price])=>validTicker(ticker)&&finite(price)))
}
const looksLikeIpOrAuthError=error=>error instanceof TossHttpError&&(error.status===401||error.status===403||/ip|auth|credential|permission/i.test(`${error.code??''} ${error.apiMessage??''}`))
async function recordTossError(error){
  if(looksLikeIpOrAuthError(error)){
    const previous=await loadStatus(),current=await publicIp().catch(()=>lastKnownIp)
    if(current&&previous?.current_ip&&previous.current_ip!==current){await saveStatus({status:'IP_CHANGED',previous_ip:previous.current_ip,current_ip:current,detected_at:nowIso(),last_success_at:previous.last_success_at??null,last_error_code:error.code??`HTTP_${error.status}`,last_error_message:error.apiMessage??null});lastKnownIp=current;return}
  }
  const status=await loadStatus();await saveStatus({status:'API_ERROR',previous_ip:status?.previous_ip??null,current_ip:status?.current_ip??lastKnownIp,detected_at:status?.detected_at??null,last_success_at:status?.last_success_at??null,last_error_code:error instanceof TossHttpError?error.code??`HTTP_${error.status}`:'NETWORK_ERROR',last_error_message:error instanceof TossHttpError?error.apiMessage??'TOSS request failed':'TOSS request failed'})
}
async function poll(){
  const closes=localPriceContext(),tickers=[...closes.keys()]
  if(!tickers.length)fail('관리 대상 TOSS 종목이 없습니다.')
  try{
    const prices=await tossPrices(tickers),updatedAt=nowIso(),rows=Object.entries(prices).map(([ticker,price])=>{const close=closes.get(ticker)??null,change=close===null?null:price-close;return{ticker,price,change,change_percent:close?change/close:null,updated_at:updatedAt}})
    if(!rows.length)throw new Error('TOSS 현재가 응답이 비어 있습니다.')
    await upsert('latest_prices',rows,'ticker')
    await saveStatus({status:'NORMAL',previous_ip:null,current_ip:lastKnownIp,detected_at:null,last_success_at:updatedAt,last_error_code:null,last_error_message:null})
    console.log(`현재가 동기화 완료: ${rows.length}개 · ${updatedAt}`)
  }catch(error){await recordTossError(error).catch(()=>null);const summary=error instanceof TossHttpError?`TOSS ${error.status} ${error.code??''} ${error.apiMessage??''}`:error instanceof Error?error.message:'unknown error';console.error(`현재가 동기화 실패: ${summary}`)}
}
async function main(){
  await inspectStartupIp().catch(error=>console.error(`수집기 시작 IP 점검 실패: ${error instanceof Error?error.message:'unknown error'}`))
  console.log('TOSS 장중 현재가 수집기 시작 · 미국 정규장에만 1분 간격으로 동기화합니다.')
  for(;;){if(marketIsOpen())await poll();const wait=60_000-(Date.now()%60_000)+150;await delay(wait)}
}
void main()
