/**
 * 终端个人报告四页卡片测试：
 * - toReportSource 适配器把个人安全视图载荷映射为共享映射层输入；
 * - 共享层（与网页版同一实现）在个人载荷上产出正确的等级/分组；
 * - 处理中文案不含内部技术表述，且保留 3—4 分钟提示；
 * - 倒计时数字语音 cue 已从类型/文件清单中移除。
 * 运行：node --test --experimental-strip-types tests/personalReport.test.ts
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { toReportSource, type ReportPayload } from '../src/composables/useReportLookup.ts'
import { MESSAGES } from '../src/aviation/messages.ts'
import { coreMetricViews, isAttentionMetric, resultOverview, screeningMetricViews } from '../../shared/report-kit/mapping.ts'
import { AudioCoordinator } from '../src/aviation/AudioCoordinator.ts'

function payload(overrides: Partial<ReportPayload> = {}): ReportPayload {
  return {
    template_version: 'personal-report-v2',
    submitted_at: '2026-09-16T04:00:00Z',
    completed_at: '2026-09-16T04:03:30Z',
    result_valid: true,
    capture: { duration_seconds: 60, effective_duration_seconds: 60, video_qa_ok: true },
    review: { review_status: 'pending', reviewed: false },
    disclaimer: '辅助筛查，不构成医学诊断和适航结论',
    result_subset: {
      depression_score: 69.26,
      depression_label: '高风险关注',
      depression_classification: 'high_attention',
      anxiety_score: 40,
      anxiety_label: '无明显风险',
      anxiety_classification: 'no_obvious_risk',
    },
    summary_subset: {
      clinical_screening: {
        depression: { score: 69.26, classification: 'high_attention', classification_label: '高风险关注' },
        anxiety: { score: 40, classification: 'no_obvious_risk', classification_label: '无明显风险' },
      },
      core_indicators: {
        stress_load: { grade_source_score: 40, classification_label: '参考范围', level: { label: '参考范围', severity: 0 } },
        fatigue_recovery: { grade_source_score: 72, classification_label: '偏高', level: { label: '偏高', severity: 1 } },
      },
      small_indicators: { eye_tracking: { attention_focus_score: { value: 70, unit: 'score' } } },
      modules: { eye_tracking: { status: 'collected' } },
    },
    ...overrides,
  }
}

test('toReportSource：子集映射为共享层输入，不含 timeline', () => {
  const source = toReportSource(payload())
  assert.equal(source.result?.depression_score, 69.26)
  assert.equal(source.result?.summary_json?.clinical_screening.depression.score, 69.26)
  assert.equal(source.result?.timeline_json, null, '终端个人视图无原始 timeline（管理端专属）')
  assert.equal(source.status, 'completed')
})

test('共享层在个人载荷上产出与网页版同口径的等级与分组', () => {
  const source = toReportSource(payload())
  const screening = screeningMetricViews(source)
  const depression = screening.find(item => item.key === 'depression')!
  assert.equal(depression.level, '高风险关注')
  assert.equal(depression.riskBand, 'high')

  const core = coreMetricViews(source)
  const stress = core.find(item => item.key === 'stress_load')!
  const fatigue = core.find(item => item.key === 'fatigue_recovery')!
  assert.equal(stress.level, '正常')                    // severity=0 → 正常（与网页版同规则）
  assert.equal(fatigue.level, '偏高')
  assert.equal(isAttentionMetric(fatigue), true)        // severity=1 → 建议重点关注
  assert.equal(isAttentionMetric(stress), false)

  const overview = resultOverview(source)
  assert.ok(overview.attention.some(item => item.key === 'fatigue_recovery'))
  assert.ok(overview.stable.some(item => item.key === 'stress_load'))
})

test('眼动未采集时注意指标显示未采集，不推断', () => {
  const p = payload({ summary_subset: { core_indicators: {}, modules: { eye_tracking: { status: 'not_collected' } } } })
  const attention = coreMetricViews(toReportSource(p)).find(item => item.key === 'attention_focus')!
  assert.equal(attention.level, '未采集')
})

test('处理中文案不含内部技术表述且保留时长提示', () => {
  const copies = [
    MESSAGES.report.processingTitle,
    MESSAGES.report.processing,
    MESSAGES.report.processingSlow,
    '已提交，正在处理',
    '报告生成中',
  ]
  for (const text of copies) {
    for (const banned of ['合作方', '算法', '任务', '上传', '当前进度']) {
      assert.ok(!text.includes(banned), `文案"${text}"不得出现"${banned}"`)
    }
  }
  assert.equal(MESSAGES.report.processingTitle, '分析中')
  assert.ok(MESSAGES.report.processing.includes('3—4 分钟'))
})

test('倒计时数字语音已移除，开始提示音保留', () => {
  for (const cue of ['countdown-3', 'countdown-2', 'countdown-1']) {
    assert.ok(!(cue in MESSAGES.audioCueFiles), `${cue} 不应再出现在音频文件清单`)
  }
  assert.ok('start' in MESSAGES.audioCueFiles, 'start（正式采集开始提示）必须保留')
  // AudioCoordinator 的提示类型也不再包含数字语音
  const cueUrlProbe = (): never => { throw new Error('unknown audio cue') }
  assert.throws(() => {
    const coordinator = new (AudioCoordinator as unknown as new (o: unknown) => { playCue(cue: string): void })({
      factory: { create: async () => ({ play: async () => 'ended' as const, stop: () => {}, durationMs: 1 }) },
      isQuestionCurrent: () => false,
    })
    try { coordinator.playCue('countdown-3' as never) } catch { throw cueUrlProbe() }
  }, /unknown audio cue|没有列出的/)
})
