import type {NoteInput,StrategyNote} from './strategyNotes'

const request=async(path:string,init:RequestInit={})=>{
  const response=await fetch(path,{...init,credentials:'same-origin',headers:{'Content-Type':'application/json',...init.headers}})
  const body=await response.json() as {notes?:StrategyNote[];note?:StrategyNote;error?:string;ok?:boolean}
  if(!response.ok)throw new Error(body.error??`전략노트 요청 실패 ${response.status}`)
  return body
}

export const listD1Notes=async()=>((await request('/api/strategy-notes')).notes??[])
export const createD1Note=async(input:NoteInput)=>{
  const note=(await request('/api/strategy-notes',{method:'POST',body:JSON.stringify({action:'create',...input})})).note
  if(!note)throw new Error('전략노트 저장 결과가 없습니다.')
  return note
}
export const updateD1Note=async(id:string,input:Pick<NoteInput,'content'|'tag'>)=>{
  const note=(await request('/api/strategy-notes',{method:'POST',body:JSON.stringify({action:'update',id,...input})})).note
  if(!note)throw new Error('전략노트 수정 결과가 없습니다.')
  return note
}
export const removeD1Note=async(id:string)=>{await request('/api/strategy-notes',{method:'POST',body:JSON.stringify({action:'delete',id})})}
export const migrateD1Notes=async(notes:StrategyNote[])=>{if(notes.length)await request('/api/strategy-notes',{method:'POST',body:JSON.stringify({action:'migrate',notes})})}
