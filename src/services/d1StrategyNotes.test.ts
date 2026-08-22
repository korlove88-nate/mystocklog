import {afterEach,describe,expect,it,vi} from 'vitest'
import {createD1Note,listD1Notes,removeD1Note,updateD1Note} from './d1StrategyNotes'

const note={id:'n1',ticker:'AAPL',content:'실적 확인',tag:'실적',createdAt:'2026-08-22T00:00:00Z',updatedAt:'2026-08-22T00:00:00Z'}

describe('D1 strategy notes client',()=>{
  afterEach(()=>vi.unstubAllGlobals())

  it('loads notes with the private Sites session',async()=>{
    const request=vi.fn<(input:RequestInfo|URL,init?:RequestInit)=>Promise<Response>>(async()=>Response.json({notes:[note]}))
    vi.stubGlobal('fetch',request)
    expect(await listD1Notes()).toEqual([note])
    expect(request).toHaveBeenCalledWith('/api/strategy-notes',expect.objectContaining({credentials:'same-origin'}))
  })

  it('creates, updates, and removes notes through D1',async()=>{
    const request=vi.fn<(input:RequestInfo|URL,init?:RequestInit)=>Promise<Response>>(async(_input,init)=>Response.json(JSON.parse(String(init?.body)).action==='delete'?{ok:true}:{note}))
    vi.stubGlobal('fetch',request)
    expect(await createD1Note({ticker:'AAPL',content:'실적 확인',tag:'실적'})).toEqual(note)
    expect(await updateD1Note('n1',{content:'실적 확인',tag:'실적'})).toEqual(note)
    await expect(removeD1Note('n1')).resolves.toBeUndefined()
  })
})
