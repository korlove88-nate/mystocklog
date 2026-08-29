import { spawn } from 'node:child_process'
import { mkdir, appendFile } from 'node:fs/promises'

const port=4173,origin=`http://127.0.0.1:${port}`,started=new Date().toISOString(),logDir='.automation-logs'
await mkdir(logDir,{recursive:true})
const log=async message=>{const line=`${new Date().toISOString()} ${message}\n`;process.stdout.write(line);await appendFile(`${logDir}/daily-refresh.log`,line)}
const run=(command,args)=>new Promise((resolve,reject)=>{const child=spawn(command,args,{stdio:'inherit',env:process.env});child.once('error',reject);child.once('exit',code=>code===0?resolve():reject(new Error(`${command} exited ${code}`)))})
const server=spawn('/usr/local/bin/npm',['run','dev','--','--port',String(port)],{stdio:['ignore','pipe','pipe'],env:process.env,detached:true})
server.stdout.on('data',chunk=>process.stdout.write(chunk));server.stderr.on('data',chunk=>process.stderr.write(chunk))
const stop=()=>{try{process.kill(-server.pid,'SIGTERM')}catch{/* already stopped */}}
process.on('SIGTERM',()=>{stop();process.exit(143)})
try{
  let ready=false
  for(let attempt=0;attempt<60;attempt++){try{const response=await fetch(`${origin}/api/market-data?status=1`);if(response.ok){ready=true;break}}catch{/* starting */}await new Promise(resolve=>setTimeout(resolve,1000))}
  if(!ready)throw new Error('로컬 데이터 서버가 60초 안에 시작되지 않았습니다.')
  await log(`일일 갱신 시작 (${started})`)
  const refreshed=await fetch(`${origin}/api/market-data?dashboard=1`,{headers:{'x-refresh-market-data':'1'},signal:AbortSignal.timeout(180_000)}),body=await refreshed.json()
  if(!refreshed.ok)throw new Error(`로컬 TOSS 갱신 실패 (${refreshed.status})`)
  const toss=body.refresh?.sources?.toss
  if(toss?.status!=='ok'&&toss?.status!=='partial')throw new Error(`TOSS 갱신 상태: ${toss?.status??'unknown'} ${toss?.error??''}`)
  await log(`로컬 TOSS 갱신 완료 · ${body.refresh?.marketDate??'시장일 미확인'}`)
  await run('/usr/local/bin/node',['--env-file=.env','scripts/sync-toss-to-production.mjs'])
  await log('운영 D1 동기화 완료')
  await run('/usr/local/bin/node',['--env-file=.env','scripts/refresh-market-overview-production.mjs'])
  await log('운영 시장지표 갱신 완료')
}catch(error){await log(`실패 · ${error instanceof Error?error.message:String(error)}`);process.exitCode=1}finally{stop()}
