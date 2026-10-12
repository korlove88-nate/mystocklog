export const PPIPPI_ORIGINS = new Set(['http://127.0.0.1:8765', 'http://localhost:8765'])
export const PPIPPI_RECEIPTS_KEY = 'mystocklog-ppippi-action-receipts'
type RouterReceipt={status:'PREVIEW';action_type:'MYSTOCKLOG_WATCHLIST_ADD'|'MYSTOCKLOG_WATCHLIST_REMOVE';idempotency_key:string;result:{parameters:Record<string,unknown>}}
export type FavoriteAction = {source:'PPIPPI';version:1;type:'MYSTOCKLOG_FAVORITE_ADD'|'MYSTOCKLOG_FAVORITE_REMOVE'|'MYSTOCKLOG_FAVORITES_READ';idempotencyKey:string;ticker?:string;routerReceipt?:RouterReceipt}
type Receipt={source:'MYSTOCKLOG';version:1;idempotencyKey:string;status:'SUCCESS'|'DUPLICATE'|'BLOCKED';before:string[];after:string[];reason?:string}
const validKey=(value:unknown)=>typeof value==='string'&&value.length>=8&&value.length<=160
const priorKeys=(storage:Storage)=>{try{const value=JSON.parse(storage.getItem(PPIPPI_RECEIPTS_KEY)??'[]');return Array.isArray(value)?value.filter(validKey).slice(-100):[]}catch{return[]}}
export function applyFavoriteAction(action:FavoriteAction,current:string[],known:Set<string>,storage:Storage):Receipt{
  const before=[...current],keys=priorKeys(storage),idempotencyKey=String(action.idempotencyKey??'')
  if(!validKey(action.idempotencyKey))return{source:'MYSTOCKLOG',version:1,idempotencyKey,status:'BLOCKED',before,after:before,reason:'INVALID_IDEMPOTENCY_KEY'}
  if(keys.includes(action.idempotencyKey))return{source:'MYSTOCKLOG',version:1,idempotencyKey,status:'DUPLICATE',before,after:before}
  if(action.type==='MYSTOCKLOG_FAVORITES_READ')return{source:'MYSTOCKLOG',version:1,idempotencyKey,status:'SUCCESS',before,after:before}
  const ticker=String(action.ticker??'').trim().toUpperCase()
  if(!known.has(ticker))return{source:'MYSTOCKLOG',version:1,idempotencyKey,status:'BLOCKED',before,after:before,reason:'UNKNOWN_TICKER'}
  const expected=action.type==='MYSTOCKLOG_FAVORITE_ADD'?'MYSTOCKLOG_WATCHLIST_ADD':'MYSTOCKLOG_WATCHLIST_REMOVE',receipt=action.routerReceipt
  if(!receipt||receipt.status!=='PREVIEW'||receipt.action_type!==expected||receipt.idempotency_key!==action.idempotencyKey||String(receipt.result?.parameters?.ticker??'').toUpperCase()!==ticker)return{source:'MYSTOCKLOG',version:1,idempotencyKey,status:'BLOCKED',before,after:before,reason:'ROUTER_APPROVAL_REQUIRED'}
  const after=action.type==='MYSTOCKLOG_FAVORITE_ADD'?Array.from(new Set([...before,ticker])):before.filter(value=>value!==ticker)
  storage.setItem('mystocklog-favorite-tickers',JSON.stringify(after));storage.setItem(PPIPPI_RECEIPTS_KEY,JSON.stringify([...keys,action.idempotencyKey].slice(-100)))
  return{source:'MYSTOCKLOG',version:1,idempotencyKey,status:'SUCCESS',before,after}
}
export function isTrustedPPIPPIEvent(event:MessageEvent){return window.top!==window&&event.source===window.parent&&PPIPPI_ORIGINS.has(event.origin)}
