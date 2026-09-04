/**
 * Vercel/Supabase daily job for the Mac mini.
 *
 * It intentionally does not call the existing Sites/Cloudflare URL. Keep the
 * current refresh-and-sync.mjs job enabled until the Vercel URL is verified,
 * then point launchd at this script instead.
 */
import { spawn } from 'node:child_process'
import { appendFile, mkdir } from 'node:fs/promises'

const port = 4174
const origin = `http://127.0.0.1:${port}`
const logDir = '.automation-logs'
await mkdir(logDir, { recursive: true })
const log = async message => {
  const line = `${new Date().toISOString()} ${message}\n`
  process.stdout.write(line)
  await appendFile(`${logDir}/daily-refresh-supabase.log`, line)
}
const run = (command, args) => new Promise((resolve, reject) => {
  const child = spawn(command, args, { stdio: 'inherit', env: process.env })
  child.once('error', reject)
  child.once('exit', code => code === 0 ? resolve() : reject(new Error(`${command} exited ${code}`)))
})
const server = spawn('/usr/local/bin/npm', ['run', 'dev', '--', '--port', String(port)], { stdio: ['ignore', 'pipe', 'pipe'], env: process.env, detached: true })
server.stdout.on('data', chunk => process.stdout.write(chunk))
server.stderr.on('data', chunk => process.stderr.write(chunk))
const stop = () => { try { process.kill(-server.pid, 'SIGTERM') } catch { /* already stopped */ } }

try {
  let ready = false
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      if ((await fetch(`${origin}/api/market-data?status=1`)).ok) { ready = true; break }
    } catch { /* server still starting */ }
    await new Promise(resolve => setTimeout(resolve, 1000))
  }
  if (!ready) throw new Error('로컬 데이터 서버가 60초 안에 시작되지 않았습니다.')
  await log('Supabase 일일 갱신 시작')
  const response = await fetch(`${origin}/api/market-data?dashboard=1`, { headers: { 'x-refresh-market-data': '1' }, signal: AbortSignal.timeout(180_000) })
  const body = await response.json()
  if (!response.ok || body.refresh?.status === 'failed') throw new Error(`로컬 갱신 실패 (${response.status})`)
  await log(`로컬 확정 일봉 갱신 완료 · ${body.refresh?.marketDate ?? '시장일 미확인'}`)
  await run('/usr/local/bin/node', ['--env-file=.env', 'scripts/sync-d1-to-supabase.mjs'])
  await log('Supabase 대시보드·일봉·백테스트 동기화 완료')
} catch (error) {
  await log(`실패 · ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
} finally {
  stop()
}
