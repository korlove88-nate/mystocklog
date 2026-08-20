# GoogleFinance Bridge V2.1

Spreadsheet ID는 런타임의 `GOOGLE_SHEETS_ID`로 관리한다. 앱은 다음 범위만 읽는다.

- `STOCKS`, `GROUPS`, `GROUP_MEMBERSHIP`: 활성 종목과 HOME 그룹
- `STOCK_MASTER`: EPS, PER, 시가총액
- `MARKET_OVERVIEW`: S&P500, NASDAQ, DOW, VIX, US10Y

GoogleFinance의 현재가, 등락률, 52주 고저와 `H_*` 가격이력은 앱 데이터로 읽지 않는다. 가격 관련 수치는 토스 일봉과 앱 계산만 사용한다.

`BRK-B`의 앱 티커는 `BRK-B`, GoogleFinance 재무 조회 기호는 `NYSE:BRK.B`다. `SPCX`는 비상장사이므로 임의 가격을 만들지 않는다.
