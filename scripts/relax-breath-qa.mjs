/**
 * 平稳呼吸沉浸式改版走查（Windows Chrome headless + CDP）。
 * 验收点：全屏无边界（顶栏/底栏透明融入背景）、球上无字、
 * 点开始前球只轻微浮动、开始后吸气胀/呼气收、提示文案引导。
 * 用法: node scripts/relax-breath-qa.mjs
 * 产物: artifacts/relax-breath-*.png + 控制台 PASS/FAIL
 */
import { spawn } from 'node:child_process'
import fs from 'node:fs'

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const CDP_BASE = 'http://127.0.0.1:9413'
const PAGE_URL = `http://127.0.0.1:8000/login/?device_id=community-terminal-rk3568-01&_qa=${Date.now()}`
const USER_DIR = `${process.env.TEMP || '.'}\\psych-qa-profile-${Date.now()}`

const sleep = ms => new Promise(r => setTimeout(r, ms))
const results = []
const ok = (name, pass, extra = '') => {
  results.push({ name, pass })
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${extra ? `  (${extra})` : ''}`)
}

const chrome = spawn(CHROME, [
  '--headless=new', '--remote-debugging-port=9413', '--no-first-run',
  `--user-data-dir=${USER_DIR}`, '--window-size=962,602', 'about:blank',
], { stdio: 'ignore' })
process.on('exit', () => { try { chrome.kill() } catch { /* */ } })

const fetchJson = async url => (await fetch(url)).json()
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
  fs.writeFileSync(`artifacts/relax-breath-${name}.png`, Buffer.from(s.result.data, 'base64'))
  console.log(`[shot] ${name}`)
}
const waitFor = async (description, fn, timeoutMs = 60_000, everyMs = 400) => {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const value = await fn()
    if (value) return value
    await sleep(everyMs)
  }
  throw Error(`timeout waiting: ${description}`)
}
const scaleOf = `(()=>{const m=getComputedStyle(document.querySelector('.breath-bubble')).transform.match(/matrix\\(([^)]+)\\)/);return m?parseFloat(m[1]):1})()`

try {
  await send('Page.enable')
  await send('Emulation.setDeviceMetricsOverride', { width: 962, height: 602, deviceScaleFactor: 1, mobile: false })
  await send('Page.navigate', { url: PAGE_URL })
  await waitFor('进入社区欢迎页', () => evaluateSafe(`!!(document.body && document.body.innerText.includes('日常心理工具'))`))

  // 打开 情绪放松 → 平稳呼吸（index 0）
  await evaluateSafe(`[...document.querySelectorAll('button')].find(b=>b.textContent.includes('情绪放松'))?.click()`)
  await waitFor('出现放松练习入口', () => evaluateSafe(`!!document.querySelector('.relax-hero')`))
  await evaluateSafe(`document.querySelector('.relax-hero')?.click()`)
  await waitFor('平稳呼吸练习打开', () => evaluateSafe(`!!document.querySelector('.breath-exercise')`))

  // —— 沉浸式布局验收 ——
  const idle = await evaluate(`(()=>{
    const dlg=document.querySelector('.dialog'), ex=document.querySelector('.breath-exercise'),
          head=document.querySelector('.relax-head'), ctrl=document.querySelector('.relax-controls'),
          orb=document.querySelector('.breath-bubble'), stage=document.querySelector('.breath-stage');
    const r=dlg.getBoundingClientRect();
    return {
      breathMode: dlg.classList.contains('dialog--breath'),
      dlgFull: Math.abs(r.width-innerWidth)<2 && Math.abs(r.height-innerHeight)<2,
      sceneFull: (()=>{const e=ex.getBoundingClientRect();return Math.abs(e.width-r.width)<2&&Math.abs(e.height-r.height)<2})(),
      headBg: getComputedStyle(head).backgroundColor,
      ctrlBg: getComputedStyle(ctrl).backgroundColor,
      headTop: Math.abs(head.getBoundingClientRect().top - r.top) < 2,
      ballText: orb.innerText.trim(),
      ballBg: getComputedStyle(orb).backgroundImage.includes('radial-gradient'),
      stagePx: [Math.round(stage.getBoundingClientRect().width), Math.round(stage.getBoundingClientRect().height)],
      hint: document.querySelector('.breath-hint')?.innerText ?? '',
      primaryBtn: document.querySelector('.relax-primary')?.innerText ?? '',
    }})()`)
  await shot('1-idle')
  ok('进入沉浸式呼吸模式（dialog--breath）', idle.breathMode)
  ok('弹窗铺满整个屏幕', idle.dlgFull)
  ok('呼吸场景铺满整个弹窗（无三段分区）', idle.sceneFull)
  ok('顶栏底栏背景透明（无白色边界）', idle.headBg.startsWith('rgba(0, 0, 0, 0)') && idle.ctrlBg.startsWith('rgba(0, 0, 0, 0)'), `head=${idle.headBg} ctrl=${idle.ctrlBg}`)
  ok('顶栏悬浮于场景顶部', idle.headTop)
  ok('球面上没有任何文字', idle.ballText === '', `球内容="${idle.ballText}"`)
  ok('球为多层渐变', idle.ballBg)
  ok('开始前不显示呼吸节奏（仅轻微浮动）', idle.hint.includes('开始练习') && idle.primaryBtn === '开始练习', `hint="${idle.hint}"`)

  // —— 开始练习：吸气态 ——
  await evaluateSafe(`document.querySelector('.relax-primary')?.click()`)
  await sleep(2600)
  const inhale = await evaluate(`(()=>{
    const ex=document.querySelector('.breath-exercise'), b=document.querySelector('.breath-bubble');
    const m = getComputedStyle(b).transform.match(/matrix\\(([^)]+)\\)/);
    return { cls: ex.className, scale: m ? parseFloat(m[1]) : 1,
      hintGone: !document.querySelector('.breath-hint') }})()`)
  await shot('2-inhale')
  ok('练习中进入吸气态、球在放大', inhale.cls.includes('is-in') && inhale.scale > 1.02, `scale≈${inhale.scale}`)
  ok('练习中提示文案隐去（纯视觉引导）', inhale.hintGone)

  // —— 呼气态 ——
  await waitFor('进入呼气态', () => evaluateSafe(`document.querySelector('.breath-exercise')?.classList.contains('is-out')`), 15_000, 250)
  await waitFor('气泡收拢到 1.0 以下', () => evaluateSafe(`(()=>{const m=getComputedStyle(document.querySelector('.breath-bubble')).transform.match(/matrix\\(([^)]+)\\)/);return m?parseFloat(m[1])<0.99:false})()`), 10_000, 300)
  const exhale = await evaluate(`(()=>{
    const b=document.querySelector('.breath-bubble');
    const m = getComputedStyle(b).transform.match(/matrix\\(([^)]+)\\)/);
    return { scale: m ? parseFloat(m[1]) : 1,
      ballText: b.innerText.trim(),
      pauseBtn: document.querySelector('.relax-primary')?.innerText ?? '' }})()`)
  await shot('3-exhale')
  ok('进入呼气态、球在收拢', exhale.scale < 0.99, `scale≈${exhale.scale}`)
  ok('呼气时球面依然无字', exhale.ballText === '')

  console.log(`\n—— 共 ${results.length} 项，通过 ${results.filter(r => r.pass).length} ——`)
} catch (e) {
  console.error('QA 出错:', e.message)
  await shot('99-error').catch(() => {})
  process.exitCode = 1
}
