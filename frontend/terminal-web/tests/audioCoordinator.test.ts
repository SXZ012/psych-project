/**
 * AudioCoordinator 语音协调测试：优先级、防重叠、取消/结束/失败三态、
 * 恢复只限当前题、同次异常单次提醒、失效说明完整播放。
 * 运行：node --test --experimental-strip-types tests/audioCoordinator.test.ts
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { AudioCoordinator } from '../src/aviation/AudioCoordinator.ts'
import type { AudioPlayer, AudioPlaybackResult, QuestionInstance } from '../src/aviation/types.ts'

test.beforeEach(() => { FakePlayer.byUrl.clear() })

/** 假播放器：手动决定 ended/failed，stop 立即 cancelled */
class FakePlayer implements AudioPlayer {
  static byUrl = new Map<string, FakePlayer>()
  plays: number = 0
  pending: ((result: AudioPlaybackResult) => void) | null = null
  stopped = false
  readonly url: string
  constructor(url: string) { this.url = url }
  get durationMs() { return 3_000 }
  play(): Promise<AudioPlaybackResult> {
    this.plays++
    this.stopped = false
    return new Promise(resolve => { this.pending = resolve })
  }
  stop(): void { this.stopped = true; this.pending?.('cancelled'); this.pending = null }
  end() { this.pending?.('ended'); this.pending = null }
  fail() { this.pending?.('failed'); this.pending = null }
  static create(url: string) {
    const existing = FakePlayer.byUrl.get(url)
    if (existing) return existing
    const player = new FakePlayer(url)
    FakePlayer.byUrl.set(url, player)
    return player
  }
}

function makeCoordinator(current: (id: number) => boolean) {
  const errors: string[] = []
  const coordinator = new AudioCoordinator({
    factory: { create: async url => FakePlayer.create(url) },
    isQuestionCurrent: current,
    onPlaybackError: cue => errors.push(cue),
  })
  return { coordinator, errors }
}

function instance(id: number, url = '/audio/q.wav'): QuestionInstance {
  return {
    instanceId: id,
    role: 'regular',
    question: {
      id: `q${id}`, question: '题', options: [], image: '', imageAlt: '',
      audioUrl: url,
    },
  }
}

const GUIDE = '/static/assets/aviation/audio/paired-v1/'

test('一次只播一段：低优先级不抢占高优先级', async () => {
  const { coordinator } = makeCoordinator(() => true)
  await coordinator.preload([GUIDE + 'invalid.wav'])
  coordinator.playInvalidExplanation()
  const invalid = FakePlayer.byUrl.get(GUIDE + 'invalid.wav')!
  assert.equal(invalid.plays, 1)
  // 失效说明播放中：题目/提示/提醒均不抢占
  coordinator.playQuestion(instance(1))
  coordinator.playCue('complete')
  coordinator.playPositionReminder('deviation')
  assert.equal(invalid.plays, 1)
  assert.equal(invalid.stopped, false)
})

test('作答停止旧题语音；提醒结束后只恢复仍有效的当前题', async () => {
  let currentId = 1
  const { coordinator } = makeCoordinator(id => id === currentId)
  await coordinator.preload(['/audio/q1.wav', '/audio/q2.wav', GUIDE + 'deviation.wav'])
  coordinator.playQuestion(instance(1, '/audio/q1.wav'))
  const q1 = FakePlayer.byUrl.get('/audio/q1.wav')!
  assert.equal(q1.plays, 1)
  // 位置提醒打断题目 → 记录恢复目标
  coordinator.playPositionReminder('deviation')
  assert.equal(q1.stopped, true)
  const deviation = FakePlayer.byUrl.get(GUIDE + 'deviation.wav')!
  assert.equal(deviation.plays, 1)
  // 提醒结束前用户已切到第 2 题：提醒结束后恢复的必须是当前题，不是旧题
  currentId = 2
  deviation.end()
  await Promise.resolve()
  // q1 不被恢复（实例已失效）；随后正常播第 2 题
  assert.equal(q1.plays, 1, '旧题不被恢复')
  coordinator.playQuestion(instance(2, '/audio/q2.wav'))
  const q2 = FakePlayer.byUrl.get('/audio/q2.wav')!
  assert.equal(q2.plays, 1)
})

test('提醒打断题目且题目仍是当前题：提醒结束后自动恢复该题', async () => {
  const { coordinator } = makeCoordinator(() => true)
  await coordinator.preload(['/audio/q1.wav', GUIDE + 'far.wav'])
  coordinator.playQuestion(instance(1, '/audio/q1.wav'))
  const q1 = FakePlayer.byUrl.get('/audio/q1.wav')!
  coordinator.playPositionReminder('far')
  assert.equal(q1.stopped, true)
  FakePlayer.byUrl.get(GUIDE + 'far.wav')!.end()
  await Promise.resolve()
  assert.equal(q1.plays, 2, '当前题在提醒结束后恢复')
})

test('用户作答停止题目语音（stopQuestionAudio），提醒不受影响', async () => {
  const { coordinator } = makeCoordinator(() => true)
  await coordinator.preload(['/audio/q1.wav', GUIDE + 'deviation.wav'])
  coordinator.playQuestion(instance(1, '/audio/q1.wav'))
  const q1 = FakePlayer.byUrl.get('/audio/q1.wav')!
  coordinator.stopQuestionAudio()
  assert.equal(q1.stopped, true)
  coordinator.playPositionReminder('deviation')
  const deviation = FakePlayer.byUrl.get(GUIDE + 'deviation.wav')!
  coordinator.stopQuestionAudio()
  assert.equal(deviation.stopped, false, '停止题目语音不打断提醒')
})

test('同一次持续位置异常只提醒一次；恢复后再次异常才重新提醒', async () => {
  const { coordinator } = makeCoordinator(() => true)
  await coordinator.preload([GUIDE + 'deviation.wav'])
  coordinator.playPositionReminder('deviation')
  const deviation = FakePlayer.byUrl.get(GUIDE + 'deviation.wav')!
  assert.equal(deviation.plays, 1)
  deviation.end()
  await Promise.resolve()
  coordinator.playPositionReminder('deviation')   // 同一次异常内重试
  assert.equal(deviation.plays, 1, '不重复播报')
  coordinator.resetPositionReminder()             // 质量恢复
  coordinator.playPositionReminder('deviation')
  assert.equal(deviation.plays, 2, '恢复后再异常重新提醒')
})

test('失效说明为 critical：stopAll 不打断，dispose 才终止', async () => {
  const { coordinator } = makeCoordinator(() => true)
  await coordinator.preload([GUIDE + 'invalid.wav', '/audio/q1.wav'])
  coordinator.playQuestion(instance(1, '/audio/q1.wav'))
  coordinator.playInvalidExplanation()
  const invalid = FakePlayer.byUrl.get(GUIDE + 'invalid.wav')!
  coordinator.stopAll()
  assert.equal(invalid.stopped, false, '统一清理不打断失效说明')
  coordinator.dispose()
  assert.equal(invalid.stopped, true)
})

test('播放失败与取消分别落地：失败回调 onPlaybackError，取消无回调', async () => {
  const { coordinator, errors } = makeCoordinator(() => true)
  await coordinator.preload([GUIDE + 'start-tone.wav'])
  coordinator.playCue('start')
  const start = FakePlayer.byUrl.get(GUIDE + 'start-tone.wav')!
  start.fail()
  await Promise.resolve()
  assert.deepEqual(errors, ['start'])
  errors.length = 0
  coordinator.playCue('start')
  coordinator.stopAll()
  await Promise.resolve()
  assert.deepEqual(errors, [], '取消不报错误')
})

test('preload 失败抛错（素材层给出明确错误与重试入口）', async () => {
  const coordinator = new AudioCoordinator({
    factory: { create: async () => { throw new Error('load error') } },
    isQuestionCurrent: () => true,
  })
  await assert.rejects(
    () => coordinator.preload(['/missing.wav']),
    /audio_preload_failed/,
  )
})

test('缓存缺失的 cue 按播放失败处理，不悬挂', async () => {
  const { coordinator, errors } = makeCoordinator(() => true)
  coordinator.playCue('complete')   // 未预加载
  assert.deepEqual(errors, ['complete'])
})

test('start 提示可打断题目语音；complete 清除恢复目标', async () => {
  const { coordinator } = makeCoordinator(() => true)
  await coordinator.preload(['/audio/q1.wav', GUIDE + 'start-tone.wav', GUIDE + 'complete.wav'])
  coordinator.playQuestion(instance(1, '/audio/q1.wav'))
  const q1 = FakePlayer.byUrl.get('/audio/q1.wav')!
  coordinator.playCue('start')
  assert.equal(q1.stopped, true)
  FakePlayer.byUrl.get(GUIDE + 'start-tone.wav')!.end()
  await Promise.resolve()
  assert.equal(q1.plays, 1, 'start 结束后不自动恢复题目（倒计时阶段无题）')
})

test('航空短开始提示结束后接续正式首题，不要求用户等待或重播', async () => {
  const { coordinator } = makeCoordinator(() => true)
  await coordinator.preload([GUIDE + 'start-tone.wav', '/q1.wav'])
  coordinator.playCue('start')
  coordinator.playQuestion(instance(1, '/q1.wav'))
  assert.equal(FakePlayer.byUrl.get('/q1.wav')!.plays, 0)
  FakePlayer.byUrl.get(GUIDE + 'start-tone.wav')!.end()
  await Promise.resolve()
  assert.equal(FakePlayer.byUrl.get('/q1.wav')!.plays, 1)
})

test('航空收尾音频不能抢占偏离提示，回正后可再次请求收尾提示', async () => {
  const { coordinator } = makeCoordinator(() => true)
  await coordinator.preload([GUIDE + 'deviation.wav', GUIDE + 'finishing-v2.wav'])
  coordinator.playPositionReminder('deviation')
  assert.equal(coordinator.playCue('finishing'), false)
  assert.equal(FakePlayer.byUrl.get(GUIDE + 'deviation.wav')!.stopped, false)
  FakePlayer.byUrl.get(GUIDE + 'deviation.wav')!.end()
  await Promise.resolve()
  assert.equal(coordinator.playCue('finishing'), true)
})
