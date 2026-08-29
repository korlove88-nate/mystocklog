if(!process.env.MARKET_SYNC_URL||!process.env.MARKET_SYNC_TOKEN)throw new Error('MARKET_SYNC_URL과 MARKET_SYNC_TOKEN이 필요합니다.')

const url=new URL(process.env.MARKET_SYNC_URL)
url.search=''
url.searchParams.set('scheduled','1')

const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms))
const request=()=>fetch(url,{method:'POST',headers:{Authorization:`Bearer ${process.env.MARKET_SYNC_TOKEN}`,...(process.env.SITES_BYPASS_TOKEN?{'OAI-Sites-Authorization':`Bearer ${process.env.SITES_BYPASS_TOKEN}`}:{})},signal:AbortSignal.timeout(90_000)})
let response,lastError
for(let attempt=1;attempt<=3;attempt++)try{response=await request();if(response.ok||response.status<500)break;lastError=new Error(`HTTP ${response.status}`)}catch(error){lastError=error}finally{if(!response?.ok&&attempt<3)await delay(attempt*5_000)}
if(!response)throw lastError??new Error('운영 시장지표 갱신 연결 실패')
const text=await response.text()
if(!response.ok)throw new Error(`운영 시장지표 갱신 실패 (${response.status}): ${text.slice(0,300)}`)
const result=JSON.parse(text)
console.log(`운영 시장지표 갱신 완료: ${result.refresh?.completedAt??'시간 미확인'}`)
