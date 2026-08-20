# IM GLOBAL ANT 데이터 소스

가격·전일 종가·일봉 OHLCV·거래량의 유일한 공급원은 토스증권이다. 토스 조회가 실패하면 D1/Supabase의 마지막 토스 저장값을 유지하고 GoogleFinance 가격으로 대체하지 않는다.

GoogleFinance Bridge V2.1은 `STOCK_MASTER`의 EPS/PER/시가총액과 `MARKET_OVERVIEW`의 S&P500/NASDAQ/DOW/VIX/US10Y만 공급한다. GoogleFinance 가격, 52주 고저, 가격이력은 앱에서 읽지 않는다.

52주 고저, 기간 수익률, 최근 3개년 MDD, 이동평균, MDD 근접도와 가격 안정성은 토스 일봉 최대 1,000개를 사용해 앱에서 계산한다. 1,000개는 전체 상장 이력이 아니다.

D1과 Supabase는 공급원이 아닌 저장·캐시 계층이다. `(ticker, market_date)`와 `(ticker, snapshot_date)` 기본키로 같은 날짜 중복을 방지하고 과거 날짜를 최신값으로 덮어쓰지 않는다.

수동 갱신은 로컬 허용 IP에서 토스를 호출한다. 운영 UTC 21:40(KST 06:40) 예약 갱신은 현재 GoogleFinance와 저장 데이터만 처리하며 토스를 직접 호출하지 않는다.
