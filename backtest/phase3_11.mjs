import { DatabaseSync } from 'node:sqlite';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const state = '.wrangler/state/v3/d1/miniflare-D1DatabaseObject';
const sqlite = existsSync(state) ? readdirSync(state).find(x => x.endsWith('.sqlite') && x !== 'metadata.sqlite') : null;
if (!sqlite) throw new Error('로컬 TOSS D1 데이터가 없습니다.');
const db = new DatabaseSync(join(state, sqlite), { readOnly: true });
const raw = db.prepare("SELECT ticker, market_date date, high, low, close FROM daily_prices WHERE source='TOSS' ORDER BY ticker, market_date").all();
db.close();

const history = Object.groupBy(raw, x => x.ticker);
const records = new Map(JSON.parse(readFileSync('backtest/results/phase1_5-full.json', 'utf8')).records.map(x => [`${x.ticker}|${x.date}`, x]));
const prior = JSON.parse(readFileSync('backtest/results/phase3_10-full.json', 'utf8'));
const tickers = ['AAPL', 'AMZN', 'AVGO', 'GOOG', 'META', 'MSFT', 'NVDA', 'TSLA'].filter(t => history[t]?.length > 504);
const valid = x => typeof x === 'number' && Number.isFinite(x);
const avg = xs => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
const med = xs => { const a = [...xs].sort((a, b) => a - b); return !a.length ? null : a.length % 2 ? a[(a.length - 1) / 2] : (a[a.length / 2 - 1] + a[a.length / 2]) / 2; };
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const ma = (p, n) => p.length < n ? null : avg(p.slice(-n).map(x => x.close));
const atr = p => { const q = p.slice(-15); return q.length < 15 ? null : avg(q.slice(1).map((x, i) => Math.max(x.high - x.low, Math.abs(x.high - q[i].close), Math.abs(x.low - q[i].close)))); };
const annualMdd = (p, y) => { let peak = -Infinity, draw = 0; for (const x of p) if (x.date.startsWith(String(y))) { peak = Math.max(peak, x.close); draw = Math.min(draw, x.close / peak - 1); } return peak === -Infinity ? null : draw; };
const score = r => Math.round(((r.mdd ?? 0) + (r.relative ?? 0) + (r.stability ?? 0)) / 65 * 100);
const bucket = w => w < .02 ? '0~2%' : w < .03 ? '2~3%' : w < .04 ? '3~4%' : w < .05 ? '4~5%' : w < .06 ? '5~6%' : w < .08 ? '6~8%' : '8% 이상';

function zone(p, type) {
  const last = p.at(-1); if (!last || p.length < 252) return null;
  const current = last.close, recent = p.slice(-60), year = p.slice(-252);
  const years = [...new Set(p.map(x => Number(x.date.slice(0, 4))))].slice(-5);
  const refMdd = med(years.map(y => annualMdd(p, y)).filter(valid).map(Math.abs));
  const mas = [['ma60', ma(p, 60)], ['ma120', ma(p, 120)], ['ma200', ma(p, 200)]];
  const tolerance = clamp((atr(p) ?? current * .03) / current * 1.25, .015, .08);
  const rawCandidates = type === 'buy'
    ? [['swing60', Math.min(...recent.map(x => x.low))], ['low52', Math.min(...year.map(x => x.low))], ['mdd', refMdd === null ? null : Math.max(...year.map(x => x.high)) * (1 - refMdd)], ...mas]
    : [['swing60', Math.max(...recent.map(x => x.high))], ['high52', Math.max(...year.map(x => x.high))], ['ath', Math.max(...p.map(x => x.close))], ...mas.map(([n, v]) => [n, valid(v) && v > current ? v : null])];
  const items = rawCandidates.filter(([, v]) => valid(v)).filter(([n, v]) => !(type === 'buy' && n.startsWith('ma') && v > current)).map(([name, price]) => ({ name, price }));
  if (!items.length) return null;
  let candidates = [];
  for (const candidate of items) { const group = items.filter(x => Math.abs(x.price - candidate.price) / current <= tolerance); if (group.length > candidates.length) candidates = group; }
  if (candidates.length < 2) { const eligible = items.filter(x => type === 'buy' ? x.price <= current * 1.15 : x.price >= current * .85); candidates = [[...(eligible.length ? eligible : items)].sort((a, b) => Math.abs(a.price - current) - Math.abs(b.price - current))[0]]; }
  const make = xs => { const values = xs.map(x => x.price), midpoint = med(values); return { low: Math.min(...values), high: Math.max(...values), mid: midpoint, width: (Math.max(...values) - Math.min(...values)) / midpoint }; };
  const base = make(candidates);
  const outlier = candidates.length >= 3 ? [...candidates].sort((a, b) => Math.abs(b.price - base.mid) - Math.abs(a.price - base.mid))[0] : null;
  const canTrim = base.width >= .05 && candidates.length >= 3 && Boolean(outlier);
  const trim = canTrim ? make(candidates.filter(x => x !== outlier)) : base;
  return { base, trim, candidates, outlier, canTrim };
}

const rows = [];
for (const ticker of tickers) for (let i = 252; i < history[ticker].length - 252; i += 1) { const p = history[ticker].slice(0, i + 1), buy = zone(p, 'buy'), sell = zone(p, 'sell'); if (buy && sell) rows.push({ ticker, date: p.at(-1).date, buy, sell }); }
function distribution(mode) { const zones = rows.map(x => x.buy[mode]), labels = ['0~2%', '2~3%', '3~4%', '4~5%', '5~6%', '6~8%', '8% 이상']; return { count: zones.length, meanWidth: avg(zones.map(x => x.width)), medianWidth: med(zones.map(x => x.width)), bins: labels.map(label => ({ label, count: zones.filter(x => bucket(x.width) === label).length, ratio: zones.filter(x => bucket(x.width) === label).length / zones.length })), over5: zones.filter(x => x.width >= .05).length / zones.length, over6: zones.filter(x => x.width >= .06).length / zones.length, over8: zones.filter(x => x.width >= .08).length / zones.length }; }
function overlaps(mode) { const values = rows.map(x => { const b = x.buy[mode], s = x.sell[mode], width = Math.max(0, Math.min(b.high, s.high) - Math.max(b.low, s.low)) / b.mid; return { ...x, width, overlap: width > 0 }; }), yes = values.filter(x => x.overlap); return { rows: values, count: yes.length, rate: yes.length / values.length, meanWidth: avg(yes.map(x => x.width)), medianWidth: med(yes.map(x => x.width)), over1: yes.filter(x => x.width >= .01).length / values.length, over3: yes.filter(x => x.width >= .03).length / values.length, over5: yes.filter(x => x.width >= .05).length / values.length, separated: 1 - yes.length / values.length }; }
const baseOverlap = overlaps('base'), trimOverlap = overlaps('trim');
const transition = { removed: 0, reduced: 0, same: 0, increased: 0 };
for (let i = 0; i < rows.length; i += 1) { const a = baseOverlap.rows[i].width, b = trimOverlap.rows[i].width; if (a > 0 && b === 0) transition.removed += 1; else if (b < a) transition.reduced += 1; else if (b > a) transition.increased += 1; else transition.same += 1; }

function simulate(mode) {
  const trades = [];
  for (const ticker of tickers) {
    const p = history[ticker], start = Math.max(252, p.findIndex(x => records.has(`${ticker}|${x.date}`))), end = p.length - 253; let position = null;
    for (let i = start; i <= end; i += 1) {
      const day = p[i], record = records.get(`${ticker}|${day.date}`), buy = zone(p.slice(0, i + 1), 'buy'), sell = zone(p.slice(0, i + 1), 'sell');
      if (!position && record && score(record) >= 70 && buy && sell) { const b = buy[mode], s = sell[mode]; if (s.mid > b.mid && day.low <= b.high && day.high >= b.low) position = { ticker, entryDate: day.date, entryIndex: i, entry: b.mid, target: s.mid, low: day.low, high: day.high }; }
      else if (position) { position.low = Math.min(position.low, day.low); position.high = Math.max(position.high, day.high); if (day.high >= position.target) { trades.push({ ...position, closed: true, exitDate: day.date, days: i - position.entryIndex, net: position.target / position.entry * .999 - 1, mae: Math.min(0, position.low / position.entry - 1), mfe: position.high / position.entry - 1 }); position = null; } }
    }
    if (position) { const last = p[end]; trades.push({ ...position, closed: false, exitDate: last.date, days: end - position.entryIndex, net: last.close / position.entry * .9995 - 1, mae: Math.min(0, position.low / position.entry - 1), mfe: position.high / position.entry - 1 }); }
  }
  const summarize = list => { const done = list.filter(x => x.closed), wins = done.filter(x => x.net > 0); return { entries: list.length, closed: done.length, completionRate: list.length ? done.length / list.length : null, arrivalRate: list.length ? done.length / list.length : null, winRate: done.length ? wins.length / done.length : null, meanReturn: avg(done.map(x => x.net)), medianReturn: med(done.map(x => x.net)), meanMae: avg(done.map(x => x.mae)), medianMae: med(done.map(x => x.mae)), meanMfe: avg(done.map(x => x.mfe)), medianMfe: med(done.map(x => x.mfe)), meanDays: avg(done.map(x => x.days)), medianDays: med(done.map(x => x.days)) }; };
  return { overall: summarize(trades), perTicker: tickers.map(ticker => ({ ticker, ...summarize(trades.filter(x => x.ticker === ticker)) })), trades };
}
const baseSim = simulate('base'), trimSim = simulate('trim');
const midpointChanges = rows.filter(x => x.buy.canTrim).map(x => Math.abs(x.buy.trim.mid - x.buy.base.mid) / x.buy.base.mid).sort((a, b) => a - b);
const lostDates = prior.originalOnly ?? [];
function episodes(signals) { const sorted = [...signals].sort((a, b) => a.ticker.localeCompare(b.ticker) || a.date.localeCompare(b.date)), output = []; for (const signal of sorted) { const last = output.at(-1), gap = last ? (new Date(`${signal.date}T00:00:00Z`) - new Date(`${last.end}T00:00:00Z`)) / 86400000 : Infinity, mid = (signal.originalLow + signal.originalHigh) / 2, sameZone = last && Math.abs(mid - last.mid) / last.mid <= .03; if (last && last.ticker === signal.ticker && last.outlier === signal.outlierName && gap <= 5 && sameZone) { last.end = signal.date; last.members.push(signal); } else output.push({ ticker: signal.ticker, outlier: signal.outlierName, start: signal.date, end: signal.date, mid, members: [signal] }); } return output.map(e => { const first = e.members[0], done = e.members.filter(x => x.fixedClosed); return { ticker: e.ticker, outlier: e.outlier, start: e.start, end: e.end, signalDays: e.members.length, baseZone: `${first.originalLow}~${first.originalHigh}`, trimZone: `${first.trimmedLow}~${first.trimmedHigh}`, firstEntry: first.firstEntryDate, fixedClosed: done.length > 0, fixedReturn: med(done.map(x => x.fixedReturn)), mae: avg(e.members.map(x => x.mae)), mfe: avg(e.members.map(x => x.maxRise)) }; }); }
const lostEpisodes = episodes(lostDates);
const outlierNames = ['ma60', 'ma120', 'ma200', 'mdd', 'swing60', '기타'];
const outlierImpact = outlierNames.map(label => { const match = x => label === '기타' ? !['ma60', 'ma120', 'ma200', 'mdd', 'swing60'].includes(x.outlierName) : x.outlierName === label, signals = lostDates.filter(match), eps = lostEpisodes.filter(x => label === '기타' ? !['ma60', 'ma120', 'ma200', 'mdd', 'swing60'].includes(x.outlier) : x.outlier === label), changed = rows.filter(x => x.buy.canTrim && (label === '기타' ? !['ma60', 'ma120', 'ma200', 'mdd', 'swing60'].includes(x.buy.outlier.name) : x.buy.outlier.name === label)); return { label, trimCount: changed.length, meanWidthReduction: avg(changed.map(x => x.buy.base.width - x.buy.trim.width)), lostDates: signals.length, lostEpisodes: eps.length, fixedCompletion: eps.length ? eps.filter(x => x.fixedClosed).length / eps.length : null, meanMae: avg(eps.map(x => x.mae)), meanMfe: avg(eps.map(x => x.mfe)) }; });
const tickerComparison = tickers.map(ticker => { const own = rows.filter(x => x.ticker === ticker), b = baseOverlap.rows.filter(x => x.ticker === ticker), t = trimOverlap.rows.filter(x => x.ticker === ticker), base = baseSim.perTicker.find(x => x.ticker === ticker), trim = trimSim.perTicker.find(x => x.ticker === ticker); return { ticker, baseMeanWidth: avg(own.map(x => x.buy.base.width)), trimMeanWidth: avg(own.map(x => x.buy.trim.width)), baseOver5: b.filter(x => x.buy.base.width >= .05).length / b.length, trimOver5: t.filter(x => x.buy.trim.width >= .05).length / t.length, baseOverlap: b.filter(x => x.overlap).length / b.length, trimOverlap: t.filter(x => x.overlap).length / t.length, baseEntries: base.entries, trimEntries: trim.entries, lostEpisodes: lostEpisodes.filter(x => x.ticker === ticker).length, baseCompletion: base.completionRate, trimCompletion: trim.completionRate, baseMedianReturn: base.medianReturn, trimMedianReturn: trim.medianReturn, baseMeanMae: base.meanMae, trimMeanMae: trim.meanMae, baseMeanMfe: base.meanMfe, trimMeanMfe: trim.meanMfe }; });
const summary = { distribution: { base: distribution('base'), trim: distribution('trim') }, midpoint: { count: midpointChanges.length, mean: avg(midpointChanges), median: med(midpointChanges), p75: midpointChanges[Math.ceil(midpointChanges.length * .75) - 1] ?? null, p90: midpointChanges[Math.ceil(midpointChanges.length * .9) - 1] ?? null, max: Math.max(...midpointChanges), within1: midpointChanges.filter(x => x <= .01).length / midpointChanges.length, within2: midpointChanges.filter(x => x <= .02).length / midpointChanges.length, within3: midpointChanges.filter(x => x <= .03).length / midpointChanges.length }, overlap: { base: { ...baseOverlap, rows: undefined }, trim: { ...trimOverlap, rows: undefined }, transition }, performance: { base: baseSim.overall, trim: trimSim.overall }, lostEntries: { dateCount: lostDates.length, episodeCount: lostEpisodes.length, byTicker: tickers.map(ticker => ({ ticker, episodes: lostEpisodes.filter(x => x.ticker === ticker).length })), byOutlier: outlierImpact }, maeAudit: { basis: 'entry midpoint', entryDayLowIncluded: true, calculation: '진입일 저가부터 종료일까지의 최저 저가를 entry midpoint와 비교', reasonForZero: '3.10 originalOnly 사례는 zone 외곽 접촉 뒤 entry midpoint 아래로 내려간 저가가 없었던 사례로 집계됨' }, perTicker: tickerComparison };
const date = new Date().toISOString().slice(0, 10), runId = `phase3-11-${date}`;
const sectionData = [['distribution', '전체 가격대 분포 비교', [{ label: 'BASE', ...summary.distribution.base }, { label: 'TRIM', ...summary.distribution.trim }]], ['midpoint', 'midpoint 영향', [summary.midpoint]], ['overlap', '매수/차익 중첩', [{ label: 'BASE', ...summary.overlap.base }, { label: 'TRIM', ...summary.overlap.trim }, { label: '전환', ...transition }]], ['performance', 'Fixed 성과 BASE vs TRIM', [{ label: 'BASE', ...baseSim.overall }, { label: 'TRIM', ...trimSim.overall }]], ['loss', '진입 손실 episode', lostEpisodes], ['mae', 'MAE 계산 검증', [summary.maeAudit]], ['ticker', '종목별 부작용 검증', tickerComparison], ['outlier', 'outlier 종류별 영향', outlierImpact], ['conclusion', '최종 판단', [{ label: '운영 반영', value: '없음 · 진단 결과만 저장' }]]];
const sections = sectionData.map(([id, title, rows], index) => ({ id, parentId: null, sectionType: 'report', title, summary: 'BASE/TRIM 독립 재계산 · 운영 알고리즘 변경 없음', reportData: { rows }, sortOrder: index + 1 }));
const run = { id: runId, runDate: date, phase: '3.11차 · 가격대 축소 후 전체 중첩·성과·종목별 안정성 검증', title: '외딴 후보 제거 후 전체 가격대·중첩·성과 검증', algorithmVersion: 'BT-v3.11', periodStart: '2022-01-25', periodEnd: '2025-08-21', universe: 'TOSS 8종목 동일 스냅샷', config: { maDirection: true, atrMultiplier: 1.25, minTolerance: .015, atrCap: .08, zone: 'min~max', trim: '폭>=5% · 후보>=3 · outlier 1개 제거', scoreThreshold: 70, weights: '30/20/15', fixedTarget: 'entry-day sell midpoint', diagnosticOnly: true }, summary, conclusion: 'TRIM은 진단 전용 비교군이며 운영 알고리즘은 변경하지 않습니다.', createdAt: new Date().toISOString(), sections };
mkdirSync('backtest/results', { recursive: true });
writeFileSync('backtest/results/phase3_11-summary.json', JSON.stringify(run, null, 2));
writeFileSync('backtest/results/phase3_11-full.json', JSON.stringify({ rows, baseTrades: baseSim.trades, trimTrades: trimSim.trades, lostEpisodes, summary }, null, 2));
let storage = 'local-only';
if (!process.env.BACKTEST_LOCAL_ONLY && process.env.MARKET_SYNC_URL && process.env.MARKET_SYNC_TOKEN) { const url = process.env.MARKET_SYNC_URL.replace(/\/api\/market-data.*$/, '/api/backtests'); const response = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${process.env.MARKET_SYNC_TOKEN}`, 'Content-Type': 'application/json', ...(process.env.SITES_BYPASS_TOKEN ? { 'OAI-Sites-Authorization': `Bearer ${process.env.SITES_BYPASS_TOKEN}` } : {}) }, body: JSON.stringify({ ...run, sections: sections.map(s => ({ ...s, id: `${runId}-${s.id}` })) }) }); if (!response.ok) throw new Error(`D1 ${response.status}: ${await response.text()}`); storage = 'D1 saved'; }
console.log(JSON.stringify({ storage, summary }, null, 2));
