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
