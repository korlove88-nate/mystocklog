import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'MyStockLog',
    short_name: 'MyStockLog',
    description: '미국주식 비교와 전략 기록을 위한 개인 투자 대시보드',
    start_url: '/',
    display: 'standalone',
    background_color: '#0b1017',
    theme_color: '#0b1017',
    icons: [
      { src: '/icon', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
