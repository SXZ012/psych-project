import test from 'node:test'
import assert from 'node:assert/strict'
import { CommunityVoice } from '../src/community/CommunityVoice.ts'
import type { useCommunityAudio } from '../src/composables/useCommunityAudio.ts'

const timers = new Map<number, () => void>()
let nextTimer = 1
const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window')
test.before(() => Object.defineProperty(globalThis, 'window', { configurable: true, value: {
  setTimeout: (fn: () => void) => { const id = nextTimer++; timers.set(id, fn); return id },
  clearTimeout: (id: number) => timers.delete(id),
} }))
test.after(() => { if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow); else Reflect.deleteProperty(globalThis, 'window') })
test.beforeEach(() => timers.clear())

function fixture() {
  const played: string[] = []
  const spoken: string[] = []
  let current: ((result: 'ended' | 'failed' | 'cancelled') => void) | null = null
  const audio = {
    playQuestion: async (q: { id: string }) => { played.push(q.id); return 'played' as const },
    playPrompt: (url: string) => { played.push(url.split('/').pop()!); return new Promise<'ended' | 'failed' | 'cancelled'>(r => { current = r }) },
    stop: () => { const resolve = current; current = null; resolve?.('cancelled') },
  } as ReturnType<typeof useCommunityAudio>
  const voice = new CommunityVoice({ audio, speak: text => spoken.push(text), stopSpeech: () => {} })
  const finish = (result: 'ended' | 'failed' = 'ended') => { const resolve = current; current = null; resolve?.(result) }
  const question = (id: string, valid = () => true) => voice.playQuestion(id, { id, question: id, image: '', options: [], audioUrl: '/q.wav' }, valid)
  return { voice, played, spoken, finish, question }
}

test('正式开始提示播放完毕后再朗读第一题，首题不会被提示音吞掉', async () => {
  const f = fixture()
  f.voice.playCue('start'); f.question('q1')
  assert.deepEqual(f.played, ['start-tone.wav'])
  f.finish(); await Promise.resolve()
  assert.deepEqual(f.played, ['start-tone.wav', 'q1'])
})

test('偏离提醒优先于收尾提示、切题和点击；提醒后仅恢复当前题', async () => {
  const f = fixture()
  let id = 'q1'
  f.question('q1', () => id === 'q1')
  f.voice.playCue('deviation')
  assert.equal(f.voice.playCue('finishing'), false)
  f.voice.stopQuestion()
  id = 'q2'; f.question('q2', () => id === 'q2')
  assert.deepEqual(f.played, ['q1', 'deviation.wav'])
  f.finish(); await Promise.resolve()
  assert.deepEqual(f.played, ['q1', 'deviation.wav', 'q2'])
})

test('同一次偏离只播一次；回正停止提醒，再次偏离可以播报', () => {
  const f = fixture()
  assert.equal(f.voice.playCue('far'), true)
  assert.equal(f.voice.playCue('far'), false)
  f.voice.resetPositionReminder()
  assert.equal(f.voice.playCue('far'), true)
  assert.deepEqual(f.played, ['far.wav', 'far.wav'])
})

test('切页或跳过后迟到的播放结束不能恢复旧题', async () => {
  const f = fixture()
  f.voice.playCue('start'); f.question('q1')
  f.voice.stopAll(); f.finish(); await Promise.resolve()
  assert.deepEqual(f.played, ['start-tone.wav'])
})

test('失效说明抢占偏离提醒，低优先级题目与提示不能打断', () => {
  const f = fixture()
  f.voice.playCue('deviation'); f.voice.playCue('invalid')
  f.question('q1')
  assert.equal(f.voice.playCue('finishing'), false)
  assert.equal(f.voice.playCue('complete'), false)
  assert.deepEqual(f.played, ['deviation.wav', 'invalid.wav'])
})

test('失败后的语音兜底计时受退出取消，不能跨阶段恢复题目', async () => {
  const f = fixture()
  f.voice.playCue('start'); f.question('q1'); f.finish('failed')
  await Promise.resolve()
  assert.equal(f.spoken.length, 1)
  f.voice.stopAll()
  assert.equal(timers.size, 0)
  assert.deepEqual(f.played, ['start-tone.wav'])
})
