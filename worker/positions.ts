import { positionSchemas } from '../db/schema'
import { applyPositionTransaction, type PositionAction, type PositionTotals } from '../src/services/positionCalculator'

type Snapshot={opportunityScore?:number|null;priceStability?:string|null;buyZoneLow?:number|null;buyZoneHigh?:number|null;buyZoneMid?:number|null;profitZoneLow?:number|null;profitZoneHigh?:number|null;fixedProfitMid?:number|null}
type PositionRow={id:string;ticker:string;status:'OPEN'|'CLOSED';total_quantity:number;avg_price:number;realized_pnl:number;opened_at:string;closed_at:string|null;created_at:string;updated_at:string}
type TransactionRow={id:string;position_id:string;ticker:string;transaction_type:PositionAction;trade_date:string;quantity:number;price:number;opportunity_score:number|null;price_stability:string|null;buy_zone_low:number|null;buy_zone_high:number|null;buy_zone_mid:number|null;profit_zone_low:number|null;profit_zone_high:number|null;fixed_profit_mid:number|null;memo:string|null;realized_pnl:number|null;created_at:string}
type Input={action?:PositionAction;positionId?:string;transactionId?:string;ticker?:string;tradeDate?:string;quantity?:number;price?:number;memo?:string;snapshot?:Snapshot}
const iso=()=>new Date().toISOString()
const json=(value:unknown,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'private, no-store'}})
const asNumber=(value:unknown)=>typeof value==='number'&&Number.isFinite(value)?value:null

export async function ensurePositionSchema(db:D1Database){for(const sql of positionSchemas)await db.prepare(sql).run()}
const mapPosition=(row:PositionRow)=>({id:row.id,ticker:row.ticker,status:row.status,totalQuantity:Number(row.total_quantity),avgPrice:Number(row.avg_price),realizedPnl:Number(row.realized_pnl??0),openedAt:row.opened_at,closedAt:row.closed_at,createdAt:row.created_at,updatedAt:row.updated_at})
const mapTransaction=(row:TransactionRow)=>({id:row.id,positionId:row.position_id,ticker:row.ticker,transactionType:row.transaction_type,tradeDate:row.trade_date,quantity:Number(row.quantity),price:Number(row.price),opportunityScore:row.opportunity_score,priceStability:row.price_stability,buyZoneLow:row.buy_zone_low,buyZoneHigh:row.buy_zone_high,buyZoneMid:row.buy_zone_mid,profitZoneLow:row.profit_zone_low,profitZoneHigh:row.profit_zone_high,fixedProfitMid:row.fixed_profit_mid,memo:row.memo,realizedPnl:row.realized_pnl,createdAt:row.created_at})

export async function handlePositionApi(request:Request,db:D1Database):Promise<Response>{
  await ensurePositionSchema(db)
  if(request.method==='GET'){
    const url=new URL(request.url),status=url.searchParams.get('status')??'OPEN',id=url.searchParams.get('id')
    if(id){const position=await db.prepare('SELECT * FROM positions WHERE id=?1').bind(id).first<PositionRow>();if(!position)return json({error:'보유 기록을 찾을 수 없습니다.'},404);const transactions=await db.prepare('SELECT * FROM position_transactions WHERE position_id=?1 ORDER BY trade_date DESC,created_at DESC').bind(id).all<TransactionRow>();return json({position:mapPosition(position),transactions:transactions.results.map(mapTransaction)})}
    const query=status==='ALL'?'SELECT * FROM positions ORDER BY status ASC,updated_at DESC':'SELECT * FROM positions WHERE status=?1 ORDER BY updated_at DESC',rows=status==='ALL'?await db.prepare(query).all<PositionRow>():await db.prepare(query).bind(status).all<PositionRow>();return json({positions:rows.results.map(mapPosition)})
  }
  if(request.method!=='POST'&&request.method!=='PUT')return json({error:'Method not allowed'},405)
  let input:Input;try{input=await request.json() as Input}catch{return json({error:'Invalid JSON'},400)}
  const quantity=asNumber(input.quantity),price=asNumber(input.price),tradeDate=typeof input.tradeDate==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(input.tradeDate)?input.tradeDate:null
  if(!quantity||!price||!tradeDate)return json({error:'입력값을 확인하세요.'},422)
  if(request.method==='PUT'){
    if(!input.transactionId)return json({error:'수정할 거래 기록을 선택하세요.'},422)
    const original=await db.prepare('SELECT * FROM position_transactions WHERE id=?1').bind(input.transactionId).first<TransactionRow>()
    if(!original)return json({error:'거래 기록을 찾을 수 없습니다.'},404)
    const position=await db.prepare('SELECT * FROM positions WHERE id=?1').bind(original.position_id).first<PositionRow>()
    if(!position)return json({error:'보유 기록을 찾을 수 없습니다.'},404)
    const rows=(await db.prepare('SELECT * FROM position_transactions WHERE position_id=?1 ORDER BY trade_date ASC,created_at ASC').bind(original.position_id).all<TransactionRow>()).results
    const entries=rows.map(row=>row.id===original.id?{...row,trade_date:tradeDate!,quantity,price}:row).sort((a,b)=>a.trade_date.localeCompare(b.trade_date)||a.created_at.localeCompare(b.created_at))
    let totals:PositionTotals|null=null
    const recalculated:{id:string;quantity:number;realized:number|null}[]=[]
    try{
      for(const row of entries){
        const entryQuantity=Number(row.quantity),entryPrice=Number(row.price),action=row.transaction_type
        const prior=totals
        totals=applyPositionTransaction(totals,action,entryQuantity,entryPrice)
        const actualQuantity=action==='EXIT'&&prior?prior.quantity:entryQuantity
        recalculated.push({id:row.id,quantity:actualQuantity,realized:action==='BUY'||action==='ADD'?null:(entryPrice-prior!.averagePrice)*actualQuantity})
      }
    }catch(error){return json({error:error instanceof Error?`수정 후 거래 순서가 유효하지 않습니다: ${error.message}`:'거래 기록을 수정할 수 없습니다.'},422)}
    if(!totals)return json({error:'거래 기록을 찾을 수 없습니다.'},404)
    const now=iso(),memo=typeof input.memo==='string'?input.memo.slice(0,1000):null
    try{
      const statements=recalculated.filter(row=>row.id!==original.id).map(row=>db.prepare('UPDATE position_transactions SET quantity=?1,realized_pnl=?2 WHERE id=?3').bind(row.quantity,row.realized,row.id))
      statements.unshift(db.prepare('UPDATE position_transactions SET trade_date=?1,quantity=?2,price=?3,memo=?4,realized_pnl=?5 WHERE id=?6').bind(tradeDate,recalculated.find(row=>row.id===original.id)!.quantity,price,memo,recalculated.find(row=>row.id===original.id)!.realized,original.id))
      statements.push(db.prepare('UPDATE positions SET status=?1,total_quantity=?2,avg_price=?3,realized_pnl=?4,opened_at=?5,closed_at=?6,updated_at=?7 WHERE id=?8').bind(totals.status,totals.quantity,totals.averagePrice,totals.realizedPnl,entries.find(row=>row.transaction_type==='BUY')?.trade_date??tradeDate,totals.status==='CLOSED'?entries.at(-1)?.trade_date??tradeDate:null,now,original.position_id))
      await db.batch(statements)
    }catch(error){return json({error:'D1 수정에 실패했습니다.',detail:String(error)},500)}
    const updated=await db.prepare('SELECT * FROM positions WHERE id=?1').bind(original.position_id).first<PositionRow>()
    return json({position:updated?mapPosition(updated):null,transactionId:original.id})
  }
  const action=input.action
  if(!action||!['BUY','ADD','PARTIAL_EXIT','EXIT'].includes(action))return json({error:'입력값을 확인하세요.'},422)
  const ticker=typeof input.ticker==='string'?input.ticker.trim().toUpperCase():''
  let current:PositionRow|null=null
  if(action==='BUY'){if(!ticker)return json({error:'종목을 선택하세요.'},422);current=await db.prepare("SELECT * FROM positions WHERE ticker=?1 AND status='OPEN' LIMIT 1").bind(ticker).first<PositionRow>()??null;if(current)return json({error:'이미 보유 중인 종목입니다. 추가매수 기록을 사용하세요.'},409)}
  else {if(!input.positionId)return json({error:'보유 기록을 선택하세요.'},422);current=await db.prepare('SELECT * FROM positions WHERE id=?1').bind(input.positionId).first<PositionRow>()??null;if(!current)return json({error:'보유 기록을 찾을 수 없습니다.'},404)}
  let next:PositionTotals;try{next=applyPositionTransaction(current?{quantity:Number(current.total_quantity),averagePrice:Number(current.avg_price),realizedPnl:Number(current.realized_pnl??0),status:current.status}:null,action,quantity,price)}catch(error){return json({error:error instanceof Error?error.message:'거래 기록을 처리하지 못했습니다.'},422)}
  const now=iso(),positionId=current?.id??crypto.randomUUID(),transactionId=crypto.randomUUID(),snapshot=input.snapshot??{},actualQuantity=action==='EXIT'&&current?Number(current.total_quantity):quantity,realized=action==='ADD'||action==='BUY'?null:(price-Number(current!.avg_price))*actualQuantity
  try{
    if(!current)await db.prepare('INSERT INTO positions(id,ticker,status,total_quantity,avg_price,realized_pnl,opened_at,closed_at,created_at,updated_at) VALUES(?1,?2,?3,?4,?5,?6,?7,NULL,?8,?8)').bind(positionId,ticker,next.status,next.quantity,next.averagePrice,next.realizedPnl,tradeDate,now).run()
    else await db.prepare('UPDATE positions SET status=?1,total_quantity=?2,avg_price=?3,realized_pnl=?4,closed_at=?5,updated_at=?6 WHERE id=?7').bind(next.status,next.quantity,next.averagePrice,next.realizedPnl,next.status==='CLOSED'?tradeDate:null,now,positionId).run()
    await db.prepare('INSERT INTO position_transactions(id,position_id,ticker,transaction_type,trade_date,quantity,price,opportunity_score,price_stability,buy_zone_low,buy_zone_high,buy_zone_mid,profit_zone_low,profit_zone_high,fixed_profit_mid,memo,realized_pnl,created_at) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18)').bind(transactionId,positionId,current?.ticker??ticker,action,tradeDate,actualQuantity,price,snapshot.opportunityScore??null,snapshot.priceStability??null,snapshot.buyZoneLow??null,snapshot.buyZoneHigh??null,snapshot.buyZoneMid??null,snapshot.profitZoneLow??null,snapshot.profitZoneHigh??null,snapshot.fixedProfitMid??null,typeof input.memo==='string'?input.memo.slice(0,1000):null,realized,now).run()
  }catch(error){return json({error:'D1 저장에 실패했습니다.',detail:String(error)},500)}
  const position=await db.prepare('SELECT * FROM positions WHERE id=?1').bind(positionId).first<PositionRow>();return json({position:position?mapPosition(position):null,transactionId})
}
