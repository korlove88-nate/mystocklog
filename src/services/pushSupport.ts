export type PushSupport={standalone:boolean;serviceWorker:boolean;pushManager:boolean;notification:boolean;supported:boolean;permission:NotificationPermission|'unsupported'}

export function detectPushSupport():PushSupport{
  if(typeof window==='undefined'||typeof navigator==='undefined')return{standalone:false,serviceWorker:false,pushManager:false,notification:false,supported:false,permission:'unsupported'}
  const serviceWorker='serviceWorker'in navigator,pushManager='PushManager'in window,notification='Notification'in window
  const standalone=window.matchMedia?.('(display-mode: standalone)').matches===true||(navigator as Navigator&{standalone?:boolean}).standalone===true
  return{standalone,serviceWorker,pushManager,notification,supported:serviceWorker&&pushManager&&notification,permission:notification?Notification.permission:'unsupported'}
}
