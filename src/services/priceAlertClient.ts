import type {StrategyNotesService} from './strategyNotes'

export type AlertSetting={ticker:string;company:string|null;is_holding:number;buy_enabled:number;sell_enabled:number;approach_enabled:number;approach_percent:number;buy_state:string;sell_state:string;last_market_date:string|null;last_checked_at:string|null;last_alert_at:string|null;paused:number}
export type AlertEvent={id:string;ticker:string;alert_type:'buy'|'sell';event_reason:string;market_date:string;close_price:number;zone_low:number;zone_high:number;title:string;body:string;read_at:string|null;push_status:string;created_at:string}
export type AlertDashboard={settings:AlertSetting[];events:AlertEvent[];pushSubscribed:boolean;lastRun:{market_date?:string;completed_at?:string;status?:string;checked_count?:number;event_count?:number}|null;nextCheck:string}

const authFetch=async(service:StrategyNotesService,path:string,init:RequestInit={})=>{const token=await service.accessToken();if(!token)throw new Error('로그인이 필요합니다.');const result=await fetch(path,{...init,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json','X-Supabase-URL':service.url,'X-Supabase-Anon-Key':service.anonKey,...init.headers}});const body=await result.json();if(!result.ok)throw new Error((body as {error?:string}).error??`요청 실패 ${result.status}`);return body}
export const loadAlerts=(service:StrategyNotesService)=>authFetch(service,'/api/alerts') as Promise<AlertDashboard>
export const alertAction=(service:StrategyNotesService,body:Record<string,unknown>)=>authFetch(service,'/api/alerts',{method:'POST',body:JSON.stringify(body)}) as Promise<AlertDashboard>

const decode=(value:string)=>{const padding='='.repeat((4-value.length%4)%4),base64=(value+padding).replace(/-/g,'+').replace(/_/g,'/'),raw=atob(base64);return Uint8Array.from([...raw].map(char=>char.charCodeAt(0)))}
export type PushSubscribeStage='service-worker-registering'|'service-worker-ready'|'vapid-ready'|'subscription-existing'|'subscription-created'|'d1-saved'
export type PushSubscribeResult={subscription:PushSubscription;endpoint:string;created:boolean;d1Saved:true}

export async function subscribePush(service:StrategyNotesService,onStage?:(stage:PushSubscribeStage)=>void):Promise<PushSubscribeResult>{
  if(!('serviceWorker'in navigator)||!('PushManager'in window)||!('Notification'in window))throw new Error('이 기기는 Web Push를 지원하지 않습니다.')
  if(Notification.permission!=='granted')throw new Error('알림 권한을 먼저 허용해 주세요.')
  onStage?.('service-worker-registering')
  await navigator.serviceWorker.register('/sw.js')
  const ready=await navigator.serviceWorker.ready
  onStage?.('service-worker-ready')
  const configResult=await fetch('/api/push/config',{headers:{Accept:'application/json'}})
  const config=await configResult.json() as {publicKey?:string;configured?:boolean;error?:string}
  if(!configResult.ok)throw new Error(config.error??`Push 설정 확인 실패 ${configResult.status}`)
  if(!config.configured||!config.publicKey)throw new Error('운영 VAPID 공개키가 클라이언트에 전달되지 않았습니다.')
  onStage?.('vapid-ready')
  const existing=await ready.pushManager.getSubscription()
  const subscription=existing??await ready.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:decode(config.publicKey)})
  if(!subscription.endpoint)throw new Error('Push 구독 endpoint가 생성되지 않았습니다.')
  onStage?.(existing?'subscription-existing':'subscription-created')
  const saved=await authFetch(service,'/api/push/subscribe',{method:'POST',body:JSON.stringify(subscription.toJSON())}) as {ok?:boolean}
  if(!saved.ok)throw new Error('Push 구독을 서버에 저장하지 못했습니다.')
  onStage?.('d1-saved')
  return{subscription,endpoint:subscription.endpoint,created:!existing,d1Saved:true}
}
export const testPush=(service:StrategyNotesService)=>authFetch(service,'/api/push/test',{method:'POST',body:'{}'})
