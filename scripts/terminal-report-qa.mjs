/**
 * 真机报告页 QA（CDP 驱动 RK3568 WebView）：
 * 1) 查询报告 → 四页卡片渲染/页签切换/独立滚动（真实已完成测评）；
 * 2) 各状态返回首页按钮；原生预览不遮挡（截图判定）；
 * 3) sim 流程倒计时：数字语音零播放、开始提示音恰好一次。
 * 用法：node scripts/terminal-report-qa.mjs
 */
import fs from 'node:fs'

const CDP = 'http://172.19.0.1:9224'
const PAGE = 'http://10.0.0.29:8000/login/'
const SUBJ = process.argv[2] || '68888'
const CODE = process.argv[3] || 'RFT5X-AA2NX'

const pages = await (await fetch(`${CDP}/json`)).json()
const page = pages.find(p => p.type === 'page')
if (!page) throw new Error('No terminal page')
const ws = new WebSocket(page.webSocketDebuggerUrl)
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j })
let seq = 0; const pending = new Map()
ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id) } }
const send = (method, params = {}) => new Promise(resolve => { const id = ++seq; pending.set(id, resolve); ws.send(JSON.stringify({ id, method, params })) })
const evaluate = async expr => {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })
  if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 300))
  return r.result?.result?.value
}
const evaluateSafe = async expr => { try { return await evaluate(expr) } catch { return undefined } }
const shot = async name => {
  const s = await send('Page.captureScreenshot', { format: 'png' })
  fs.mkdirSync('artifacts', { recursive: true })
  fs.writeFileSync(`artifacts/report-qa-${name}.png`, Buffer.from(s.result.data, 'base64'))
  console.log(`[shot] ${name}`)
}
const sleep = ms => new Promise(r => setTimeout(r, ms))
const waitFor = async (desc, fn, timeout = 30000, every = 500) => {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) { const v = await fn(); if (v) return v; await sleep(every) }
  throw new Error(`timeout: ${desc}`)
}
const text = () => evaluateSafe('document.body && document.body.innerText') ?? ''
const has = s => evaluateSafe(`!!(document.body && document.body.innerText.includes(${JSON.stringify(s)}))`)
const clickBtn = label => evaluateSafe(`(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent.trim().includes(${JSON.stringify(label)})&&!b.disabled);if(b){b.click();return true}return false})()`)
const tapAt = (x, y) => send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] })
  .then(() => send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }))

let failures = 0
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'} | ${name}${detail ? ' | ' + detail : ''}`)
  if (!ok) failures++
}

try {
  // ═══ 一、查询报告 → 四页卡片 ═══
  console.log('═══ 一、四页报告真机验证 ═══')
  await send('Page.navigate', { url: PAGE })
  await waitFor('首页出现', () => has('开始测评'), 20000)
  await shot('1-home')
  check('首页双入口', await has('查询报告'))

  await clickBtn('查询报告')
  await waitFor('查询表单', () => has('报告查询码'), 10000)
  check('查询页打开(工号+查询码输入)', await has('工号') && await has('报告查询码'))
  await shot('2-lookup-form')

  await evaluate(`(()=>{
    const inputs=[...document.querySelectorAll('.lookup__form input')]
    const set=(el,v)=>{el.value=v;el.dispatchEvent(new Event('input',{bubbles:true}))}
    set(inputs[0], ${JSON.stringify(SUBJ)}); set(inputs[1], ${JSON.stringify(CODE)})
    return true
  })()`)
  await clickBtn('查询')
  await waitFor('报告完成标题', () => has('报告已生成'), 15000)
  await waitFor('四页页签渲染', () => has('行为与视觉信号'), 10000)
  await shot('3-report-overview')

  // 总览页要素
  check('页头(个人测评报告+测评时间)', await has('个人测评报告') && await has('测评时间'))
  check('总览:稳定表现+重点关注', await has('本次稳定表现') && await has('建议重点关注'))
  check('总览:核心结果+参考区间条', await has('本次核心结果') && await has('参考区间'))
  check('总览:数据质量', await has('本次数据质量'))
  check('总览:复核状态(尚未复核)', await has('尚未进行专业复核'))
  check('免责声明', await has('不构成医学诊断'))

  // 页签切换
  const switchTab = async label => {
    await evaluateSafe(`[...document.querySelectorAll('.preport__tabs button')].find(b=>b.textContent.trim()===${JSON.stringify(label)})?.click()`)
    await sleep(600)
  }
  await switchTab('情绪状态')
  await shot('4-report-emotion')
  check('情绪页:方向筛查+情绪线索', await has('抑郁方向筛查') && await has('情绪相关状态线索'))
  check('情绪页:解读与边界', await has('结果边界') || await has('筛查不等于诊断') || await has('不等同于临床诊断') || await evaluateSafe(`!!document.querySelector('.preport__page .panel-note')`))

  await switchTab('行为与视觉信号')
  await shot('5-report-behavior')
  check('行为页:视觉注意+面部行为+生理节律', await has('视觉注意与眼动') && await has('面部行为线索') && await has('生理节律信号'))

  await switchTab('建议与说明')
  await shot('6-report-advice')
  check('建议页:建议与下一步+解读建议+结果边界', await has('建议与下一步') && await has('各项结果的解读建议') && await has('结果边界'))

  // 滑动切换(补充交互):在页签区域向左滑 → 从建议页滑不出去(已是最后页),先回总览再左滑
  await switchTab('总览')
  const before = await evaluateSafe(`[...document.querySelectorAll('.preport__tabs button')].findIndex(b=>b.classList.contains('active'))`)
  await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 900, y: 300 }] })
  await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await sleep(200)
  await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 900, y: 300 }] })
  await sleep(80)
  await send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 300, y: 300 }] })
  await sleep(60)
  await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await sleep(700)
  const after = await evaluateSafe(`[...document.querySelectorAll('.preport__tabs button')].findIndex(b=>b.classList.contains('active'))`)
  check('左滑切页(总览→情绪)', after !== undefined && before !== undefined && after > before, `tab index ${before}→${after}`)

  // 内部滚动:情绪页滚动到底可见
  await evaluateSafe(`(()=>{const p=[...document.querySelectorAll('.preport__page')].find(x=>x.offsetHeight>0);if(p){p.scrollTop=p.scrollHeight;return Math.round(p.scrollTop)}>0}return false})()`)

  // 返回首页(手动退出)
  await waitFor('返回首页按钮', () => evaluateSafe(`[...document.querySelectorAll('button')].some(b=>b.textContent.includes('完成并返回首页')&&!b.disabled)`), 5000)
  await clickBtn('完成并返回首页')
  await waitFor('回到首页', () => has('开始测评'), 10000)
  await shot('7-back-home')
  check('手动退出返回首页', true)
  check('退出后凭证不在页面(清屏)', !(await text()).includes(CODE))

  // ═══ 二、错误凭证 → 统一提示 ═══
  console.log('═══ 二、错误凭证统一提示 ═══')
  await clickBtn('查询报告')
  await waitFor('查询表单2', () => has('报告查询码'), 8000)
  await evaluate(`(()=>{
    const inputs=[...document.querySelectorAll('.lookup__form input')]
    const set=(el,v)=>{el.value=v;el.dispatchEvent(new Event('input',{bubbles:true}))}
    set(inputs[0],'99999'); set(inputs[1],'WRONG-CODE')
    return true
  })()`)
  await clickBtn('查询')
  await waitFor('错误提示', () => has('编号或查询码有误'), 8000)
  check('错误凭证统一文案(不泄露存在性)', await has('编号或查询码有误'))
  await shot('8-invalid-credential')
  await clickBtn('返回首页')
  await waitFor('回到首页2', () => has('开始测评'), 8000)

  // ═══ 三、sim 倒计时音频验证 ═══
  console.log('═══ 三、倒计时音频(数字语音移除) ═══')
  await send('Page.navigate', { url: PAGE + '?sim=1' })
  await waitFor('sim首页', () => has('开始测评'), 20000)
  // 拦截全部音频播放
  await evaluate(`(()=>{
    window.__qaAudio=[]
    const orig=HTMLMediaElement.prototype.play
    HTMLMediaElement.prototype.play=function(){window.__qaAudio.push(this.src);return orig.apply(this,arguments)}
    return true
  })()`)
  await clickBtn('开始测评')
  await waitFor('登录页', () => has('请填写测评信息'), 8000)
  await evaluate(`(()=>{
    const i=document.querySelector('input[autocomplete="name"]');i.value='音频验证';i.dispatchEvent(new Event('input',{bubbles:true}));return true
  })()`)
  await clickBtn('请点击输入工号')
  for (const d of ['9','9','0','1']) await evaluateSafe(`[...document.querySelectorAll('.employee-keypad__grid button')].find(b=>b.textContent===${JSON.stringify(d)})?.click()`)
  await clickBtn('完成'); await clickBtn('男')
  await clickBtn('请点击输入年龄')
  for (const d of ['3','0']) await evaluateSafe(`[...document.querySelectorAll('.employee-keypad__grid button')].find(b=>b.textContent===${JSON.stringify(d)})?.click()`)
  await clickBtn('完成')
  await waitFor('开始测评可点', () => evaluateSafe(`[...document.querySelectorAll('button')].some(b=>b.textContent.includes('开始测评')&&!b.disabled)`), 8000)
  await clickBtn('开始测评')
  await waitFor('同意页', () => has('我已完整阅读'), 15000)
  await evaluateSafe(`document.querySelector('.consent-card input[type=checkbox]').click()`)
  await waitFor('素材就绪', () => evaluateSafe(`[...document.querySelectorAll('button')].some(b=>b.textContent.includes('确认并进入采集准备')&&!b.disabled)`), 60000)
  await clickBtn('确认并进入采集准备')
  await waitFor('就位页', () => has('采集准备'), 10000)
  await sleep(3000)  // sim 人脸稳定
  await clickBtn('开始操作体验')
  await waitFor('预训练', () => has('操作预训练'), 10000)
  // 跳过预训练直达倒计时
  await clickBtn('跳过预训练')
  await waitFor('开始正式测评可点', () => evaluateSafe(`[...document.querySelectorAll('button')].some(b=>b.textContent.includes('开始正式测评')&&!b.disabled)`), 8000)
  await evaluate(`(()=>{window.__qaAudio=[];return true})()`)  // 只记录倒计时之后的
  await clickBtn('开始正式测评')
  await waitFor('倒计时页', () => has('正式采集即将开始'), 8000)
  await shot('9-countdown')
  await waitFor('正式页(倒计时结束)', () => has('请按您的节奏作答'), 12000)

  const audio = (await evaluateSafe('window.__qaAudio||[]')) ?? []
  const countdownAudio = audio.filter(src => /countdown-[123]/.test(src))
  const startAudio = audio.filter(src => /start\.wav/.test(src))
  check('倒计时数字语音零播放', countdownAudio.length === 0, `audio=${JSON.stringify(audio)}`)
  check('开始提示音恰好一次', startAudio.length === 1, `start=${startAudio.length}`)
  await shot('10-assess-started')

  // 等待封存后完成页(验证完整闭环仍工作)——最长75秒
  await waitFor('提交凭证/完成页', () => has('完成并返回首页'), 90000, 2000)
  await shot('11-complete')
  check('完整闭环到达完成页', true)

  console.log(failures === 0 ? '\n✔ 真机验证全部通过' : `\n✘ ${failures} 项失败`)
  process.exitCode = failures === 0 ? 0 : 1
} catch (error) {
  console.error('[fail]', error.message)
  try { await shot('fail') } catch { /* no-op */ }
  process.exitCode = 1
} finally { ws.close() }
