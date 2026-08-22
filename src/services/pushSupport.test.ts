import {describe,expect,it} from 'vitest'
import {detectPushSupport} from './pushSupport'

describe('push feature detection',()=>{it('does not infer support from a user agent on the server',()=>expect(detectPushSupport()).toEqual({standalone:false,serviceWorker:false,pushManager:false,notification:false,supported:false,permission:'unsupported'}))})
