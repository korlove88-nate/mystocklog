import { describe, expect, it } from 'vitest'
import { applyPositionTransaction } from './positionCalculator'

describe('applyPositionTransaction',()=>{
  it('calculates weighted average across entry and additions',()=>{const buy=applyPositionTransaction(null,'BUY',10,100),add=applyPositionTransaction(buy,'ADD',10,120),addAgain=applyPositionTransaction(add,'ADD',5,80);expect(addAgain).toMatchObject({quantity:25,averagePrice:104,realizedPnl:0,status:'OPEN'})})
  it('keeps average price after a partial exit and records realized pnl',()=>{const buy=applyPositionTransaction(null,'BUY',10,100),next=applyPositionTransaction(buy,'PARTIAL_EXIT',4,130);expect(next).toMatchObject({quantity:6,averagePrice:100,realizedPnl:120,status:'OPEN'})})
  it('closes the full remaining quantity on exit',()=>{const buy=applyPositionTransaction(null,'BUY',5,100),next=applyPositionTransaction(buy,'EXIT',1,90);expect(next).toMatchObject({quantity:0,averagePrice:100,realizedPnl:-50,status:'CLOSED'})})
})
