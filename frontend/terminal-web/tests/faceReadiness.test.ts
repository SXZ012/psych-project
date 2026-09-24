/**
 * FaceReadiness 结构化就位测试：四态提示、稳定门槛、检测过期、恢复。
 * 运行：node --test --experimental-strip-types tests/faceReadiness.test.ts
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { FaceReadiness, FACE_THRESHOLDS } from '../src/aviation/FaceReadiness.ts'

function fakeClock() {
  let t = 0
  return { now: () => t, advance: (ms: number) => { t += ms } }
}

const CENTERED = { count: 1, xCenter: .5, yCenter: .5, width: .3, height: .4 }

function makeFace(clock: ReturnType<typeof fakeClock>) {
  const face = new FaceReadiness({ clock: clock.now, thresholds: FACE_THRESHOLDS })
  face.setCamera(true)
  return face
}

test('合格：单人 + 位置合格 + 持续稳定 ≥2s 才 ready', () => {
  const clock = fakeClock()
  const face = makeFace(clock)
  assert.equal(face.evaluate(CENTERED).ok, true)
  assert.equal(face.snapshot.ready, false, '首事件不点亮 ready')
  assert.equal(face.currentNotice.level, 'ok')
  clock.advance(1_999)
  face.evaluate(CENTERED)
  assert.equal(face.snapshot.ready, false, '差 1ms 也不行')
  clock.advance(1)
  face.evaluate(CENTERED)
  assert.equal(face.snapshot.ready, true)
})

test('接近边界预警：位置合格但靠边 → warn 且仍计为合格（不判 fail）', () => {
  const clock = fakeClock()
  const face = makeFace(clock)
  const edge = face.evaluate({ count: 1, xCenter: .26, yCenter: .5, width: .3, height: .4 })
  assert.equal(edge.ok, true, '预警不等于不合格')
  assert.notEqual(edge.issueKey, '', '有预警 key')
  assert.equal(face.currentNotice.level, 'warn')
})

test('确认不合格四类：太远/太近/偏移/多人/无人', () => {
  const clock = fakeClock()
  const face = makeFace(clock)
  for (const [event, key] of [
    [{ count: 1, xCenter: .5, yCenter: .5, width: .05, height: .08 }, 'tooFar'],
    [{ count: 1, xCenter: .5, yCenter: .5, width: .9, height: .95 }, 'tooNear'],
    [{ count: 1, xCenter: .05, yCenter: .5, width: .3, height: .4 }, 'offCenter'],
    [{ count: 2 }, 'multiFace'],
    [{ count: 0 }, 'noFace'],
  ] as const) {
    const result = face.evaluate(event)
    assert.equal(result.ok, false)
    assert.equal(result.issueKey, key)
    assert.equal(face.currentNotice.level, 'fail')
  }
})

test('检测/设备异常：error 事件 → error 级，不冒充就位', () => {
  const clock = fakeClock()
  const face = makeFace(clock)
  face.evaluate({ count: 0, error: '人脸检测异常' })
  assert.equal(face.currentNotice.level, 'error')
  assert.equal(face.currentNotice.messageKey, 'detectError')
  assert.equal(face.snapshot.ready, false)
})

test('检测信号过期：ready 后静默 >2s → fresh=false，ready 不得静默维持', () => {
  const clock = fakeClock()
  const face = makeFace(clock)
  face.evaluate(CENTERED)
  clock.advance(2_100)
  face.evaluate(CENTERED)   // ready 点亮
  assert.equal(face.snapshot.ready, true)
  clock.advance(2_501)      // 检测流停止
  face.tickStale()
  assert.equal(face.snapshot.detectionFresh, false, '过期')
  assert.equal(face.snapshot.ready, false, '过期后 ready 撤销')
  assert.equal(face.currentNotice.messageKey, 'signalLost')
})

test('检测流间歇但未过期：refresh 按墙钟推进稳定计时（不等下一事件）', () => {
  const clock = fakeClock()
  const face = makeFace(clock)
  face.evaluate(CENTERED)   // t=0 首个合格事件
  clock.advance(1_500)
  face.evaluate(CENTERED)   // t=1500 事件（间歇中）
  clock.advance(501)        // t=2001：距上次事件 501ms（未过期），但无新事件
  face.refresh()
  assert.equal(face.snapshot.stableMs >= 2_000, true)
  assert.equal(face.snapshot.ready, true, '稳定由墙钟判定点亮，不等下一检测事件')
})

test('不合格打断稳定：起算点重置，恢复后重新计满 2s', () => {
  const clock = fakeClock()
  const face = makeFace(clock)
  face.evaluate(CENTERED)
  clock.advance(1_500)
  face.evaluate({ count: 0 })          // 打断
  assert.equal(face.snapshot.stableMs, 0)
  clock.advance(500)
  face.evaluate(CENTERED)              // 恢复：重新起算
  assert.equal(face.snapshot.ready, false)
  clock.advance(2_000)
  face.evaluate(CENTERED)
  assert.equal(face.snapshot.ready, true)
})

test('摄像头未开启：检测合格也不能 ready（能力与检测分层）', () => {
  const clock = fakeClock()
  const face = new FaceReadiness({ clock: clock.now })
  face.evaluate(CENTERED)
  clock.advance(5_000)
  face.evaluate(CENTERED)
  assert.equal(face.snapshot.ready, false, 'cameraOn=false 时不可就位')
  assert.equal(face.currentNotice.level, 'error')
})

test('detected 与固定目标区是两个概念：检测位置可读取，目标区为展示常量', () => {
  const clock = fakeClock()
  const face = makeFace(clock)
  face.evaluate({ count: 1, xCenter: .42, yCenter: .48, width: .33, height: .44 })
  const detected = face.detected!
  assert.equal(detected.x, .42)
  assert.equal(detected.width, .33)
  // 目标区由 UI 组件的 face-oval 常量呈现（left25%/top10%/w50%/h72%），不随检测漂移
  assert.equal(FACE_THRESHOLDS.minX, .20)
})
