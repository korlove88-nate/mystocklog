import type {StrategyNotesService} from './strategyNotes'

export type AlertSetting={ticker:string;company:string|null;is_holding:number;buy_enabled:number;sell_enabled:number;approach_enabled:number;approach_percent:number;buy_state:string;sell_state:string;last_market_date:string|null;last_checked_at:string|null;last_alert_at:string|null;paused:number}
export type AlertEvent={id:string;ticker:string;alert_type:'buy'|'sell';event_reason:string;market_date:string;close_price:number;zone_low:number;zone_high:number;title:string;body:string;read_at:string|null;push_status:string;created_at:string}
export type AlertDashboard={settings:AlertSetting[];events:AlertEvent[];pushSubscribed:boolean;lastRun:{market_date?:string;completed_at?:string;status?:string;checked_count?:number;event_count?:number}|null;nextCheck:string}

const authFetch=async(service:StrategyNotesService,path:string,init:RequestInit={})=>{const token=await service.accessToken();if(!token)throw new Error('로그인이 필요합니다.');const result=await fetch(path,{...init,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json','X-Supabase-URL':service.url,'X-Supabase-Anon-Key':service.anonKey,...init.headers}});const body=await result.json();if(!result.ok)throw new Error((body as {error?:string}).error??`요청 실패 ${result.status}`);return body}
export const loadAlerts=(service:StrategyNotesService)=>authFetch(service,'/api/alerts') as Promise<AlertDashboard>
export const alertAction=(service:StrategyNotesService,body:Record<string,unknown>)=>authFetch(service,'/api/alerts',{method:'POST',body:JSON.stringify(body)}) as Promise<AlertDashboard>

const decode=(value:string)=>{const padding='='.repeat((4-value.length%4)%4),base64=(value+padding).replace(/-/g,'+').replace(/_/g,'/'),raw=atob(base64);return Uint8Array.from([...raw].map(char=>char.charCodeAt(0)))}
export async function subscribePush(service:StrategyNotesService){
  if(!('serviceWorker'in navigator)||!('PushManager'in window)||!('Notification'in window))throw new Error('이 기기는 Web Push를 지원하지 않습니다.')
  const permission=await Notification.requestPermission();if(permission!=='granted')throw new Error('알림 권한이 허용되지 않았습니다.')
  await navigator.serviceWorker.register('/sw.js');const ready=await navigator.serviceWorker.ready,config=await authFetch(service,'/api/push/config') as {publicKey?:string;configured?:boolean};if(!config.configured||!config.publicKey)throw new Error('서버 Push 키 설정이 필요합니다.')
  const existing=await ready.pushManager.getSubscription(),subscription=existing??await ready.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:decode(config.publicKey)})
  await authFetch(service,'/api/push/subscribe',{method:'POST',body:JSON.stringify(subscription.toJSON())});return subscription
}
export const testPush=(service:StrategyNotesService)=>authFetch(service,'/api/push/test',{method:'POST',body:'{}'})
