import { createRequire } from 'node:module'
import fs from 'node:fs'
const require = createRequire('C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/_entry.js')
const { chromium } = require('playwright')
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream'] })
const context = await browser.newContext({ viewport: {width:960,height:600}, permissions: ['camera'] })
const page = await context.newPage()
let sessionId = ''; page.on('response',async r => { if(r.url().endsWith('/api/v1/community/session') && r.request().method()==='POST') sessionId = (await r.json()).session_id })
const out = 'outputs/report-center-qa'
fs.mkdirSync(out,{recursive:true})
const shot = async name => { await page.screenshot({path:`${out}/${name}.png`}); console.log('SCREEN',name) }
const click = async text => { await page.getByRole('button',{name:text,exact:true}).click(); console.log('CLICK',text) }
try {
 const reportIdFromFile = fs.readFileSync(`${out}/latest-report-id.txt`,'utf8').trim()
 const r = await (await page.request.post('http://localhost:8001/api/v1/community/report-center/lookup',{data:{report_id:reportIdFromFile}})).json()
 const phone = await context.newPage()
 await phone.goto(`http://localhost:8001/community/reports#access=${r.access_token}`)
 await page.goto(`http://localhost:8001/login/?device_id=report-qa-terminal`)
 const answers = 19, started = Date.now()
 await phone.locator('.preport').waitFor({timeout:30000})
 const token = new URLSearchParams(new URL(phone.url()).hash.slice(1)).get('access')
 const reportId = r.report_id

 await page.getByRole('button',{name:/^查看报告/}).click()
 await page.getByRole('heading',{name:/查看自己的/}).waitFor()
 await shot('08-lookup')
 for (const c of reportId) await page.getByRole('button',{name:c,exact:true}).click()
 await page.getByRole('button',{name:/^查看报告/}).click()
 await page.locator('.preport').waitFor()
 for (let i=0;i<4;i++) { await page.getByRole('tab').nth(i).click(); await shot(`09-terminal-report-${i+1}`) }
 await click('手机查看 / 下载')
 await shot('10-share')
 await click('关闭 ×')
 await phone.setViewportSize({width:390,height:844})
 for(let i=0;i<4;i++){await phone.getByRole('tab').nth(i).click();await phone.screenshot({path:`${out}/11-mobile-report-${i+1}.png`})}
 const preview = await phone.request.get(`http://localhost:8001/api/v1/community/report-center/pdf?token=${encodeURIComponent(token)}`)
 if(!preview.ok() || !preview.headers()['content-disposition'].includes('inline')) throw Error('PDF preview failed')
 const downloaded = await phone.request.get(`http://localhost:8001/api/v1/community/report-center/pdf?token=${encodeURIComponent(token)}&download=true`)
 if(!downloaded.ok() || !downloaded.headers()['content-disposition'].includes('attachment')) throw Error('PDF download failed')
 fs.writeFileSync(`${out}/community-report-demo.pdf`,await downloaded.body())
 await click('退出报告')
 if(await page.locator('.preport').count()) throw Error('report not cleared')
 const input = await page.locator('#report-number').inputValue()
 if(input) throw Error('report ID not cleared')
 fs.writeFileSync(`${out}/qa-summary.json`, JSON.stringify({sessionId,reportId,answers,captureSeconds:(Date.now()-started)/1000,pdfBytes:(await downloaded.body()).length,passed:true},null,2))
 console.log('PASS complete report loop', reportId)
} finally { await browser.close() }
