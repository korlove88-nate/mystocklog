import type { HistoricalPrice, StockQuote } from '../src/types'

type SheetConfig = { spreadsheetId: string; apiKey: string; masterRange: string; historyRange: string }
type SheetRow = Record<string, string>
export type GoogleFinanceRecord = {
  quote: StockQuote | null
  historicalPrices: HistoricalPrice[]
  high52: number | null
  low52: number | null
  status: string | null
  updatedAt: string | null
}

const numberOrNull = (value: unknown) => {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value !== 'string' || !value.trim()) return null
  const normalized = value.replace(/[,$%]/g,'').trim()
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : null
}

const table = (values: unknown): SheetRow[] => {
  if (!Array.isArray(values) || !Array.isArray(values[0])) return []
  const rows = values as unknown[][]
  const headers = rows[0].map(value => String(value).trim().toLowerCase())
  return rows.slice(1).map(row => Object.fromEntries(headers.map((header,index) => [header,String(row[index] ?? '').trim()])))
}

async function readRange(config: SheetConfig, range: string): Promise<SheetRow[]> {
  const endpoint = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(config.spreadsheetId)}/values/${encodeURIComponent(range)}?majorDimension=ROWS&key=${encodeURIComponent(config.apiKey)}`
  const response = await fetch(endpoint, { signal: AbortSignal.timeout(12_000) })
  if (!response.ok) throw new Error(`Google Sheets ${response.status}`)
  const body = await response.json() as { values?: unknown }
  return table(body.values)
}

export async function loadGoogleFinanceSheet(config: SheetConfig): Promise<Record<string, GoogleFinanceRecord>> {
  const [masterRows,historyRows] = await Promise.all([readRange(config,config.masterRange),readRange(config,config.historyRange)])
  const histories = new Map<string,HistoricalPrice[]>()
  for (const row of historyRows) {
    const ticker = row.ticker?.toUpperCase()
    const close = numberOrNull(row.close)
    if (!ticker || !/^\d{4}-\d{2}-\d{2}$/.test(row.date ?? '') || close === null || close <= 0) continue
    const list = histories.get(ticker) ?? []
    list.push({date:row.date,close,adjustedClose:close})
    histories.set(ticker,list)
  }
  const output: Record<string,GoogleFinanceRecord> = {}
  for (const row of masterRows) {
    const ticker = row.ticker?.toUpperCase()
    if (!ticker) continue
    const price = numberOrNull(row.current_price ?? row.price)
    const changeRaw = numberOrNull(row.change_percent ?? row.change_pct)
    const history = (histories.get(ticker) ?? []).sort((a,b) => a.date.localeCompare(b.date))
    const marketDate = row.market_date || history.at(-1)?.date || null
    output[ticker] = {
      quote: price === null ? null : {ticker,price,previousClose:null,changePercent:changeRaw !== null ? (Math.abs(changeRaw) > 1 ? changeRaw / 100 : changeRaw) : null,marketDate},
      historicalPrices:history,
      high52:numberOrNull(row.high_52w ?? row.high52), low52:numberOrNull(row.low_52w ?? row.low52),
      status:row.status || null, updatedAt:row.updated_at || null,
    }
  }
  return output
}

