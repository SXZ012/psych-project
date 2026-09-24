/**
 * FlowController 状态机测试：合法链路走通、非法转换拒绝、并发重放挡下。
 * 运行：node --test --experimental-strip-types tests/flowController.test.ts
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { FlowController } from '../src/aviation/FlowController.ts'

function run(form: () => void) {
  const transitions: Array<[string, string]> = []
  const flow = new FlowController({
    onPhaseChange: (next, prev) => transitions.push([prev, next]),
  })
  form()
  return { flow, transitions }
}

test('主链：login→…→complete 全部按序通过', () => {
  const flow = new FlowController()
  for (const [event, expect] of [
    [{ type: 'IDENTITY_SUBMITTED' }, 'consent'],
    [{ type: 'CONSENT_CONFIRMED' }, 'detect'],
    [{ type: 'BEGIN_PRACTICE' }, 'practice'],
    [{ type: 'START_COUNTDOWN' }, 'countdown'],
    [{ type: 'COUNTDOWN_FINISHED' }, 'assess'],
    [{ type: 'CAPTURE_SEALED' }, 'captured'],
    [{ type: 'VIDEO_SEALED' }, 'loading'],
    [{ type: 'UPLOAD_START' }, 'submitting'],
    [{ type: 'UPLOAD_SUCCEEDED' }, 'complete'],
  ] as const) {
    assert.equal(flow.dispatch(event), true)
    assert.equal(flow.phase, expect)
  }
})

test('重复封存/重复提交/跳阶段全部被拒绝', () => {
  const flow = new FlowController()
  flow.dispatch({ type: 'IDENTITY_SUBMITTED' })
  flow.dispatch({ type: 'CONSENT_CONFIRMED' })
  flow.dispatch({ type: 'BEGIN_PRACTICE' })
  flow.dispatch({ type: 'START_COUNTDOWN' })
  flow.dispatch({ type: 'COUNTDOWN_FINISHED' })
  assert.equal(flow.phase, 'assess')
  // 尚未封存：提交类事件非法
  assert.equal(flow.dispatch({ type: 'UPLOAD_SUCCEEDED' }), false)
  assert.equal(flow.dispatch({ type: 'CAPTURE_INVALIDATED', }), true)
  assert.equal(flow.phase, 'capture_invalid')
  // 失效后封存事件（迟到的并发回调）被拒绝
  assert.equal(flow.dispatch({ type: 'CAPTURE_SEALED' }), false)
  assert.equal(flow.phase, 'capture_invalid')
})

test('封存后失效事件不可再触发（单向终态；防重复封存/失效竞争）', () => {
  const flow = new FlowController()
  flow.dispatch({ type: 'IDENTITY_SUBMITTED' })
  flow.dispatch({ type: 'CONSENT_CONFIRMED' })
  flow.dispatch({ type: 'BEGIN_PRACTICE' })
  flow.dispatch({ type: 'START_COUNTDOWN' })
  flow.dispatch({ type: 'COUNTDOWN_FINISHED' })
  flow.dispatch({ type: 'CAPTURE_SEALED' })
  assert.equal(flow.dispatch({ type: 'CAPTURE_SEALED' }), false, '二次封存拒绝')
  assert.equal(flow.dispatch({ type: 'CAPTURE_INVALIDATED' }), false, '封存后失效拒绝')
  flow.dispatch({ type: 'VIDEO_SEALED' })
  flow.dispatch({ type: 'UPLOAD_START' })
  flow.dispatch({ type: 'UPLOAD_FAILED', retryable: true })
  assert.equal(flow.dispatch({ type: 'UPLOAD_FAILED', retryable: true }), false, '二次失败事件拒绝')
  assert.equal(flow.dispatch({ type: 'RETRY_SUBMIT' }), true)
  assert.equal(flow.phase, 'submitting')
})

test('提交失败可重试；QA 拒绝走 quality_restart；重开回 detect', () => {
  const flow = new FlowController()
  for (const event of [
    { type: 'IDENTITY_SUBMITTED' }, { type: 'CONSENT_CONFIRMED' },
    { type: 'BEGIN_PRACTICE' }, { type: 'START_COUNTDOWN' }, { type: 'COUNTDOWN_FINISHED' },
  ] as const) flow.dispatch(event)
  flow.dispatch({ type: 'CAPTURE_SEALED' })
  flow.dispatch({ type: 'VIDEO_SEALED' })
  flow.dispatch({ type: 'UPLOAD_START' })
  flow.dispatch({ type: 'VIDEO_QA_REJECTED' })
  assert.equal(flow.phase, 'quality_restart')
  assert.equal(flow.dispatch({ type: 'RETRY_SUBMIT' }), false, 'QA 拒绝后不可原地重试提交')
  assert.equal(flow.dispatch({ type: 'RESTART_AFTER_QA' }), true)
  assert.equal(flow.phase, 'detect')
})

test('采集失效重测：detect 可直达倒计时（保留预训练完成状态）', () => {
  const flow = new FlowController()
  for (const event of [
    { type: 'IDENTITY_SUBMITTED' }, { type: 'CONSENT_CONFIRMED' },
    { type: 'BEGIN_PRACTICE' }, { type: 'START_COUNTDOWN' }, { type: 'COUNTDOWN_FINISHED' },
  ] as const) flow.dispatch(event)
  flow.dispatch({ type: 'CAPTURE_INVALIDATED' })
  assert.equal(flow.dispatch({ type: 'RESTART_AFTER_INVALID' }), true)
  assert.equal(flow.phase, 'detect')
  assert.equal(flow.dispatch({ type: 'START_COUNTDOWN' }), true, '预训练完成后直达倒计时')
  assert.equal(flow.phase, 'countdown')
})

test('complete 后拒绝一切重试/重开事件（成功即终态）', () => {
  const flow = new FlowController()
  for (const event of [
    { type: 'IDENTITY_SUBMITTED' }, { type: 'CONSENT_CONFIRMED' },
    { type: 'BEGIN_PRACTICE' }, { type: 'START_COUNTDOWN' }, { type: 'COUNTDOWN_FINISHED' },
  ] as const) flow.dispatch(event)
  flow.dispatch({ type: 'CAPTURE_SEALED' })
  flow.dispatch({ type: 'VIDEO_SEALED' })
  flow.dispatch({ type: 'UPLOAD_START' })
  flow.dispatch({ type: 'UPLOAD_SUCCEEDED' })
  assert.equal(flow.finishedSuccessfully, true)
  assert.equal(flow.dispatch({ type: 'RETRY_SUBMIT' }), false)
  assert.equal(flow.dispatch({ type: 'RESTART_AFTER_INVALID' }), false)
})

test('非法转换触发 onRejected（审计），状态不变', () => {
  const rejected: Array<[string, string]> = []
  const flow = new FlowController({ onRejected: (event, phase) => rejected.push([event, phase]) })
  assert.equal(flow.dispatch({ type: 'CAPTURE_SEALED' }), false)
  assert.deepEqual(rejected, [['CAPTURE_SEALED', 'login']])
  assert.equal(flow.phase, 'login')
})
