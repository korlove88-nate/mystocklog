import { describe, expect, it } from 'vitest'
import { symbolMaster } from './symbol-master'

describe('symbolMaster',()=>{
  it('maps Berkshire Hathaway for GoogleFinance metadata',()=>{
    expect(symbolMaster['BRK-B'].googleFinanceSymbol).toBe('NYSE:BRK.B')
  })
  it('does not invent a listed symbol for private SpaceX',()=>{
    expect(symbolMaster.SPCX.googleFinanceSymbol).toBeNull()
  })
})
