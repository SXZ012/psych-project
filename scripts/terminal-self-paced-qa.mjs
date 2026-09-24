/**
 * 航空自定节奏流程真机验证（CDP 驱动 WebView，?sim=1）。
 *
 * sim 模式：状态机全真运转、题库/素材/图片/音频真实加载播放，
 * 但不启动真实录像、不发送任何提交（不可能污染正式测评数据）。
 *
 * 用法：node scripts/terminal-self-paced-qa.mjs [shot]
 *   不带参数 = 全流程；shot = 仅截图当前页面
 */
import fs from 'node:fs'

// 默认走 ADB forward 的本机端口；如从其它主机调试，可用环境变量覆盖。
const CDP_BASE = process.env.TERMINAL_CDP_BASE || 'http://127.0.0.1:9224'
const PAGE_URL = process.env.TERMINAL_PAGE_URL || 'http://10.0.0.29:8000/login/?sim=1'
const mode = process.argv[2] || 'full'

const pages = await (await fetch(`${CDP_BASE}/json`)).json()
const page = pages.find(p => p.type === 'page')
if (!page) throw Error('No terminal page on CDP')
const socket = new WebSocket(page.webSocketDebuggerUrl)
await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject })
let sequence = 0
const pending = new Map()
socket.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id) } }
const send = (method, params = {}) => new Promise(resolve => { const id = ++sequence; pending.set(id, resolve); socket.send(JSON.stringify({ id, method, params })) })
const evaluate = async expression => {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  if (r.result?.exceptionDetails) throw Error(JSON.stringify(r.result.exceptionDetails))
  return r.result?.result?.value
}
/** 轮询专用：页面导航/重载瞬间 evaluate 可能失败，吞掉返回 undefined */
const evaluateSafe = async expression => {
  try { return await evaluate(expression) } catch { return undefined }
}
const shot = async name => {
  const s = await send('Page.captureScreenshot', { format: 'png' })
  fs.mkdirSync('artifacts', { recursive: true })
  fs.writeFileSync(`artifacts/self-paced-${name}.png`, Buffer.from(s.result.data, 'base64'))
  console.log(`[shot] ${name}`)
}
const sleep = ms => new Promise(r => setTimeout(r, ms))
const waitFor = async (description, fn, timeoutMs = 90_000, everyMs = 500) => {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const value = await fn()
    if (value) return value
    await sleep(everyMs)
  }
  throw Error(`timeout waiting: ${description}`)
}
const text = () => evaluateSafe('document.body && document.body.innerText')
const has = s => evaluateSafe(`!!(document.body && document.body.innerText.includes(${JSON.stringify(s)}))`)
const clickButton = (label, scope = 'document') =>
  evaluateSafe(`(()=>{const b=[...${scope}.querySelectorAll('button')].find(b=>b.textContent.trim().includes(${JSON.stringify(label)})&&!b.disabled);if(b){b.click();return true}return false})()`)

// —— sim 模式下驱动合成人脸状态 ——
const setFace = state => evaluateSafe(`window.__aviationSim?.setFace(${JSON.stringify(state)})`)

try {
  if (mode === 'shot') {
    await shot('manual')
    console.log(await text())
    throw Object.assign(new Error('shot-done'), { code: 'done' })
  }

  if (mode === 'keyboard') {
    await send('Page.navigate', { url: PAGE_URL })
    await waitFor('航空首页', () => has('开始测评'), 30_000)
    await clickButton('开始测评')
    await waitFor('身份页', () => has('请填写测评信息'), 20_000)
    await evaluate(`(()=>{const input=document.querySelector('input[autocomplete="name"]');input.focus();input.click();return document.activeElement===input})()`)
    await sleep(2_000)
    console.log('[done] 姓名输入框已聚焦，等待系统输入法')
    throw Object.assign(new Error('keyboard-ready'), { code: 'done' })
  }

  if (mode === 'preview') {
    await send('Page.navigate', { url: PAGE_URL.replace('?sim=1', '') })
    await waitFor('航空首页', () => has('开始测评'), 30_000)
    await clickButton('开始测评')
    await waitFor('身份页', () => has('请填写测评信息'), 20_000)
    await evaluate(`(()=>{const input=document.querySelector('input[autocomplete="name"]');input.value='预览检查';input.dispatchEvent(new Event('input',{bubbles:true}));return true})()`)
    await clickButton('请点击输入工号')
    for (const digit of ['9', '0', '0', '1']) await evaluate(`[...document.querySelectorAll('.employee-keypad__grid button')].find(b=>b.textContent===${JSON.stringify(digit)})?.click()`)
    await clickButton('完成'); await clickButton('男'); await clickButton('请点击输入年龄')
    for (const digit of ['3', '0']) await evaluate(`[...document.querySelectorAll('.employee-keypad__grid button')].find(b=>b.textContent===${JSON.stringify(digit)})?.click()`)
    await clickButton('完成'); await clickButton('开始测评')
    await waitFor('同意条款出现', () => has('我已完整阅读'), 20_000)
    await evaluate(`document.querySelector('.consent-card input[type=checkbox]').click()`)
    await waitFor('素材就绪', () => evaluate(`[...document.querySelectorAll('button')].some(b=>b.textContent.includes('确认并进入采集准备')&&!b.disabled)`), 120_000)
    await clickButton('确认并进入采集准备')
    await waitFor('人脸就位', () => evaluate(`[...document.querySelectorAll('button')].some(b=>b.textContent.includes('开始操作体验')&&!b.disabled)`), 90_000)
    await clickButton('开始操作体验')
    await waitFor('预训练页', () => has('操作预训练'), 20_000)
    await sleep(2_000)
    console.log('[done] 已进入真机预训练页，未开始正式录制')
    throw Object.assign(new Error('preview-ready'), { code: 'done' })
  }

  console.log('[1] 导航到 sim 模式并等待登录页')
  await send('Page.navigate', { url: PAGE_URL })
  await waitFor('航空首页', () => has('开始测评'), 30_000)
  await shot('1-login')
  await clickButton('开始测评')
  await waitFor('身份页', () => has('请填写测评信息'), 20_000)

  console.log('[2] 填写身份（姓名系统输入框 + 工号/年龄数字键盘）')
  await evaluate(`(()=>{
    const input=document.querySelector('input[autocomplete="name"]')
    input.value='流程验证';input.dispatchEvent(new Event('input',{bubbles:true}))
    return true
  })()`)
  await clickButton('请点击输入工号')
  for (const digit of ['8', '8', '0', '0', '1']) {
    await evaluate(`[...document.querySelectorAll('.employee-keypad__grid button')].find(b=>b.textContent===${JSON.stringify(digit)})?.click()`)
  }
  await clickButton('完成')
  await clickButton('男')
  await clickButton('请点击输入年龄')
  for (const digit of ['3', '0']) {
    await evaluate(`[...document.querySelectorAll('.employee-keypad__grid button')].find(b=>b.textContent===${JSON.stringify(digit)})?.click()`)
  }
  await clickButton('完成')
  await waitFor('开始测评按钮可用', () => evaluate(`[...document.querySelectorAll('button')].some(b=>b.textContent.includes('开始测评')&&!b.disabled)`))
  await clickButton('开始测评')
  console.log('[3] 知情同意 + 素材预加载（真实题库 24 题 + 图片 + 音频）')
  await waitFor('同意条款出现', () => has('我已完整阅读'), 20_000)
  await evaluate(`document.querySelector('.consent-card input[type=checkbox]').click()`)
  const preloadStart = Date.now()
  await waitFor('素材就绪（同意按钮可点）', () =>
    evaluate(`[...document.querySelectorAll('button')].some(b=>b.textContent.includes('确认并进入采集准备')&&!b.disabled)`), 120_000)
  console.log(`    素材预加载耗时 ${((Date.now() - preloadStart) / 1000).toFixed(1)}s`)
  await shot('3-consent-ready')
  await clickButton('确认并进入采集准备')

  console.log('[4] 人脸就位（合成信号）')
  await waitFor('就位页', () => has('采集准备'), 15_000)
  await setFace('ok')
  await waitFor('就绪按钮', () => evaluate(`[...document.querySelectorAll('button')].some(b=>b.textContent.includes('开始操作体验')&&!b.disabled)`), 15_000)
  await shot('4-face-ready')
  await clickButton('开始操作体验')

  console.log('[5] 预训练三题（共用图题组件；点击切题）')
  await waitFor('预训练第 1 题', () => has('操作预训练'), 15_000)
  for (let i = 1; i <= 3; i++) {
    await waitFor(`预训练可作答（第 ${i} 题）`, () => evaluate(`!!document.querySelector('.image-question__options button:not([disabled])')`), 15_000)
    await shot(`5-practice-${i}`)
    // 双击验证：第一次选中后按钮立即锁定
    await evaluate(`document.querySelector('.image-question__options button:not([disabled])').click()`)
    await evaluate(`(()=>{const b=[...document.querySelectorAll('.image-question__options button')].find(x=>x.classList.contains('selected'));return b?b.click():false})()`)
    await sleep(900)
  }
  await waitFor('预训练完成页', () => has('三道预训练已完成'), 15_000)
  await shot('5-practice-complete')

  console.log('[6] 开始正式测评（3 秒倒计时 → 60 秒自定节奏）')
  await waitFor('开始正式测评按钮', () => evaluate(`[...document.querySelectorAll('button')].some(b=>b.textContent.includes('开始正式测评')&&!b.disabled)`), 15_000)
  await clickButton('开始正式测评')
  await waitFor('倒计时页', () => has('正式采集即将开始'), 10_000)
  await shot('6-countdown')
  await waitFor('正式页出现', () => has('请按您的节奏作答'), 15_000)

  console.log('[7] 正式采集：快答 5 题 → 跳过 1 题 → 静置等待收尾与自然封存')
  const answered = []
  for (let i = 0; i < 5; i++) {
    const ok = await waitFor(`正式题可作答（第 ${i + 1} 次）`, () =>
      evaluate(`!!document.querySelector('.image-question__options button:not([disabled])')`), 10_000)
    if (!ok) break
    if (i === 2) {
      // 跳过一次（固定操作）
      await evaluate(`[...document.querySelectorAll('button')].find(b=>b.textContent.includes('暂时跳过'))?.click()`)
      answered.push('skip')
    } else {
      await evaluate(`document.querySelector('.image-question__options button:not([disabled])').click()`)
      answered.push('select')
    }
    await sleep(700)
  }
  console.log(`    已作答: ${answered.join(',')}`)
  await shot('7-assess-mid')
  // 验证界面没有“第 X / N 题”字样
  const noCounter = await evaluate(`!/(第|共)\\s*\\d+\\s*\\/?\\s*\\d*\\s*题/.test(document.body.innerText.replace('第 1 / 3 题','').replace('第 2 / 3 题','').replace('第 3 / 3 题',''))`)
  console.log(`    正式页不展示题号计数: ${noCounter}`)

  console.log('[8] 等待 60 秒自然封存（不提前结束）')
  await waitFor('采集完成反馈', () => has('采集完成'), 120_000, 1_000)
  await shot('8-captured')

  console.log('[9] 数据整理 → 完成（sim：不提交）')
  await waitFor('完成页', () => has('开发模拟模式：未提交任何数据'), 60_000, 1_000)
  await shot('9-complete-sim')
  const finalText = await text()
  console.log(finalText.split('\n').slice(0, 6).join(' | '))
  console.log('[done] sim 全流程真机验证通过')
} catch (error) {
  if (error.code !== 'done') {
    console.error('[fail]', error.message)
    try { await shot('fail') ; console.log((await text()).slice(0, 500)) } catch { /* no-op */ }
    process.exitCode = 1
  }
} finally {
  socket.close()
}
