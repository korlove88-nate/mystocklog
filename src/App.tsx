'use client'

import { useEffect, useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, FileSpreadsheet, Home, KeyRound, Menu, NotebookPen, RefreshCw, Save, Search, Settings, Trash2, X } from 'lucide-react'
import { referenceSnapshot } from './data/referenceSnapshot'
import { createStockDataProvider, type DataMode } from './services/stockData'
import type { HistoricalPrice, MetricValue, StockSnapshot } from './types'

type Page = 'home' | 'stock' | 'notes' | 'settings'
type DetailTab = 'overview' | 'trend' | 'fundamentals' | 'issues' | 'ai'
type SortKey = keyof StockSnapshot | `mdd${number}`
type Column = { key: SortKey; label: string; kind: 'text'|'money'|'percent'|'cap'|'number'; sticky?: 'ticker'|'company' }
type ApiConfig = { fmpKey: string; sheetsKey: string; sheetId: string; supabaseUrl: string; supabaseAnonKey: string; openAiKey: string }
type StrategyNote = { id: string; ticker: string; content: string; tag: string; createdAt: string; updatedAt: string }

const emptyConfig: ApiConfig = { fmpKey:'', sheetsKey:'', sheetId:'', supabaseUrl:'', supabaseAnonKey:'', openAiKey:'' }
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
const detailTabs: {key:DetailTab;label:string}[] = [{key:'overview',label:'개요'},{key:'trend',label:'가격·추세'},{key:'fundamentals',label:'기업·실적'},{key:'issues',label:'뉴스·이슈'},{key:'ai',label:'AI 분석'}]
const getValue = (stock: StockSnapshot, key: SortKey): MetricValue|string|null => key.startsWith('mdd') ? stock.mdd[Number(key.slice(3))] : stock[key as keyof StockSnapshot] as MetricValue|string|null
const fmt = (value: MetricValue|string|null, kind: Column['kind']) => {
  if (value === null || value === undefined || value === '') return '—'
  if (typeof value === 'string') return value
  if (kind === 'percent') return `${value > 0 ? '+' : ''}${(value * 100).toFixed(2)}%`
  if (kind === 'cap') return value >= 1e12 ? `$${(value/1e12).toFixed(2)}T` : value >= 1e9 ? `$${(value/1e9).toFixed(1)}B` : `$${(value/1e6).toFixed(0)}M`
  if (kind === 'money') return `$${value.toLocaleString('en-US',{maximumFractionDigits:2})}`
  return value.toLocaleString('en-US',{maximumFractionDigits:2})
}
const chartPoints = (history: HistoricalPrice[], width=760, height=260) => {
  const values = history.map(point => point.adjustedClose ?? point.close).filter(Number.isFinite)
  if (values.length < 2) return ''
  const min=Math.min(...values), max=Math.max(...values), range=max-min||1
  return values.map((value,index)=>`${10+index*(width-20)/(values.length-1)},${height-12-(value-min)*(height-28)/range}`).join(' ')
}
const tone = (value: MetricValue) => (value??0)>0?'positive':(value??0)<0?'negative':''
const loadJson = <T,>(key:string, fallback:T):T => { try { return JSON.parse(localStorage.getItem(key) ?? '') as T } catch { return fallback } }

function App() {
  const [page,setPage] = useState<Page>('home'); const [detailTab,setDetailTab]=useState<DetailTab>('overview')
  const [query,setQuery] = useState(''); const [selectedTicker,setSelectedTicker] = useState(referenceSnapshot[0]?.ticker ?? 'AAPL'); const [quickTicker,setQuickTicker]=useState<string|null>(null)
  const [sort,setSort] = useState<{key:SortKey;dir:1|-1}>({key:'marketCap',dir:-1}); const [mobileNav,setMobileNav] = useState(false)
  const [allStocks,setAllStocks] = useState(referenceSnapshot); const [dataMode,setDataMode] = useState<DataMode>('fallback'); const [marketDate,setMarketDate] = useState<string|null>(null); const [loading,setLoading]=useState(true)
  const [config,setConfig]=useState<ApiConfig>(()=>typeof window==='undefined'?emptyConfig:loadJson<ApiConfig>('im-ant-api-config',emptyConfig)); const [draftConfig,setDraftConfig]=useState<ApiConfig>(()=>typeof window==='undefined'?emptyConfig:loadJson<ApiConfig>('im-ant-api-config',emptyConfig)); const [connection,setConnection]=useState<'idle'|'testing'|'ok'|'error'>('idle')
  const [notes,setNotes]=useState<StrategyNote[]>(()=>typeof window==='undefined'?[]:loadJson<StrategyNote[]>('im-ant-notes',[])); const [noteText,setNoteText]=useState(''); const [noteTag,setNoteTag]=useState('전략'); const [noteFilter,setNoteFilter]=useState('전체')

  useEffect(()=>{ let active=true;createStockDataProvider(config.fmpKey).getStocks().then(result=>{if(active){setAllStocks(result.stocks);setDataMode(result.mode);setMarketDate(result.marketDate);setLoading(false)}});return()=>{active=false} },[config])
  useEffect(()=>{ localStorage.setItem('im-ant-notes',JSON.stringify(notes)) },[notes])

  const selected = allStocks.find(stock=>stock.ticker===selectedTicker) ?? allStocks[0]
  const quick = allStocks.find(stock=>stock.ticker===quickTicker) ?? null
  const stocks = useMemo(() => allStocks.filter(s => `${s.ticker} ${s.company} ${s.sector ?? ''}`.toLowerCase().includes(query.toLowerCase())).sort((a,b) => {
    const av=getValue(a,sort.key), bv=getValue(b,sort.key); if(av==null)return 1;if(bv==null)return -1;return (typeof av==='number'&&typeof bv==='number'?av-bv:String(av).localeCompare(String(bv)))*sort.dir
  }),[allStocks,query,sort])
  const sortBy=(key:SortKey)=>setSort(p=>({key,dir:p.key===key?p.dir===1?-1:1:1}))
  const navigate=(next:Page)=>{setPage(next);setMobileNav(false);setQuickTicker(null)}
  const openDetail=(ticker:string)=>{setSelectedTicker(ticker);setDetailTab('overview');navigate('stock')}
  const saveConfig=async()=>{localStorage.setItem('im-ant-api-config',JSON.stringify(draftConfig));setLoading(true);setConfig({...draftConfig});if(draftConfig.fmpKey){setConnection('testing');try{const response=await fetch('/api/market-data?symbol=AAPL',{headers:{'x-fmp-api-key':draftConfig.fmpKey}});setConnection(response.ok?'ok':'error')}catch{setConnection('error')}}else setConnection('idle')}
  const addNote=()=>{if(!noteText.trim())return;const now=new Date().toISOString();setNotes(prev=>[{id:crypto.randomUUID(),ticker:selected.ticker,content:noteText.trim(),tag:noteTag,createdAt:now,updatedAt:now},...prev]);setNoteText('')}
  const visibleNotes=notes.filter(note=>(noteFilter==='전체'||note.ticker===noteFilter||note.tag===noteFilter))

  return <div className="app-shell">
    <aside className={mobileNav?'sidebar open':'sidebar'}><div className="brand"><div className="brand-mark">A</div><div><strong>IM GLOBAL</strong><span>ANT</span></div><button aria-label="메뉴 닫기" className="mobile-close" onClick={()=>setMobileNav(false)}><X/></button></div><nav>
      <button className={page==='home'?'active':''} onClick={()=>navigate('home')}><Home/>홈</button>
      <button className={page==='stock'?'active':''} onClick={()=>navigate('stock')}><FileSpreadsheet/>개별종목</button>
      <button className={page==='notes'?'active':''} onClick={()=>navigate('notes')}><NotebookPen/>전략노트</button>
      <button className={page==='settings'?'active':''} onClick={()=>navigate('settings')}><Settings/>설정</button>
    </nav><div className="sidebar-foot"><span>V1 · 개인 투자 대시보드</span><small>정보 비교용 · 투자 권유 아님</small></div></aside>
    <main><header><button aria-label="메뉴 열기" className="menu-button" onClick={()=>setMobileNav(true)}><Menu/></button><h1>{page==='home'?'관심종목 비교':page==='stock'?'개별종목':page==='notes'?'전략노트':'설정'}</h1><div className={`connection-pill ${dataMode}`}>{loading?'데이터 확인 중':dataMode==='market'?`FMP 연결 · ${marketDate??'최근 종가'}`:'샘플 데이터'}</div></header>
      {page==='home'&&<HomePage stocks={stocks} allCount={allStocks.length} query={query} setQuery={setQuery} sort={sort} sortBy={sortBy} onQuick={setQuickTicker}/>} 
      {page==='stock'&&selected&&<StockPage stock={selected} stocks={allStocks} detailTab={detailTab} setDetailTab={setDetailTab} selectTicker={setSelectedTicker} noteText={noteText} setNoteText={setNoteText} noteTag={noteTag} setNoteTag={setNoteTag} addNote={addNote}/>} 
      {page==='notes'&&<NotesPage notes={visibleNotes} allNotes={notes} filter={noteFilter} setFilter={setNoteFilter} remove={id=>setNotes(prev=>prev.filter(note=>note.id!==id))}/>} 
      {page==='settings'&&<SettingsPage config={draftConfig} setConfig={setDraftConfig} save={saveConfig} connection={connection} stocks={allStocks}/>} 
    </main>
    {quick&&<><button aria-label="Quick View 닫기" className="scrim" onClick={()=>setQuickTicker(null)}/><QuickView stock={quick} close={()=>setQuickTicker(null)} detail={()=>openDetail(quick.ticker)}/></>}
  </div>
}

function HomePage({stocks,allCount,query,setQuery,sort,sortBy,onQuick}:{stocks:StockSnapshot[];allCount:number;query:string;setQuery:(v:string)=>void;sort:{key:SortKey;dir:1|-1};sortBy:(k:SortKey)=>void;onQuick:(t:string)=>void}){
  return <><section className="toolbar"><label><Search/><input aria-label="종목 검색" placeholder="티커, 종목명, 업종 검색" value={query} onChange={e=>setQuery(e.target.value)}/></label><div className="count"><strong>{stocks.length}</strong><span>/ {allCount} 종목</span></div></section>
    <section className="desktop-table"><table><thead><tr>{columns.map(c=><th key={c.key} className={c.sticky?`sticky ${c.sticky}`:''}><button onClick={()=>sortBy(c.key)}>{c.label}<ChevronDown className={sort.key===c.key?(sort.dir===-1?'sorted desc':'sorted'):''}/></button></th>)}</tr></thead><tbody>{stocks.map(s=><tr key={s.ticker} onClick={()=>onQuick(s.ticker)}>{columns.map(c=>{const v=getValue(s,c.key);return <td key={c.key} className={`${c.sticky?`sticky ${c.sticky}`:''} ${c.kind==='percent'&&typeof v==='number'?tone(v):''}`}>{c.key==='ticker'?<><span className="ticker-logo">{s.ticker[0]}</span><strong>{s.ticker}</strong></>:fmt(v,c.kind)}</td>})}</tr>)}</tbody></table></section>
    <section className="mobile-cards">{stocks.map(s=><button key={s.ticker} onClick={()=>onQuick(s.ticker)}><div><span className="ticker-logo">{s.ticker[0]}</span><div><strong>{s.ticker}</strong><small>{s.company}</small></div><ChevronRight/></div><div className="mobile-metrics"><span>현재가<strong>{fmt(s.price,'money')}</strong></span><span>전일대비<strong className={tone(s.changePercent)}>{fmt(s.changePercent,'percent')}</strong></span><span>52주 고점 대비<strong className="negative">{fmt(s.drawdown52,'percent')}</strong></span><span>YTD<strong className={tone(s.ytdReturn)}>{fmt(s.ytdReturn,'percent')}</strong></span></div></button>)}</section></>
}

function StockPage({stock,stocks,detailTab,setDetailTab,selectTicker,noteText,setNoteText,noteTag,setNoteTag,addNote}:{stock:StockSnapshot;stocks:StockSnapshot[];detailTab:DetailTab;setDetailTab:(v:DetailTab)=>void;selectTicker:(v:string)=>void;noteText:string;setNoteText:(v:string)=>void;noteTag:string;setNoteTag:(v:string)=>void;addNote:()=>void}){
  const history=stock.priceHistory.slice(detailTab==='trend'?-1260:-90)
  return <div className="page-wrap"><section className="stock-head"><div><select aria-label="종목 선택" value={stock.ticker} onChange={e=>selectTicker(e.target.value)}>{stocks.map(s=><option key={s.ticker}>{s.ticker}</option>)}</select><h2>{stock.company}</h2><p>{stock.sector??'업종 미분류'}</p></div><div className="headline-price"><strong>{fmt(stock.price,'money')}</strong><span className={tone(stock.changePercent)}>{fmt(stock.changePercent,'percent')}</span></div></section>
    <nav className="subtabs">{detailTabs.map(tab=><button key={tab.key} className={detailTab===tab.key?'active':''} onClick={()=>setDetailTab(tab.key)}>{tab.label}</button>)}</nav>
    <div className="detail-layout"><section className="detail-content">
      {detailTab==='overview'&&<MetricGrid stock={stock}/>} 
      {detailTab==='trend'&&<><div className="chart-card"><div><h3>조정 종가 추세</h3><span>최근 최대 5년</span></div>{history.length>1?<svg viewBox="0 0 760 260" preserveAspectRatio="none"><polyline points={chartPoints(history)}/></svg>:<Empty title="가격 이력이 없습니다"/>}</div><div className="returns-row">{[['1M',stock.return1m],['3M',stock.return3m],['6M',stock.return6m],['YTD',stock.ytdReturn],['1Y',stock.return1y],['3Y',stock.return3y],['5Y',stock.return5y]].map(([l,v])=><span key={String(l)}>{l}<strong className={tone(v as MetricValue)}>{fmt(v as MetricValue,'percent')}</strong></span>)}</div></>}
      {detailTab==='fundamentals'&&<div className="info-panel"><h3>기업·실적</h3><div className="fundamental-list"><span>시가총액<strong>{fmt(stock.marketCap,'cap')}</strong></span><span>PER<strong>{fmt(stock.pe,'number')}</strong></span><span>EPS<strong>{fmt(stock.eps,'money')}</strong></span><span>매출 / 순이익<strong>재무 데이터 소스 연결 예정</strong></span></div><p>FMP 연결 시 기본 밸류에이션이 표시됩니다. 분기 실적과 전년동기 변화는 다음 데이터 확장에서 연결합니다.</p></div>}
      {detailTab==='issues'&&<Empty title="핵심 이슈 데이터 준비 중" text="모든 뉴스를 나열하지 않고, 종목 판단에 의미 있는 이슈만 이곳에 정리합니다."/>}
      {detailTab==='ai'&&<Empty title="AI 분석 연결 준비 완료" text="OpenAI 키와 분석 프롬프트가 연결되면 현재 상태, 변화, 긍정 요인, 위험 요인을 매수·매도 추천 없이 정리합니다."/>}
    </section><aside className="note-composer"><h3>전략노트</h3><p>{stock.ticker}를 보며 떠오른 판단을 바로 기록하세요.</p><textarea aria-label="전략노트 내용" value={noteText} onChange={e=>setNoteText(e.target.value)} placeholder="다음 실적에서 확인할 내용을 기록하세요"/><div><select aria-label="전략노트 태그" value={noteTag} onChange={e=>setNoteTag(e.target.value)}>{['가격','실적','이슈','리스크','전략'].map(t=><option key={t}>{t}</option>)}</select><button onClick={addNote}><Save/>저장</button></div></aside></div></div>
}

function MetricGrid({stock}:{stock:StockSnapshot}){const items:[string,MetricValue,Column['kind']][]=[['현재가',stock.price,'money'],['전일대비',stock.changePercent,'percent'],['시가총액',stock.marketCap,'cap'],['PER',stock.pe,'number'],['EPS',stock.eps,'money'],['ATH',stock.ath,'money'],['52주 고점 대비',stock.drawdown52,'percent'],['52주 저점',stock.low52,'money'],['ATL',stock.atl,'money'],['연초가',stock.yearOpen,'money'],['YTD',stock.ytdReturn,'percent'],['3개월',stock.return3m,'percent'],['1년',stock.return1y,'percent'],['3년',stock.return3y,'percent'],['5년',stock.return5y,'percent']];return <div className="metric-grid">{items.map(([label,value,kind])=><span key={label}>{label}<strong className={kind==='percent'?tone(value):''}>{fmt(value,kind)}</strong></span>)}</div>}

function NotesPage({notes,allNotes,filter,setFilter,remove}:{notes:StrategyNote[];allNotes:StrategyNote[];filter:string;setFilter:(v:string)=>void;remove:(id:string)=>void}){const filters=['전체',...Array.from(new Set(allNotes.flatMap(n=>[n.ticker,n.tag])))];return <div className="page-wrap"><div className="section-head"><div><h2>모든 판단 메모</h2><p>개별종목에서 작성한 메모가 한곳에 모입니다.</p></div><select aria-label="전략노트 필터" value={filter} onChange={e=>setFilter(e.target.value)}>{filters.map(f=><option key={f}>{f}</option>)}</select></div>{notes.length?<section className="notes-board">{notes.map(note=><article key={note.id}><div><strong>{note.ticker}</strong><time>{new Date(note.createdAt).toLocaleDateString('ko-KR',{month:'2-digit',day:'2-digit'})}</time><button aria-label="메모 삭제" onClick={()=>remove(note.id)}><Trash2/></button></div><p>{note.content}</p><span>#{note.tag}</span></article>)}</section>:<Empty title="아직 기록된 전략노트가 없습니다" text="개별종목 화면에서 10초 안에 첫 메모를 남겨보세요."/>}</div>}

function SettingsPage({config,setConfig,save,connection,stocks}:{config:ApiConfig;setConfig:(v:ApiConfig)=>void;save:()=>void;connection:'idle'|'testing'|'ok'|'error';stocks:StockSnapshot[]}){const field=(key:keyof ApiConfig,label:string,placeholder:string,secret=false)=><label><span>{label}</span><input type={secret?'password':'text'} value={config[key]} placeholder={placeholder} autoComplete="off" onChange={e=>setConfig({...config,[key]:e.target.value})}/></label>;return <div className="page-wrap settings-page"><section className="settings-intro"><KeyRound/><div><h2>데이터 연결</h2><p>입력값은 이 기기에만 저장되며 Git이나 공개 화면에 포함되지 않습니다.</p></div></section><section className="settings-card"><div className="settings-title"><div><h3>Financial Modeling Prep</h3><p>HOME 시세, 가격 이력, 기본 기업정보</p></div><span className={`status ${connection}`}>{connection==='testing'?'확인 중':connection==='ok'?'연결됨':connection==='error'?'연결 실패':config.fmpKey?'저장 전':'미설정'}</span></div>{field('fmpKey','FMP API Key','FMP에서 발급받은 키',true)}</section><section className="settings-card"><div className="settings-title"><div><h3>Google Sheets</h3><p>향후 관심종목 목록 동기화</p></div><span className="status planned">연결 준비</span></div><div className="form-grid">{field('sheetId','Spreadsheet ID','문서 URL의 ID')}{field('sheetsKey','Google API Key','Google Cloud API 키',true)}</div></section><section className="settings-card"><div className="settings-title"><div><h3>Supabase</h3><p>향후 종목과 전략노트 동기화</p></div><span className="status planned">연결 준비</span></div><div className="form-grid">{field('supabaseUrl','Project URL','https://….supabase.co')}{field('supabaseAnonKey','Anon Key','Supabase anon key',true)}</div></section><section className="settings-card"><div className="settings-title"><div><h3>OpenAI</h3><p>향후 정보 요약과 변화 분석</p></div><span className="status planned">연결 준비</span></div>{field('openAiKey','OpenAI API Key','sk-…',true)}<p className="security-note">AI 호출은 서버 프록시가 완성되기 전까지 실행하지 않습니다. 브라우저에서 OpenAI로 키를 직접 보내지 않습니다.</p></section><section className="watchlist-card"><div><h3>현재 관심종목</h3><p>{stocks.length}개 종목</p></div><div>{stocks.map(stock=><span key={stock.ticker}>{stock.ticker}</span>)}</div></section><button className="save-settings" onClick={save}><RefreshCw/>저장하고 데이터 다시 연결</button></div>}

function Empty({title,text}:{title:string;text?:string}){return <div className="empty-state"><div>ANT</div><h3>{title}</h3>{text&&<p>{text}</p>}</div>}
function QuickView({stock,close,detail}:{stock:StockSnapshot;close:()=>void;detail:()=>void}){return <aside className="quick-view"><button aria-label="닫기" className="quick-close" onClick={close}><X/></button><p className="eyebrow">QUICK VIEW</p><div className="quick-title"><span className="ticker-logo large">{stock.ticker[0]}</span><div><h2>{stock.ticker}</h2><p>{stock.company} · {stock.sector??'업종 미분류'}</p></div></div><div className="quick-price"><span>현재가</span><strong>{fmt(stock.price,'money')}</strong><em className={tone(stock.changePercent)}>{fmt(stock.changePercent,'percent')}</em></div><div className="spark-placeholder"><svg viewBox="0 0 320 90"><polyline points={chartPoints(stock.priceHistory.slice(-90),320,90)}/></svg></div><div className="quick-grid"><span>ATH<strong>{fmt(stock.ath,'money')}</strong></span><span>52주 고점 대비<strong className="negative">{fmt(stock.drawdown52,'percent')}</strong></span><span>YTD<strong className={tone(stock.ytdReturn)}>{fmt(stock.ytdReturn,'percent')}</strong></span><span>3개월<strong>{fmt(stock.return3m,'percent')}</strong></span><span>1년<strong>{fmt(stock.return1y,'percent')}</strong></span><span>3년 / 5년<strong>{fmt(stock.return3y,'percent')} / {fmt(stock.return5y,'percent')}</strong></span></div><button className="detail-button" onClick={detail}>상세분석 보기 <ChevronRight/></button></aside>}

export default App
