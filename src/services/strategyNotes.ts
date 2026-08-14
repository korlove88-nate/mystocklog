import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js'

export type StrategyNote = { id: string; ticker: string; content: string; tag: string; createdAt: string; updatedAt: string }
export type NoteInput = Pick<StrategyNote, 'ticker'|'content'|'tag'>

const mapNote = (row: Record<string, unknown>): StrategyNote => ({
  id: String(row.id), ticker: String(row.ticker), content: String(row.content), tag: String(row.tag),
  createdAt: String(row.created_at), updatedAt: String(row.updated_at),
})

export class StrategyNotesService {
  readonly client: SupabaseClient
  constructor(url: string, anonKey: string) { this.client = createClient(url, anonKey, {auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}}) }
  async user(): Promise<User|null> { return (await this.client.auth.getUser()).data.user ?? null }
  async ensureAnonymousUser(): Promise<User> {
    const {data:{session},error:sessionError}=await this.client.auth.getSession()
    if(sessionError)throw sessionError
    if(session?.user)return session.user
    const {data,error}=await this.client.auth.signInAnonymously()
    if(error)throw error
    if(!data.user)throw new Error('Anonymous sign-in did not return a user')
    return data.user
  }
  async signIn(email:string,password:string) { const {data,error}=await this.client.auth.signInWithPassword({email,password}); if(error)throw error; return data.user }
  async signUp(email:string,password:string) { const {data,error}=await this.client.auth.signUp({email,password}); if(error)throw error; return data.user }
  async signOut() { const {error}=await this.client.auth.signOut(); if(error)throw error }
  async list(): Promise<StrategyNote[]> { const {data,error}=await this.client.from('strategy_notes').select('id,ticker,content,tag,created_at,updated_at').order('updated_at',{ascending:false}); if(error)throw error; return (data??[]).map(row=>mapNote(row)) }
  async create(input:NoteInput): Promise<StrategyNote> { const {data,error}=await this.client.from('strategy_notes').insert({ticker:input.ticker,content:input.content,tag:input.tag}).select('id,ticker,content,tag,created_at,updated_at').single(); if(error)throw error; return mapNote(data) }
  async update(id:string,input:Pick<NoteInput,'content'|'tag'>): Promise<StrategyNote> { const {data,error}=await this.client.from('strategy_notes').update({content:input.content,tag:input.tag,updated_at:new Date().toISOString()}).eq('id',id).select('id,ticker,content,tag,created_at,updated_at').single(); if(error)throw error; return mapNote(data) }
  async remove(id:string): Promise<void> { const {error}=await this.client.from('strategy_notes').delete().eq('id',id); if(error)throw error }
  async migrate(notes:StrategyNote[]): Promise<number> { if(!notes.length)return 0; const rows=notes.map(note=>({ticker:note.ticker,content:note.content,tag:note.tag,created_at:note.createdAt,updated_at:note.updatedAt})); const {error}=await this.client.from('strategy_notes').insert(rows); if(error)throw error; return rows.length }
}

export const createStrategyNotesService = (url:string,anonKey:string) => url&&anonKey ? new StrategyNotesService(url,anonKey) : null
