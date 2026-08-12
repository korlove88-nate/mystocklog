import type { Metadata } from 'next'
import '../src/styles.css'

export const metadata: Metadata = {
  title: 'IM GLOBAL ANT',
  description: '미국주식 개인 투자 대시보드',
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ko"><body>{children}</body></html>
}
