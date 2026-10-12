// Backward-compatible entry point for the direct incremental collector.
import { main } from './daily-supabase.mjs'
main().catch(()=>{console.error('Supabase daily refresh failed; see daily-refresh-supabase.log');process.exitCode=1})
