import { describe, expect, it } from 'vitest'
import { parseGoogleSheetDate } from './google-finance-sheets'

describe('Google Sheets date normalization',()=>{
  it('keeps ISO dates',()=>expect(parseGoogleSheetDate('2026-08-13')).toBe('2026-08-13'))
  it('converts Google serial dates',()=>expect(parseGoogleSheetDate('45401.66667')).toBe('2024-04-19'))
})
