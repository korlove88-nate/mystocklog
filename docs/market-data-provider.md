# Market Data Provider 선정

검토일: 2026-08-12. 아래 조건은 공급자 공식 문서 기준이며 변경될 수 있다.

## 결론

가격과 가격이력의 기본 Provider는 **GoogleFinance → Google Sheets**다. React UI는 `MarketDataProvider` 인터페이스만 사용하며 외부 호출은 `api/market-data.ts` 서버 함수에 격리한다. 기업정보는 FMP, 영속 스냅샷은 D1, 최종 fallback은 ReferenceSnapshot을 사용한다.

필드별 우선순위는 가격/이력 `GoogleFinance → FMP → 저장값 → Reference`, 기업정보 `FMP → 저장값 → Reference`다. 일반 페이지 로드는 외부 Provider를 호출하지 않고 D1 저장값만 읽는다. 수동 또는 예약 갱신은 10종목을 한 요청으로 처리하여 Google Sheets의 두 범위를 각각 한 번만 읽는다. FMP 기업정보는 최대 7일 캐시하고 GoogleFinance가 누락된 필드만 보완한다.

## 후보 비교

| Provider | 무료 범위 | 장기 일봉/조정 | Fundamentals | V1 판단 |
|---|---|---|---|---|
| FMP | Basic 무료, 250 calls/day, EOD, 5년 이력 | split-adjusted full EOD와 unadjusted/dividend-adjusted 별도 endpoint | profile, quote, market cap, ratios | 기본 선택. 20종목 × 3요청=60회/일로 무료 한도 내 |
| Massive | 무료, 5 calls/min, EOD, 2년 이력 | split-adjusted 기본, 배당 미조정 | 무료 플랜에 reference/financials 표기 | 3Y·5Y 계산 불가로 V1 기본 부적합 |
| Finnhub | 무료 60 calls/min | 무료 플랜의 Stock OHLC 미포함, 유료 Basic은 10년 | 무료 profile, 주요 fundamentals는 제한 | 가격 이력 때문에 유료 전제 |
| Alpha Vantage | 무료 25 calls/day | raw daily 20년+, daily adjusted는 premium | OVERVIEW/earnings 제공 | 20종목 일괄 갱신에 무료 호출량 부족 |

공식 출처:

- FMP 가격/제한: https://site.financialmodelingprep.com/developer/docs/pricing/
- FMP stable API/endpoint: https://site.financialmodelingprep.com/developer/docs/stable
- Massive 가격: https://massive.com/pricing?product=stocks
- Massive 조정 정책: https://massive.com/knowledge-base/article/is-massives-stock-data-adjusted-for-splits-or-dividends
- Finnhub 가격: https://finnhub.io/pricing
- Alpha Vantage 문서/제한: https://www.alphavantage.co/documentation/ , https://www.alphavantage.co/support/

## 호출·캐시 구조

브라우저는 `/api/market-data?symbol=AAPL`만 호출한다. 서버 함수가 FMP quote/profile/full EOD를 병렬 호출하고 하나의 정규화 응답을 반환한다. 브라우저 Provider는 ticker별 Promise 캐시로 중복 요청을 막고, HOME 로더는 동시 요청을 3개로 제한한다. 서버 응답은 6시간 CDN 캐시와 24시간 stale-while-revalidate를 선언한다.

API Key는 `FMP_API_KEY` 서버 환경변수로만 읽는다. `VITE_` 접두사를 사용하지 않으므로 브라우저 번들에 포함되지 않는다.

## 교체 방법

다른 공급자로 교체할 때 `MarketDataProvider`의 `getQuote`, `getHistoricalPrices`, `getFundamentals`, `isHistoryComplete`만 구현하고 `CombinedStockDataProvider` 생성자에 주입한다. UI와 계산 엔진은 변경하지 않는다.
