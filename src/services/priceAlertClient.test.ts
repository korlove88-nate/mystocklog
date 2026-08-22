import {afterEach,describe,expect,it,vi} from 'vitest'
import {loadAlerts} from './priceAlertClient'

const dashboard={settings:[],events:[],pushSubscribed:false,authSource:'sites',lastRun:null,nextCheck:'06:40 KST'}

describe('price alert client authentication',()=>{
  afterEach(()=>vi.unstubAllGlobals())

  it('lets a private Sites session identify the D1 owner without Supabase',async()=>{
    const request=vi.fn<(input:RequestInfo|URL,init?:RequestInit)=>Promise<Response>>(async()=>Response.json(dashboard))
    vi.stubGlobal('fetch',request)
    await loadAlerts(null)
    expect(request).toHaveBeenCalledWith('/api/alerts',expect.objectContaining({credentials:'same-origin'}))
    const init=request.mock.calls[0][1] as RequestInit
    expect(new Headers(init.headers).has('Authorization')).toBe(false)
  })

  it('reuses a Supabase access token when the PWA has one',async()=>{
    const request=vi.fn<(input:RequestInfo|URL,init?:RequestInit)=>Promise<Response>>(async()=>Response.json({...dashboard,authSource:'supabase'}))
    vi.stubGlobal('fetch',request)
    const service={url:'https://project.supabase.co',anonKey:'anon',accessToken:vi.fn(async()=> 'token')}
    await loadAlerts(service as never)
    const init=request.mock.calls[0][1] as RequestInit
    expect(new Headers(init.headers).get('Authorization')).toBe('Bearer token')
  })
})
