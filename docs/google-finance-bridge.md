# GoogleFinance → MyStockLog 브리지

## 시트 준비

1. 새 Google Sheets를 만들고 **확장 프로그램 → Apps Script**를 연다.
2. `google-sheets/Code.gs` 내용을 붙여 넣는다.
3. `setupBridge`를 한 번 실행하고, GoogleFinance 값이 채워진 뒤 `consolidateHistory`를 실행한다.
4. Apps Script 트리거에서 `consolidateHistory`를 매일 오전 6:30~6:35 KST에 실행하도록 설정한다.
5. 시트를 링크가 있는 사용자에게 뷰어로 공개한다. 편집 권한은 공개하지 않는다.
6. Google Cloud에서 Google Sheets API를 활성화하고 읽기 전용 API 키를 만든다.

## 서버 환경변수

- `GOOGLE_SHEETS_ID`: 스프레드시트 URL의 `/d/`와 `/edit` 사이 값
- `GOOGLE_SHEETS_API_KEY`: Google Sheets API 키
- `GOOGLE_SHEETS_MASTER_RANGE`: `STOCK_MASTER!A:J`
- `GOOGLE_SHEETS_HISTORY_RANGE`: `PRICE_HISTORY!A:C`

키와 Spreadsheet ID는 앱 화면이나 클라이언트 코드에 넣지 않고 Sites의 보안 환경변수에 저장한다.

## 열 정의

`STOCK_MASTER`: `ticker, exchange, googlefinance_symbol, current_price, change_percent, high_52w, low_52w, status, updated_at, market_date`

`PRICE_HISTORY`: `ticker, date, close`

가격 이력은 최소 3년(약 1,100일 범위)을 내려받는다. 이동평균, 기간 수익률, YTD, 연도별 MDD는 시트가 아니라 앱의 `metricsCalculator`가 계산한다.

## 특수 티커

- `BRK-B`: 앱/FMP는 `BRK-B`, GoogleFinance는 `NYSE:BRK.B`를 사용한다.
- `SPCX`: SpaceX는 비상장사라 GoogleFinance와 FMP의 상장주식 가격 데이터가 없다. 임의 가격을 만들지 않고 `—`로 유지한다.

