export type PositionAction='BUY'|'ADD'|'PARTIAL_EXIT'|'EXIT'
export type PositionTotals={quantity:number;averagePrice:number;realizedPnl:number;status:'OPEN'|'CLOSED'}

/** Applies an immutable transaction to the current position totals. */
export function applyPositionTransaction(current:PositionTotals|null,action:PositionAction,quantity:number,price:number):PositionTotals{
  if(!Number.isFinite(quantity)||quantity<=0||!Number.isFinite(price)||price<=0)throw new Error('가격과 수량은 0보다 커야 합니다.')
  if(action==='BUY'){
    if(current)throw new Error('새 진입은 기존 보유가 없을 때만 기록할 수 있습니다.')
    return{quantity,averagePrice:price,realizedPnl:0,status:'OPEN'}
  }
  if(!current||current.status!=='OPEN')throw new Error('현재 보유 중인 종목만 기록할 수 있습니다.')
  if(action==='ADD'){
    const nextQuantity=current.quantity+quantity
    return{quantity:nextQuantity,averagePrice:(current.quantity*current.averagePrice+quantity*price)/nextQuantity,realizedPnl:current.realizedPnl,status:'OPEN'}
  }
  const exitQuantity=action==='EXIT'?current.quantity:quantity
  if(exitQuantity>current.quantity+1e-9)throw new Error('정리 수량이 현재 보유 수량보다 많습니다.')
  const remaining=Math.max(0,current.quantity-exitQuantity)
  return{quantity:remaining,averagePrice:current.averagePrice,realizedPnl:current.realizedPnl+(price-current.averagePrice)*exitQuantity,status:remaining===0?'CLOSED':'OPEN'}
}
