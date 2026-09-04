# MyStockLog Vercel + Supabase 전환

## 원칙

- 현재 Codex Sites/Cloudflare 서비스는 새 URL 검증 전까지 유지한다.
- TOSS는 계속 Mac mini에서만 호출한다. Vercel 브라우저·함수는 TOSS 키를 갖지 않는다.
- Supabase Service Role 키는 Mac mini 수집기와 Vercel 서버 함수에만 등록한다. 브라우저에는 절대 넣지 않는다.
- 사용자별 보유관리·전략노트·알림은 Supabase Auth 사용자 ID로 분리한다.

## 1. Supabase 준비

1. SQL Editor에서 `supabase/market-data.sql`, `supabase/strategy-notes.sql`, `supabase/migrations/20260904_vercel_supabase_core.sql` 순서로 실행한다.
2. Authentication에서 사용할 로그인 방식(권장: 이메일 매직링크)을 켠다.
3. 운영 전환 전에 로컬 Mac mini에서 다음을 실행한다.

```bash
node --env-file=.env scripts/sync-d1-to-supabase.mjs
node --env-file=.env scripts/sync-sites-backtests-to-supabase.mjs
```

이 과정은 D1을 삭제하거나 덮어쓰지 않는 단방향 복사다.

Vercel 검증이 끝난 뒤에만 Mac mini의 일일 예약 작업 명령을 아래로
교체한다. 기존 `refresh:daily`는 이전 Sites용이라 새 서비스 전환 후에는
계속 사용하지 않는다.

```bash
npm run refresh:daily:supabase
```

## 2. Vercel 환경변수

Vercel Project Settings → Environment Variables에 아래를 등록한다.

| 이름 | 위치 | 용도 |
| --- | --- | --- |
| `SUPABASE_URL` | 서버 | Vercel API의 Supabase REST 연결 |
| `SUPABASE_SERVICE_ROLE_KEY` | 서버 | 서버 함수와 데이터 동기화 전용 |
| `VITE_SUPABASE_URL` | 브라우저 | Supabase Auth 클라이언트용 |
| `VITE_SUPABASE_ANON_KEY` | 브라우저 | Supabase Auth anon key |
| `GOOGLE_SHEETS_ID` | 서버/수집기 | 시장지표 원본 |
| `GOOGLE_SHEETS_API_KEY` | 서버/수집기 | 시장지표 원본 |

`TOSS_CLIENT_ID`, `TOSS_CLIENT_SECRET`은 Vercel에 등록하지 않는다. Mac mini `.env`에만 둔다.

## 3. Vercel 배포

```bash
npm run build:vercel
npx vercel --prod
```

새 Vercel URL에서 HOME, 개별종목, 보유관리, 전략노트, 백테스트 데이터를 확인한 뒤에만 기존 URL을 교체한다.

## 4. 롤백

Vercel 검증 실패 시 기존 Codex Sites URL은 그대로 남아 있다. D1 데이터도 삭제하지 않으므로 기존 서비스로 즉시 되돌릴 수 있다.
