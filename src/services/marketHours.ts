export type MarketSessionStatus = 'pre'|'open'|'closed'|'holiday'

export type MarketHours = {
  et: string
  kst: string
  status: MarketSessionStatus
  statusLabel: string
}

const partsFor = (date:Date,timeZone:string) => Object.fromEntries(
  new Intl.DateTimeFormat('en-US',{timeZone,year:'numeric',month:'2-digit',day:'2-digit',weekday:'short',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(date).filter(part=>part.type!=='literal').map(part=>[part.type,part.value]),
)

const offsetMinutes = (date:Date,timeZone:string) => {
  const name = new Intl.DateTimeFormat('en-US',{timeZone,timeZoneName:'longOffset'}).formatToParts(date).find(part=>part.type==='timeZoneName')?.value ?? 'GMT+00:00'
  const match=name.match(/GMT([+-])(\d{2}):(\d{2})/)
  if(!match)return 0
  const minutes=Number(match[2])*60+Number(match[3])
  return match[1]==='-'?-minutes:minutes
}

const newYorkTimeToUtc = (year:number,month:number,day:number,hour:number,minute:number) => {
  const guess=new Date(Date.UTC(year,month-1,day,hour,minute))
  return new Date(guess.getTime()-offsetMinutes(guess,'America/New_York')*60_000)
}

const isoDate=(date:Date)=>date.toISOString().slice(0,10)
const observed=(year:number,month:number,day:number)=>{const date=new Date(Date.UTC(year,month-1,day)),weekday=date.getUTCDay();if(weekday===6)date.setUTCDate(date.getUTCDate()-1);if(weekday===0)date.setUTCDate(date.getUTCDate()+1);return isoDate(date)}
const nthWeekday=(year:number,month:number,weekday:number,nth:number)=>{const date=new Date(Date.UTC(year,month-1,1));date.setUTCDate(1+(weekday-date.getUTCDay()+7)%7+(nth-1)*7);return isoDate(date)}
const lastWeekday=(year:number,month:number,weekday:number)=>{const date=new Date(Date.UTC(year,month,0));date.setUTCDate(date.getUTCDate()-(date.getUTCDay()-weekday+7)%7);return isoDate(date)}
const easterSunday=(year:number)=>{const a=year%19,b=Math.floor(year/100),c=year%100,d=Math.floor(b/4),e=b%4,f=Math.floor((b+8)/25),g=Math.floor((b-f+1)/3),h=(19*a+b-d-g+15)%30,i=Math.floor(c/4),k=c%4,l=(32+2*e+2*i-h-k)%7,m=Math.floor((a+11*h+22*l)/451),month=Math.floor((h+l-7*m+114)/31),day=(h+l-7*m+114)%31+1;return new Date(Date.UTC(year,month-1,day))}
const marketHolidays=(year:number)=>{const easter=easterSunday(year);easter.setUTCDate(easter.getUTCDate()-2);return new Set([observed(year,1,1),nthWeekday(year,1,1,3),nthWeekday(year,2,1,3),isoDate(easter),lastWeekday(year,5,1),observed(year,6,19),observed(year,7,4),nthWeekday(year,9,1,1),nthWeekday(year,11,4,4),observed(year,12,25)])}
const isTradingDay=(date:Date)=>date.getUTCDay()!==0&&date.getUTCDay()!==6&&!marketHolidays(date.getUTCFullYear()).has(isoDate(date))

export const latestCompletedUsMarketDate=(now=new Date())=>{
  const ny=partsFor(now,'America/New_York'),candidate=new Date(Date.UTC(Number(ny.year),Number(ny.month)-1,Number(ny.day)))
  if(Number(ny.hour)<16)candidate.setUTCDate(candidate.getUTCDate()-1)
  while(!isTradingDay(candidate))candidate.setUTCDate(candidate.getUTCDate()-1)
  return isoDate(candidate)
}

export const isStoredPriceStale=(marketDate:string|null|undefined,now=new Date())=>Boolean(marketDate&&marketDate<latestCompletedUsMarketDate(now))

export const getMarketHours = (now=new Date()):MarketHours => {
  const ny=partsFor(now,'America/New_York')
  const year=Number(ny.year),month=Number(ny.month),day=Number(ny.day)
  const open=newYorkTimeToUtc(year,month,day,9,30),close=newYorkTimeToUtc(year,month,day,16,0)
  const kstFormatter=new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Seoul',hour:'2-digit',minute:'2-digit',hourCycle:'h23'})
  const weekend=ny.weekday==='Sat'||ny.weekday==='Sun'
  const status:MarketSessionStatus=weekend?'holiday':now<open?'pre':now<close?'open':'closed'
  const statusLabel={pre:'장 시작 전',open:'장중',closed:'장 마감',holiday:'휴장'}[status]
  return {et:'09:30–16:00',kst:`${kstFormatter.format(open)}–${kstFormatter.format(close)}`,status,statusLabel}
}
