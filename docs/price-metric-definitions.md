# 가격 지표 정의

## 가격 기준

- 현재가·연초가·52주 High/Low: 공급자가 split-adjusted 상태로 제공한 EOD `close` 및 `high/low`.
- 기간 수익률·연도별 MDD·MA: `adjustedClose ?? close`. 배당조정 값이 있으면 우선 사용한다.
- ATH/ATL: 전체 상장 이력이 확인된 경우의 split-adjusted `close` 최고/최저만 표시한다. 이력 완전성이 확인되지 않으면 `null`이다.
- 모든 가격 이력은 `YYYY-MM-DD`, 오래된 거래일 → 최신 거래일로 정규화하고 중복 날짜는 마지막 값을 사용한다.

## 계산

- 현재가: quote price, 없으면 최신 EOD close.
- 전일대비: Provider 값 또는 `current / previousClose - 1`.
- 52주 High/Low: 최신 시장일에서 365일 전 이후 데이터의 high 최댓값 / low 최솟값.
- 52주 고점 대비: `current / high52 - 1`.
- 연초가: 현재 연도의 첫 거래일 close.
- YTD: `current / yearOpen - 1`.
- 연도별 MDD: 해당 연도 안에서만 running peak를 초기화하고 `price / runningPeak - 1`의 최솟값.
- 기간 수익률: 최신 거래일에서 1M/3M/6M/1Y/3Y/5Y 전의 날짜 또는 그 이전 가장 가까운 거래일 가격 대비 수익률.
- MA20/60/120/200: 최신 N 거래일의 분석 기준 가격 단순평균.

## 데이터 부족

필요 기간이나 거래일 수가 부족하면 `0`을 만들지 않고 `null`을 반환한다. UI는 `null`을 `—`로 표시한다. 한 필드 실패가 종목 전체 행을 제거하지 않는다.
