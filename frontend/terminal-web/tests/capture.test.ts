/**
 * 采集控制高风险状态/计时测试（strict-continuous-v2：全程在框、零中断）。
 * 运行：node --test --experimental-strip-types tests/capture.test.ts
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { CaptureController, type CaptureSummary } from '../src/capture/CaptureController.ts'

function fakeClock() {
  let t = 0
  return { now: () => t, advance: (ms: number) => { t += ms } }
}

const REQUIRED = 60_000
const DEBOUNCE = 300

interface Handle {
  c: CaptureController
  readonly sealed: CaptureSummary | null
  readonly invalid: { reason: string; summary: CaptureSummary } | null
}

function makeController(clock: ReturnType<typeof fakeClock>): Handle {
  let sealed: CaptureSummary | null = null
  let invalid: { reason: string; summary: CaptureSummary } | null = null
  const c = new CaptureController({
    requiredMs: REQUIRED, detectionDebounceMs: DEBOUNCE, protocolVersion: 'test', clock: clock.now,
    onSealed: s => { sealed = s },
    onInvalid: (reason, summary) => { invalid = { reason, summary } },
  })
  return { c, get sealed() { return sealed }, get invalid() { return invalid } }
}

// ═══════════════ 基础计时 ═══════════════

test('时长按单调时钟差计算，定时器延迟/丢帧不扭曲时长', () => {
  const clock = fakeClock()
  const h = makeController(clock)
  h.c.start()
  clock.advance(20_000); h.c.tick()
  assert.equal(h.c.elapsedMs, 20_000)
  clock.advance(39_999); h.c.tick()
  assert.equal(h.c.state, 'recording')
  clock.advance(1); h.c.tick()
  assert.equal(h.c.state, 'sealed')
})

test('到达目标时长只封存一次；封存后的 tick/上报均为 no-op', () => {
  const clock = fakeClock()
  const h = makeController(clock)
  h.c.start()
  clock.advance(60_500)
  h.c.tick(); h.c.tick()
  h.c.reportQuality(false, 'x')
  assert.ok(h.sealed !== null && h.sealed.elapsedMs >= 60_000)
  assert.equal(h.c.state, 'sealed')
})

test('未 start 时 tick 不触发任何完成信号', () => {
  const clock = fakeClock()
  const h = makeController(clock)
  clock.advance(120_000); h.c.tick()
  assert.equal(h.sealed, null)
  assert.equal(h.c.state, 'idle')
})

test('严格成功条件必须可证明连续有效：封存时 effectiveContinuousMs ≥ 60000 且无确认出框', () => {
  const clock = fakeClock()
  const h = makeController(clock)
  h.c.start(); clock.advance(60_100); h.c.tick()
  const s = h.sealed
  assert.ok(s !== null)
  assert.equal(h.c.state, 'sealed')
  assert.equal(s!.confirmedAbsenceCount, 0)
  assert.equal(s!.intervals.length, 0)
  assert.ok(s!.effectiveContinuousMs >= 60_000)
  assert.equal(s!.effectiveContinuousMs, s!.elapsedMs)
})

// ═══════════════ 零中断规则（任务要求的新测试） ═══════════════

test('第58秒开始出框持续到60秒：不得成功封存（按确认出框判无效）', () => {
  const clock = fakeClock()
  const h = makeController(clock)
  h.c.start()
  clock.advance(58_000)
  h.c.reportQuality(false, '未检测到面部')     // 58s 出框开始
  clock.advance(2_100)                        // 持续到 60.1s（> 防抖 300ms）
  h.c.tick()                                  // 60s 判定点：确认出框
  assert.equal(h.sealed, null, '不得封存成功')
  assert.equal(h.c.state, 'invalid')
  assert.ok(h.invalid!.reason.includes('人脸离开有效框'))
})

test('短暂出框后恢复：严格零中断模式不得成功（超过防抖窗口即确认出框，恢复不救回）', () => {
  const clock = fakeClock()
  const h = makeController(clock)
  h.c.start()
  clock.advance(10_000)
  h.c.reportQuality(false, '距离稍远')
  clock.advance(400)                          // 400ms > 300ms → 确认出框
  h.c.tick()
  assert.equal(h.c.state, 'invalid', '确认出框即无效')
  assert.equal(h.sealed, null)
  h.c.reportQuality(true)                     // 恢复也不救回
  assert.equal(h.c.state, 'invalid')
  assert.ok(h.invalid!.summary.confirmedAbsenceCount >= 1)
})

test('未确认抖动（< 防抖窗口且恢复）：不判无效，计入审计但可继续并封存', () => {
  const clock = fakeClock()
  const h = makeController(clock)
  h.c.start()
  clock.advance(10_000)
  h.c.reportQuality(false, '检测抖动')
  clock.advance(200)                          // 200ms < 300ms 防抖
  h.c.reportQuality(true)
  clock.advance(49_900)
  h.c.tick()
  assert.equal(h.c.state, 'sealed')
  const s = h.sealed!
  assert.equal(s.unconfirmedDebounceCount, 1)
  assert.equal(s.confirmedAbsenceCount, 0)
  assert.ok(s.effectiveContinuousMs >= 60_000, '噪声豁免下仍可证明连续有效')
  assert.ok(s.interruptedMs >= 200, '抖动时长如实记入审计（不冒充有效）')
})

test('58s 出框但 200ms 内恢复（未确认）：60s 挂起等待，恢复时点封存，成功可证明', () => {
  const clock = fakeClock()
  const h = makeController(clock)
  h.c.start()
  clock.advance(59_950)
  h.c.reportQuality(false, '瞬时抖动')
  clock.advance(100); h.c.tick()              // 60.05s：有未结束异常 → 挂起，不封存
  assert.equal(h.sealed, null)
  assert.equal(h.c.state, 'recording')
  clock.advance(100)                          // 抖动共 200ms < 300ms
  h.c.reportQuality(true)                     // 恢复 → 挂起的封存此刻执行
  assert.equal(h.c.state, 'sealed')
  assert.equal(h.invalid, null)
  assert.ok(h.sealed!.effectiveContinuousMs >= 60_000)
})

test('检测信号过期 / 页面后台 / 摄像头异常：按出框处理，持续超过防抖即无效，不得计为有效', () => {
  for (const reason of ['检测信号中断', '页面切到后台', '摄像头异常']) {
    const clock = fakeClock()
    const h = makeController(clock)
    h.c.start()
    clock.advance(30_000)
    h.c.reportQuality(false, reason)
    clock.advance(350); h.c.tick()
    assert.equal(h.c.state, 'invalid', `${reason} 须判无效`)
    assert.equal(h.sealed, null)
  }
})

test('页面后台瞬切（< 防抖）后返回：视为噪声不判无效，但该区间计入审计', () => {
  const clock = fakeClock()
  const h = makeController(clock)
  h.c.start()
  clock.advance(20_000)
  h.c.reportQuality(false, '页面切到后台')
  clock.advance(150)
  h.c.reportQuality(true)
  assert.equal(h.c.state, 'recording')
  assert.equal(h.invalid, null)
})

// ═══════════════ 原因变化不重置连续异常起点（任务 #2） ═══════════════

test('交替异常原因不重置连续异常起点：连续不合格总时长跨原因累计', () => {
  const clock = fakeClock()
  const h = makeController(clock)
  h.c.start()
  clock.advance(10_000)
  h.c.reportQuality(false, '距离稍远')
  clock.advance(250)                          // 250ms（尚 < 300ms，未确认）
  h.c.reportQuality(false, '请将面部移到框中央')  // 原因变化：起点不能重置
  clock.advance(100)                          // 连续不合格总时长 350ms ≥ 300ms
  h.c.tick()
  assert.equal(h.c.state, 'invalid', '基于连续总时长判无效（而非每原因重新计时）')
  const s = h.invalid!.summary
  assert.equal(s.intervals.length, 1, '同一连续区间')
  assert.equal(s.intervals[0].reasons.length, 2, '两个原因子事件')
  assert.ok(s.interruptedMs >= 350)
})

test('连续不合格跨多个原因：区间起点保持首次不合格时刻', () => {
  const clock = fakeClock()
  const h = makeController(clock)
  h.c.start()
  clock.advance(5_000)
  h.c.reportQuality(false, '距离稍远')
  clock.advance(100)
  h.c.reportQuality(false, '画面中出现多人')
  clock.advance(100)
  h.c.reportQuality(false, '未检测到面部')
  clock.advance(150); h.c.tick()              // 连续 350ms
  assert.equal(h.c.state, 'invalid')
  const interval = h.invalid!.summary.intervals[0]
  assert.equal(interval.reasons.length, 3)
  assert.equal(interval.startMs, 5_000, '起点=首次不合格时刻')
  assert.ok(h.invalid!.reason.includes('距离稍远 → 未检测到面部'), '失效原因串联首末')
})

// ═══════════════ abort / 既有保护 ═══════════════

test('abort 后不再触发完成/失效回调（放弃路径）', () => {
  const clock = fakeClock()
  const h = makeController(clock)
  h.c.start()
  clock.advance(30_000)
  h.c.abort()
  clock.advance(60_000)
  h.c.tick(); h.c.reportQuality(false, 'x')
  assert.equal(h.sealed, null)
  assert.equal(h.invalid, null)
})

