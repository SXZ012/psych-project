import test from 'node:test'
import assert from 'node:assert/strict'
import { useCommunityAudio } from '../src/composables/useCommunityAudio.ts'

const timers = new Map<number, () => void>()
let nextTimer = 1
class FakeAudio extends EventTarget {
  static instances: FakeAudio[] = []
  preload = ''
  readyState = 0
  currentTime = 0
  paused = true
  started!: () => void
  rejected!: () => void
  url: string
  constructor(url: string) { super(); this.url = url; FakeAudio.instances.push(this) }
  load() {}
  removeAttribute(name: string) { if (name === 'src') this.url = '' }
  pause() { this.paused = true }
  play() { this.paused = false; return new Promise<void>((resolve, reject) => { this.started = resolve; this.rejected = () => reject(new Error('play failed')) }) }
}
const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window')
const originalAudio = Object.getOwnPropertyDescriptor(globalThis, 'Audio')
test.before(() => {
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { setTimeout: (fn: () => void) => { const id = nextTimer++; timers.set(id, fn); return id }, clearTimeout: (id: number) => timers.delete(id) } })
  Object.defineProperty(globalThis, 'Audio', { configurable: true, value: FakeAudio })
})
test.after(() => {
  if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow); else Reflect.deleteProperty(globalThis, 'window')
  if (originalAudio) Object.defineProperty(globalThis, 'Audio', originalAudio); else Reflect.deleteProperty(globalThis, 'Audio')
})
test.beforeEach(() => { timers.clear(); FakeAudio.instances = [] })
const question = (audioUrl: string) => ({ id: audioUrl, question: '题目', image: '', imageAlt: '', options: [], audioUrl })

test('答题取消未开始的语音：不会返回失败触发旧题 TTS', async () => {
  const audio = useCommunityAudio()
  const result = audio.playQuestion(question('/q1.mp3'))
  const first = FakeAudio.instances[0]!
  audio.stop()
  assert.equal(await result, 'cancelled')
  first.rejected()
  await Promise.resolve()
  assert.equal(first.paused, true)
  assert.equal(timers.size, 0)
})

test('切下一题：旧播放取消；旧 Promise 结束不能打断新题', async () => {
  const audio = useCommunityAudio()
  const old = audio.playQuestion(question('/q1.mp3'))
  const current = audio.playQuestion(question('/q2.mp3'))
  assert.equal(await old, 'cancelled')
  FakeAudio.instances[0]!.rejected()
  FakeAudio.instances[1]!.started()
  assert.equal(await current, 'played')
  assert.equal(FakeAudio.instances[1]!.paused, false)
  audio.stop()
  assert.equal(FakeAudio.instances[1]!.paused, true)
})

test('播放超时暂停音频，允许当前题安全降级', async () => {
  const audio = useCommunityAudio()
  const result = audio.playQuestion(question('/slow.mp3'))
  for (const fn of [...timers.values()]) fn()
  assert.equal(await result, 'failed')
  assert.equal(FakeAudio.instances[0]!.paused, true)
})

test('预加载超时不能虚报已缓存，后续重复预加载也不能虚报', async () => {
  const audio = useCommunityAudio()
  const loading = audio.preload([question('/slow.mp3')])
  for (const fn of [...timers.values()]) fn()
  await loading
  assert.equal(audio.isReady('/slow.mp3'), false)
  await audio.preload([question('/slow.mp3')])
  assert.equal(audio.isReady('/slow.mp3'), false)
})

test('本地音频就绪后才标记预加载完成', async () => {
  const audio = useCommunityAudio()
  const loading = audio.preload([question('/ready.mp3')])
  FakeAudio.instances[0]!.dispatchEvent(new Event('loadeddata'))
  await loading
  assert.equal(audio.isReady('/ready.mp3'), true)
  assert.equal(timers.size, 0)
})

test('退出清理立即结束预加载，迟到事件不能恢复缓存', async () => {
  const audio = useCommunityAudio()
  const loading = audio.preload([question('/pending.mp3')])
  const old = FakeAudio.instances[0]!
  audio.clear()
  await loading
  old.dispatchEvent(new Event('loadeddata'))
  assert.equal(audio.isReady('/pending.mp3'), false)
  assert.equal(old.url, '')
  assert.equal(timers.size, 0)
  const next = audio.preload([question('/pending.mp3')])
  assert.equal(FakeAudio.instances.length, 2)
  audio.clear()
  await next
})

test('阶段提示要等待 ended，play 成功不会提前接续题目', async () => {
  const audio = useCommunityAudio()
  let settled = false
  const result = audio.playPrompt('/start.wav').then(value => { settled = true; return value })
  FakeAudio.instances[0]!.started()
  await Promise.resolve()
  assert.equal(settled, false)
  FakeAudio.instances[0]!.dispatchEvent(new Event('ended'))
  assert.equal(await result, 'ended')
  assert.equal(timers.size, 0)
})

test('退出立即取消播放中的提示，迟到 ended 无效', async () => {
  const audio = useCommunityAudio()
  const result = audio.playPrompt('/deviation.wav')
  const playing = FakeAudio.instances[0]!
  audio.stop()
  playing.dispatchEvent(new Event('ended'))
  assert.equal(await result, 'cancelled')
  assert.equal(playing.paused, true)
  assert.equal(timers.size, 0)
})
