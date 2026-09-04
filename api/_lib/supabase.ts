type SupabaseConfig = { url: string; serviceRoleKey: string }

const configured = (): SupabaseConfig => {
  const url = process.env.SUPABASE_URL?.replace(/\/$/, '')
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceRoleKey) throw new Error('Supabase server environment is not configured.')
  return { url, serviceRoleKey }
}

export const supabaseRest = async <T>(path: string, init: RequestInit = {}): Promise<T> => {
  const { url, serviceRoleKey } = configured()
  const response = await fetch(`${url}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      ...init.headers,
    },
  })
  if (!response.ok) throw new Error(`Supabase REST ${response.status}`)
  return response.json() as Promise<T>
}

export const noStoreHeaders = { 'Cache-Control': 'private, no-store', 'Content-Type': 'application/json; charset=utf-8' }
