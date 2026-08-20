import { describe, expect, it } from 'vitest'
import { marketDataSchemas } from './schema'

describe('market data source schema',()=>{
  it('records the single source of truth for stored rows',()=>{
    expect(marketDataSchemas[0]).toContain('source TEXT NOT NULL')
    expect(marketDataSchemas[1]).toContain("price_source TEXT NOT NULL DEFAULT 'TOSS'")
    expect(marketDataSchemas[1]).toContain("eps_source TEXT NOT NULL DEFAULT 'GOOGLE_FINANCE'")
    expect(marketDataSchemas[1]).toContain("per_source TEXT NOT NULL DEFAULT 'GOOGLE_FINANCE'")
    expect(marketDataSchemas[1]).toContain("market_cap_source TEXT NOT NULL DEFAULT 'GOOGLE_FINANCE'")
    expect(marketDataSchemas[1]).toContain("mdd_source TEXT NOT NULL DEFAULT 'APP_CALCULATED'")
    expect(marketDataSchemas[1]).toContain("ma_source TEXT NOT NULL DEFAULT 'APP_CALCULATED'")
    expect(marketDataSchemas[1]).toContain("price_stability_source TEXT NOT NULL DEFAULT 'APP_CALCULATED'")
  })
})
