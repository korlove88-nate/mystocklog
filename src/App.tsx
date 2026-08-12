'use client'

import { useEffect, useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, FileSpreadsheet, Home, Menu, NotebookPen, Search, Settings, SlidersHorizontal, X } from 'lucide-react'
import { referenceSnapshot } from './data/referenceSnapshot'
import { stockDataProvider, type DataMode } from './services/stockData'
import type { MetricValue, StockSnapshot } from './types'

type SortKey = keyof StockSnapshot | `mdd${number}`
type Column = { key: SortKey; label: string; kind: 'text'|'money'|'percent'|'cap'|'number'; sticky?: 'ticker'|'company' }
const currentYear = new Date().getUTCFullYear()
const mddYears = [currentYear - 2, currentYear - 1, currentYear]
const columns: Column[] = [
  {key:'ticker',label:'티커',kind:'text',sticky:'ticker'}, {key:'company',label:'종목명',kind:'text',sticky:'company'}, {key:'sector',label:'업종',kind:'text'},
  {key:'marketCap',label:'시가총액',kind:'cap'}, {key:'pe',label:'PER',kind:'number'}, {key:'eps',label:'EPS',kind:'money'}, {key:'price',label:'현재가',kind:'money'},
  {key:'changePercent',label:'전일대비',kind:'percent'}, {key:'ath',label:'ATH',kind:'money'}, {key:'high52',label:'52주 고점',kind:'money'}, {key:'drawdown52',label:'52주 고점 대비',kind:'percent'},
  {key:'low52',label:'52주 저점',kind:'money'}, {key:'atl',label:'ATL',kind:'money'},
  ...mddYears.map(year => ({key:`mdd${year}` as SortKey,label:`MDD ${year}`,kind:'percent' as const})),
  {key:'yearOpen',label:'연초가',kind:'money'}, {key:'ytdReturn',label:'YTD',kind:'percent'},
]
const getValue = (stock: StockSnapshot, key: SortKey): MetricValue|string|null => key.startsWith('mdd') ? stock.mdd[Number(key.slice(3))] : stock[key as keyof StockSnapshot] as MetricValue|string|null
const fmt = (value: MetricValue|string|null, kind: Column['kind']) => {
  if (value === null || value === undefined || value === '') return '—'
  if (typeof value === 'string') return value
  if (kind === 'percent') return `${value > 0 ? '+' : ''}${(value * 100).toFixed(2)}%`
  if (kind === 'cap') return value >= 1e12 ? `$${(value/1e12).toFixed(2)}T` : value >= 1e9 ? `$${(value/1e9).toFixed(1)}B` : `$${(value/1e6).toFixed(0)}M`
  if (kind === 'money') return `$${value.toLocaleString('en-US',{maximumFractionDigits:2})}`
  return value.toLocaleString('en-US',{maximumFractionDigits:2})
}
const miniChartPoints = (stock: StockSnapshot) => {
  const values = stock.priceHistory.slice(-90).map(point => point.adjustedClose ?? point.close).filter(Number.isFinite)
  if (values.length < 2) return ''
  const min = Math.min(...values), max = Math.max(...values), range = max - min || 1
  return values.map((value,index) => `${4 + index * 312 / (values.length - 1)},${82 - (value - min) * 62 / range}`).join(' ')
}

function App() {
  const [query,setQuery] = useState(''); const [selectedTicker,setSelectedTicker] = useState<string|null>(null); const [sort,setSort] = useState<{key:SortKey;dir:1|-1}>({key:'ticker',dir:1}); const [mobileNav,setMobileNav] = useState(false)
  const [allStocks,setAllStocks] = useState(referenceSnapshot); const [dataMode,setDataMode] = useState<DataMode>('fallback'); const [marketDate,setMarketDate] = useState<string|null>(null)
  useEffect(()=>{let active=true; stockDataProvider.getStocks().then(result=>{if(active){setAllStocks(result.stocks);setDataMode(result.mode);setMarketDate(result.marketDate)}});return()=>{active=false}},[])
  const selected = allStocks.find(stock=>stock.ticker===selectedTicker) ?? null
  const stocks = useMemo(() => allStocks.filter(s => `${s.ticker} ${s.company} ${s.sector ?? ''}`.toLowerCase().includes(query.toLowerCase())).sort((a,b) => {
    const av=getValue(a,sort.key), bv=getValue(b,sort.key); if(av==null)return 1;if(bv==null)return -1;return (typeof av==='number'&&typeof bv==='number'?av-bv:String(av).localeCompare(String(bv)))*sort.dir
  }),[allStocks,query,sort])
  const sortBy=(key:SortKey)=>setSort(p=>({key,dir:p.key===key?p.dir===1?-1:1:1}))
  return <div className="app-shell">
    <aside className={mobileNav?'sidebar open':'sidebar'}><div className="brand"><div className="brand-mark">A</div><div><strong>IM GLOBAL</strong><span>ANT</span></div><button className="mobile-close" onClick={()=>setMobileNav(false)}><X/></button></div><nav><button className="active"><Home/>홈</button><button disabled><FileSpreadsheet/>개별종목</button><button disabled><NotebookPen/>전략노트</button><button disabled><Settings/>설정</button></nav><div className="sidebar-foot"><span>V1 · 개인 투자 대시보드</span><small>정보 비교용 · 투자 권유 아님</small></div></aside>
    <main><header><button className="menu-button" onClick={()=>setMobileNav(true)}><Menu/></button><h1>관심종목 비교</h1></header>
      <section className="toolbar"><label><Search/><input aria-label="종목 검색" placeholder="티커, 종목명, 업종 검색" value={query} onChange={e=>setQuery(e.target.value)}/><kbd>⌘ K</kbd></label><button><SlidersHorizontal/>필터</button><div className="count"><strong>{stocks.length}</strong><span>/ {allStocks.length} 종목</span></div></section>
      <div className="data-state">{dataMode==='market' ? `실제 시장 데이터 · ${marketDate ?? '최근 종가'}` : '샘플 데이터 · 실제 시세 연동 전'}</div>
      <section className="desktop-table"><table><thead><tr>{columns.map(c=><th key={c.key} className={c.sticky?`sticky ${c.sticky}`:''}><button onClick={()=>sortBy(c.key)}>{c.label}<ChevronDown className={sort.key===c.key?(sort.dir===-1?'sorted desc':'sorted'):''}/></button></th>)}</tr></thead><tbody>{stocks.map(s=><tr key={s.ticker} onClick={()=>setSelectedTicker(s.ticker)} className={selected?.ticker===s.ticker?'selected':''}>{columns.map(c=>{const v=getValue(s,c.key);return <td key={c.key} className={`${c.sticky?`sticky ${c.sticky}`:''} ${c.kind==='percent'&&typeof v==='number'?(v>0?'positive':v<0?'negative':''):''}`}>{c.key==='ticker'?<><span className="ticker-logo">{s.ticker[0]}</span><strong>{s.ticker}</strong></>:fmt(v,c.kind)}</td>})}</tr>)}</tbody></table></section>
      <section className="mobile-cards">{stocks.map(s=><button key={s.ticker} onClick={()=>setSelectedTicker(s.ticker)}><div><span className="ticker-logo">{s.ticker[0]}</span><div><strong>{s.ticker}</strong><small>{s.company}</small></div><ChevronRight/></div><div className="mobile-metrics"><span>현재가<strong>{fmt(s.price,'money')}</strong></span><span>전일대비<strong className={(s.changePercent??0)>=0?'positive':'negative'}>{fmt(s.changePercent,'percent')}</strong></span><span>52주 고점 대비<strong className="negative">{fmt(s.drawdown52,'percent')}</strong></span><span>YTD<strong className={(s.ytdReturn??0)>=0?'positive':'negative'}>{fmt(s.ytdReturn,'percent')}</strong></span></div></button>)}</section>
    </main>
    {selected&&<><button aria-label="Quick View 닫기" className="scrim" onClick={()=>setSelectedTicker(null)}/><aside className="quick-view"><button className="quick-close" onClick={()=>setSelectedTicker(null)}><X/></button><p className="eyebrow">QUICK VIEW</p><div className="quick-title"><span className="ticker-logo large">{selected.ticker[0]}</span><div><h2>{selected.ticker}</h2><p>{selected.company} · {selected.sector??'업종 미분류'}</p></div></div><div className="quick-price"><span>현재가</span><strong>{fmt(selected.price,'money')}</strong><em className={(selected.changePercent??0)>=0?'positive':'negative'}>{fmt(selected.changePercent,'percent')}</em></div><div className="spark-placeholder"><span>{selected.priceHistory.length?'최근 90 거래일':'가격 이력 연동 전'}</span><svg viewBox="0 0 320 90">{miniChartPoints(selected)?<polyline points={miniChartPoints(selected)}/>:null}</svg></div><div className="quick-grid"><span>ATH<strong>{fmt(selected.ath,'money')}</strong></span><span>52주 고점 대비<strong className="negative">{fmt(selected.drawdown52,'percent')}</strong></span><span>YTD<strong className={(selected.ytdReturn??0)>=0?'positive':'negative'}>{fmt(selected.ytdReturn,'percent')}</strong></span><span>3개월<strong>{fmt(selected.return3m,'percent')}</strong></span><span>1년<strong>{fmt(selected.return1y,'percent')}</strong></span><span>3년 / 5년<strong>{fmt(selected.return3y,'percent')} / {fmt(selected.return5y,'percent')}</strong></span></div><div className="issue-box"><span>핵심 이슈</span><p>뉴스 데이터 연동 후 최근 핵심 이슈 1~3개가 표시됩니다.</p></div><button className="detail-button" disabled>상세분석 보기 <ChevronRight/></button><small className="quick-note">개별종목 화면은 다음 개발 단계에서 연결됩니다.</small></aside></>}
  </div>
}
export default App
