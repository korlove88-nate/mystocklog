process.env.EXTERNAL_PHASE='5.1'
process.env.EXTERNAL_OUTPUT='phase5_1'
process.env.EXTERNAL_REFERENCE_TICKERS='NVDA,AVGO'
process.env.EXTERNAL_TEST_TICKERS='AMD,MU,TSM,ASML'
await import('./phase5_0.mjs')
