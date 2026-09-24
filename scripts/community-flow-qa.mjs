/**
 * 社区流程走查（Windows Chrome headless + CDP）。
 *
 * 覆盖摄像头之前的全部阶段（欢迎 → 合并说明 → 体验确认(mock 自动支付)
 * → 知情同意(素材 20 题预加载门禁) → 开场(跳过) → 就位检查），
 * 并验证测试场景切换按钮在首页可见、进入流程后隐藏。
 * 摄像头及之后的阶段（预训练/倒计时/采集/提交）需真机 + 真人，不在本脚本范围。
 *
 * 用法（Windows 侧）: node scripts/community-flow-qa.mjs
 * 产物: artifacts/community-*.png
 */
import { spawn } from 'node:child_process'
import fs from 'node:fs'

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const CDP_BASE = 'http://127.0.0.1:9333'
// 时间戳参数击穿 index.html 缓存（assets 自带内容 hash，必然取新）
const PAGE_URL = `http://127.0.0.1:8000/login/?device_id=community-terminal-rk3568-01&_qa=${Date.now()}`
const USER_DIR = `${process.env.TEMP || '.'}\\psych-qa-profile-${Date.now()}`

const sleep = ms => new Promise(r => setTimeout(r, ms))
const results = []
const ok = (name, pass, extra = '') => {
  results.push({ name, pass })
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${extra ? `  (${extra})` : ''}`)
}

// —— 启动 headless Chrome（假摄像头设备，避免权限弹窗） ——
const chrome = spawn(CHROME, [
  '--headless=new', '--remote-debugging-port=9333',
  '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream',
  '--no-first-run', `--user-data-dir=${USER_DIR}`,
  '--window-size=962,602', 'about:blank',
], { stdio: 'ignore' })
process.on('exit', () => { try { chrome.kill() } catch { /* */ } })

const fetchJson = async url => (await fetch(url)).json()
// 等 CDP 就绪
let pages = []
for (let i = 0; i < 40; i++) {
  try { pages = await fetchJson(`${CDP_BASE}/json`); if (pages.length) break } catch { /* retry */ }
  await sleep(300)
}
const page = pages.find(p => p.type === 'page')
if (!page) throw Error('CDP page not found')
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
const evaluateSafe = async expression => { try { return await evaluate(expression) } catch { return undefined } }
const shot = async name => {
  const s = await send('Page.captureScreenshot', { format: 'png' })
  fs.mkdirSync('artifacts', { recursive: true })
  fs.writeFileSync(`artifacts/community-${name}.png`, Buffer.from(s.result.data, 'base64'))
  console.log(`[shot] ${name}`)
}
const has = s => evaluateSafe(`!!(document.body && document.body.innerText.includes(${JSON.stringify(s)}))`)
const clickButton = (label, scope = 'document') =>
  evaluateSafe(`(()=>{const b=[...${scope}.querySelectorAll('button')].find(b=>b.textContent.trim().includes(${JSON.stringify(label)})&&!b.disabled);if(b){b.click();return true}return false})()`)
const waitFor = async (description, fn, timeoutMs = 60_000, everyMs = 400) => {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const value = await fn()
    if (value) return value
    await sleep(everyMs)
  }
  throw Error(`timeout waiting: ${description}`)
}

try {
  await send('Page.enable')
  // 强制终端基准视口 962×602（headless 的 --window-size 不可靠，实测常落在默认 800×600）
  await send('Emulation.setDeviceMetricsOverride', { width: 962, height: 602, deviceScaleFactor: 1, mobile: false })
  await send('Page.navigate', { url: PAGE_URL })
  const viewport = await waitFor('视口就绪', () => evaluateSafe('JSON.stringify([innerWidth,innerHeight])'), 20_000)
  console.log(`[viewport] ${viewport}`)
  if (viewport !== '[962,602]') throw Error(`viewport wrong: ${viewport}`)
  await waitFor('欢迎页', () => has('开始体验'), 30_000)
  await shot('01-welcome')
  ok('欢迎页加载', true)
  ok('欢迎页时长文案(约 4 分钟)', await has('全程约 4 分钟'))
  ok('测试场景切换按钮在首页可见(需求一)', await has('测试场景'))

  // —— 合并说明页 ——
  await clickButton('开始体验')
  await waitFor('合并说明页', () => has('了解这次体验') || has('花一分钟'), 15_000)
  await shot('02-brief')
  ok('合并说明页出现(无独立隐私页)', await has('摄像头用来做什么'))
  ok('统一隐私口径(需求六)', await has('终端退出后会自动清除本地显示'))
  ok('说明页含非医疗诊断边界', await has('不是医学诊断'))
  const switcherHidden = await evaluateSafe(`![...document.querySelectorAll('aside')].some(a=>a.textContent.includes('测试场景'))`)
  ok('进入流程后切换按钮隐藏', switcherHidden === true)
  await clickButton('知道了，继续')

  // —— 体验确认（mock 自动支付） ——
  await waitFor('体验确认页', () => has('确认开始本次体验'), 15_000)
  await shot('03-payment')
  ok('确认页题量文案(不再写 6 道小题)', await has('正式小测约 1 分钟'))
  await clickButton('确认开始')
  await waitFor('知情同意页', () => has('知情同意书'), 45_000)
  await shot('04-consent')
  ok('mock 支付自动走通 → 知情同意页', true)
  ok('同意书无"合作方"字样(需求六)', !(await has('合作方')))
  ok('同意书无"算法"字样(需求六)', !(await has('算法')))
  ok('同意书无"仅您本人可见"绝对表述', !(await has('仅您本人可见')))
  ok('同意书为扫码查看口径', await has('手机扫码查看'))

  // 勾选同意；等素材就绪（20 张图预加载）后按钮点亮
  await evaluateSafe(`(()=>{const i=document.querySelector('.consent-card input[type=checkbox]');if(i){i.click();return true}return false})()`)
  await waitFor('素材就绪(确认按钮点亮)', () =>
    evaluateSafe(`(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent.includes('确认进入测评'));return b&&!b.disabled})()`), 60_000)
  ok('素材预加载门禁通过(20 题)', true)
  await clickButton('确认进入测评')

  // —— 开场短片（可跳过） ——
  await waitFor('开场页', () => has('跳过'), 20_000)
  await shot('05-opening')
  ok('开场短片有跳过按钮(需求四)', true)
  await clickButton('跳过')

  // —— 就位检查 ——
  await waitFor('就位检查页', () => has('正在确认你的位置') || has('采集准备'), 30_000)
  await sleep(2500) // 等摄像头状态文案稳定
  await shot('06-face-ready')
  ok('跳过后直达就位检查页', true)
  const camMsg = await evaluateSafe(`document.body.innerText`)
  ok('就位页含安抚性提示', /摄像头|面部/.test(camMsg || ''))
  console.log('\n—— 走查完成（摄像头前阶段全部通过）——')
} catch (error) {
  console.error('QA ERROR:', error.message)
  await shot('99-error')
  ok('流程走查', false, error.message)
} finally {
  const failed = results.filter(r => !r.pass)
  console.log(`\n结果: ${results.length - failed.length}/${results.length} 通过`)
  try { chrome.kill() } catch { /* */ }
  process.exit(failed.length ? 1 : 0)
}
