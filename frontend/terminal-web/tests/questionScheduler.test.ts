/**
 * QuestionScheduler 高风险调度测试（自定节奏、零自动切题、收尾窗口、题池耗尽、竞态）。
 * 运行：node --test --experimental-strip-types tests/questionScheduler.test.ts
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { QuestionScheduler } from '../src/aviation/QuestionScheduler.ts'
import type { SessionQuestion } from '../src/aviation/types.ts'

const OPTS = {
  requiredMs: 60_000,
  tailFromMs: 10_000,
  closingFromMs: 4_000,
  selectFeedbackMs: 200,
  skipFeedbackMs: 200,
  tailPoolSize: 6,
}

function makePool(n: number): SessionQuestion[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `q${i}`,
    question: `题目${i}`,
    options: [{ id: `q${i}-a`, text: '甲' }, { id: `q${i}-b`, text: '乙' }],
    image: `/img/${i % 5}.jpg`,
    imageAlt: '航空情境图片',
    audioUrl: `/audio/q${i}.wav`,
    contentVersion: 't',
    scoringMode: 'observation_only' as const,
  }))
}

function drive(s: QuestionScheduler, elapsedMs: number) { s.update(elapsedMs) }

// ═══════════════ 自定节奏：快答持续出题 / 慢答不催 ═══════════════

test('快速答题持续出题：每题 1.5s 一答，直到题池耗尽或进入收尾窗口', () => {
  const s = new QuestionScheduler(makePool(30), OPTS)
  s.start(0)
  for (let t = 1_500; t <= 59_000; t += 1_500) {
    const card = s.card
    if (card.kind !== 'question') break        // 题池耗尽 / 收尾窗口：收尾页，不卡住
    assert.equal(s.select(card.instance.instanceId, `${card.instance.question.id}-a`, t), true)
    drive(s, t + 250)   // 反馈 200ms 后切题
  }
  assert.equal(s.presentedCount, 30, '持续出题到题池上限（30 题全部展示）')
  assert.ok(s.notes.some(n => n.startsWith('pool_exhausted')), '题池耗尽被记录')
  assert.equal(s.card.kind, 'closing', '耗尽后收尾页直到采集结束')
})

test('慢答/不答：当前题无限保持，绝不自动切换（无“每题 N 秒超时”）', () => {
  const s = new QuestionScheduler(makePool(12), OPTS)
  s.start(0)
  const first = s.card
  for (const t of [5_000, 15_000, 30_000, 55_000, 59_999]) {
    drive(s, t)
    assert.equal(s.card.kind, 'question')
    assert.equal((s.card as { instance: { instanceId: number } }).instance.instanceId, (first as { instance: { instanceId: number } }).instance.instanceId, `t=${t} 仍是第一题`)
  }
  assert.equal(s.results.length, 0, '未作答不记录为已答')
})

// ═══════════════ 竞态与防误触 ═══════════════

test('双击：第一次选择后立即处于反馈锁定，第二次点击被拒绝', () => {
  const s = new QuestionScheduler(makePool(6), OPTS)
  s.start(0)
  const card = s.card as { instance: { instanceId: number } }
  assert.equal(s.select(card.instance.instanceId, 'q0-a', 1_000), true)
  assert.equal(s.select(card.instance.instanceId, 'q0-b', 1_010), false, '双击第二下被拒')
  drive(s, 1_300)
  const next = s.card as { instance: { instanceId: number } }
  assert.notEqual(next.instance.instanceId, card.instance.instanceId)
  // 旧题事件（触摸穿透延迟到达）不可能选中下一题
  assert.equal(s.select(card.instance.instanceId, 'q0-b', 1_320), false, '旧题实例事件被拒')
  assert.equal(s.results[0].optionId, 'q0-a')
  assert.equal(s.results[1], undefined, '下一题未被误选')
})

test('反馈期内切换前点击无效：切题只由时钟驱动一次', () => {
  const s = new QuestionScheduler(makePool(6), OPTS)
  s.start(0)
  const card = s.card as { instance: { instanceId: number } }
  s.select(card.instance.instanceId, 'q0-a', 1_000)
  // 反馈未到 200ms：多次 update 不切题、不接受点击
  drive(s, 1_100); drive(s, 1_150)
  assert.equal(s.card.kind, 'feedback')
  assert.equal(s.select(card.instance.instanceId, 'q0-b', 1_150), false)
  drive(s, 1_201)
  assert.equal(s.card.kind, 'question', '反馈期结束切下一题')
  const results = s.results
  assert.equal(results.length, 1)
})

test('跳过：固定操作记录 skipped 并切题，不代选', () => {
  const s = new QuestionScheduler(makePool(6), OPTS)
  s.start(0)
  const card = s.card as { instance: { instanceId: number } }
  assert.equal(s.skip(card.instance.instanceId, 2_000), true)
  assert.equal(s.results[0].outcome, 'skipped')
  assert.equal(s.results[0].optionId, null)
  drive(s, 2_300)
  assert.notEqual(s.card.kind, 'none')
})

// ═══════════════ 收尾窗口（试验配置：>10s 常规、4–10s 收尾、<4s 收尾页） ═══════════════

test('收尾调度：不同剩余时间挑不同角色的题', () => {
  const pool = makePool(10)
  const s = new QuestionScheduler(pool, OPTS)
  s.start(0)
  // 剩余 50s：常规题（pool 前 4 道 regular）
  drive(s, 10_000)
  let card = s.card as { instance: { role: string } }
  assert.equal(card.instance.role, 'regular')
  s.select((s.card as { instance: { instanceId: number } }).instance.instanceId, `${card.instance.question.id}-a`, 10_100)
  drive(s, 10_400)
  // 剩余 49.6s 仍 regular
  card = s.card as { instance: { role: string } }
  assert.equal(card.instance.role, 'regular')
  // 快进：剩 8s（4–10s 窗口）→ 优先 tail
  const at = 52_000
  const cur = s.card as { instance: { instanceId: number } }
  s.select(cur.instance.instanceId, `${cur.instance.question.id}-a`, at)
  drive(s, at + 300)
  card = s.card as { instance: { role: string } }
  assert.equal(card.instance.role, 'tail', '剩 8s 新题优先收尾题')
  // 剩 3s：完成当前题后收尾页，不再出新题
  const cur2 = s.card as { instance: { instanceId: number } }
  s.select(cur2.instance.instanceId, `${cur2.instance.question.id}-a`, 57_500)
  drive(s, 57_900)
  assert.equal(s.card.kind, 'closing', '剩 <4s 不出新题，收尾页')
  drive(s, 59_999)
  assert.equal(s.card.kind, 'closing')
})

test('常规题耗尽时回退用收尾题（仍不重复）', () => {
  const pool = makePool(8)   // 2 regular + 6 tail
  const s = new QuestionScheduler(pool, OPTS)
  s.start(0)
  const seen: string[] = []
  for (let t = 500; t <= 40_000; t += 2_500) {
    const card = s.card
    if (card.kind !== 'question') break
    seen.push(card.instance.question.id)
    s.select(card.instance.instanceId, `${card.instance.question.id}-a`, t)
    drive(s, t + 300)
  }
  assert.equal(new Set(seen).size, seen.length, '全程无重复题')
  assert.equal(seen.length, 8, '题池全部用尽（regular→tail 回退）')
  assert.ok(s.notes.some(n => n.startsWith('pool_exhausted')))
  assert.equal(s.card.kind, 'closing', '耗尽后收尾页，不卡住')
})

// ═══════════════ 满 60 秒 / 最后一秒 ═══════════════

test('第 59 秒点击：作答保留，封存后挂起的切题不再生效（finalize 冻结）', () => {
  const s = new QuestionScheduler(makePool(12), OPTS)
  s.start(0)
  drive(s, 59_200)
  const card = s.card as { instance: { instanceId: number } }
  assert.equal(s.select(card.instance.instanceId, `${card.instance.question.id}-b`, 59_250), true)
  // 采集在反馈期封存（60s）：finalize 冻结调度，不再切题
  s.finalize(60_000)
  drive(s, 60_500)
  const last = s.results[s.results.length - 1]
  assert.equal(last.outcome, 'selected', '59 秒的选择已记录')
  assert.equal(last.optionId, `${card.instance.question.id}-b`)
  assert.equal(s.select(999, 'x', 60_600), false, '封存后点击一律拒绝')
  assert.equal(s.skip(999, 60_600), false)
})

test('满 60 秒自然结束：当前未答题记为 unanswered，不冒充已答', () => {
  const s = new QuestionScheduler(makePool(12), OPTS)
  s.start(0)
  drive(s, 59_900)
  const card = s.card as { instance: { instanceId: number } }
  s.finalize(60_000)
  const last = s.results[s.results.length - 1]
  assert.equal(last.instanceId, card.instance.instanceId)
  assert.equal(last.outcome, 'unanswered')
  assert.equal(last.optionId, null)
})

test('无重复：整个 60 秒里同一题不会出现两次', () => {
  const s = new QuestionScheduler(makePool(40), OPTS)
  s.start(0)
  const seen = new Set<string>()
  for (let t = 300; t <= 59_000; t += 1_200) {
    const card = s.card
    if (card.kind !== 'question') break
    assert.ok(!seen.has(card.instance.question.id), `题 ${card.instance.question.id} 重复出现`)
    seen.add(card.instance.question.id)
    s.select(card.instance.instanceId, `${card.instance.question.id}-a`, t)
    drive(s, t + 250)
  }
})

// ═══════════════ 练习模式 ═══════════════

test('练习模式：按池顺序出题，三题耗尽即 finished，不做时间判定', () => {
  const s = new QuestionScheduler(makePool(3), { ...OPTS, mode: 'practice' })
  s.start(0)
  for (let i = 0; i < 3; i++) {
    const card = s.card
    assert.equal(card.kind, 'question')
    assert.equal(card.instance.question.id, `q${i}`, '按池顺序')
    s.select(card.instance.instanceId, `q${i}-a`, i * 5_000 + 100)
    drive(s, i * 5_000 + 400)
  }
  assert.equal(s.finished, true)
  assert.equal(s.card.kind, 'none', '练习无收尾页（编排层展示完成卡）')
  assert.equal(s.results.length, 3)
})

test('练习模式：慢答同样不自动切题', () => {
  const s = new QuestionScheduler(makePool(3), { ...OPTS, mode: 'practice' })
  s.start(0)
  drive(s, 120_000)
  assert.equal(s.card.kind, 'question', '练习也不自动切换')
  assert.equal(s.results.length, 0)
})
