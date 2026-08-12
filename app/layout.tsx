import type { Metadata } from 'next'
import '../src/styles.css'

export const metadata: Metadata = {
  title: 'MyStockLog',
  description: '미국주식 비교와 전략 기록을 위한 개인 투자 대시보드',
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ko"><body>{children}</body></html>
}
