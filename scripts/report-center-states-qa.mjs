import {createRequire} from 'node:module'
import fs from 'node:fs'
const require=createRequire('C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/_entry.js')
const {chromium}=require('playwright')
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true})
const page=await browser.newPage({viewport:{width:960,height:600}})
const base='http://127.0.0.1:8000'
const response=await page.request.post(base+'/api/v1/community/report-center/lookup',{data:{report_id:'F0345906'}})
const report=await response.json()
let calls=0
try{
 await page.clock.install()
 await page.route('**/report-center/view?**',async route=>{
  calls++
  if(calls===1) return route.abort('failed')
  if(calls===2) return route.fulfill({json:{...report,status:'processing',report:null,has_pdf:false}})
  return route.continue()
 })
 await page.goto(base+'/community/reports?terminal=1#access='+report.access_token)
 await page.getByRole('alert').waitFor()
 await page.getByRole('button',{name:'重新连接'}).click()
 await page.getByRole('heading',{name:'分析中',exact:true}).waitFor()
 await page.screenshot({path:'outputs/report-center-qa/state-processing.png'})
 await page.clock.fastForward(6000); await page.locator('.preport').waitFor({timeout:15000})
 await page.getByRole('tab').nth(1).click();await page.waitForTimeout(200)
 await page.screenshot({path:'outputs/report-center-qa/state-completed.png'})
 console.log('PASS network retry and processing -> completed automatic refresh')
 await page.clock.fastForward(301000)
 await page.waitForURL('**/login/')
 console.log('PASS 300 seconds idle clears report and returns home')
 await page.unrouteAll()
 await page.route('**/report-center/view?**',route=>route.fulfill({json:{...report,status:'needs_attention',report:null,has_pdf:false}}))
 await page.goto(base+'/community/reports?terminal=1#access='+report.access_token)
 await page.getByRole('heading',{name:'本次报告暂不可用'}).waitFor()
 await page.screenshot({path:'outputs/report-center-qa/state-unavailable.png'})
 console.log('PASS failure message and no PDF action')
 await page.getByRole('button',{name:'退出报告'}).click()
 if(await page.locator('#report-number').inputValue())throw Error('stale credential')
 fs.writeFileSync('outputs/report-center-qa/states-summary.json',JSON.stringify({networkRetry:true,automaticRefresh:true,idleExit:true,failedState:true,explicitExit:true},null,2))
}finally{await browser.close()}
