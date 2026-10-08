import { describe, expect, it } from 'vitest'
import type { AssessmentDetail } from '@/types/assessment'
import type { DetailedMetricView } from '@/types/report'
import {
  confidenceConcerns,
  coreMetricViews,
  screeningMetricViews,
  dataQualityVerdict,
  isAttentionMetric,
  isStableMetric,
  managementActions,
  qualityCards,
  resultOverview,
} from '../report'

const baseView = (overrides: Partial<DetailedMetricView>): DetailedMetricView => ({
  key: 'stress_load',
  name: '压力负荷',
  technicalName: 'stress_load',
  score: 65,
  level: '偏高',
  grade: '未提供',
  thresholds: [],
  referenceText: '',
  definition: '',
  plainMeaning: '',
  aviationMeaning: '',
  limitation: '',
  recommendation: '',
  confidence: '未提供',
  direction: 'higher_load',
  source: '',
  weakReference: false,
  severity: null,
  riskBand: null,
  ...overrides,
})

const reportWith = (summary: Record<string, unknown>) =>
  ({ id: 't', result: { summary_json: summary } }) as unknown as AssessmentDetail

it('社区沿用相同分数与阈值，实际解读使用日常含义', () => {
  const report = reportWith({ core_indicators: { stress_load: { score: 65, grade_thresholds: [10, 20, 30, 40] } } })
  for (const map of [coreMetricViews, screeningMetricViews]) {
    const aviation = map({ ...report, scene: 'aviation' })
    const community = map({ ...report, scene: 'community' })
    community.forEach((item, index) => {
      expect(item.aviationMeaning).toBe(item.plainMeaning)
      expect(item.score).toBe(aviation[index]!.score)
      expect(item.thresholds).toEqual(aviation[index]!.thresholds)
    })
  }
})

describe('isAttentionMetric（severity 优先）', () => {
  it('severity>=1 判为重点查看，severity=0 不判', () => {
    expect(isAttentionMetric(baseView({ severity: 1 }))).toBe(true)
    expect(isAttentionMetric(baseView({ severity: 2 }))).toBe(true)
    expect(isAttentionMetric(baseView({ severity: 0, level: '偏高' }))).toBe(false)
  })

  it('severity 优先于文字：数值 0 时即使档位文字含“偏高”也不判重点', () => {
    expect(isAttentionMetric(baseView({ severity: 0, originalLevel: '明显偏高' }))).toBe(false)
  })

  it('生理唤醒豁免：即使 severity=2 也不判为重点（低负荷是正常态口径）', () => {
    expect(isAttentionMetric(baseView({ key: 'physiological_arousal', severity: 2 }))).toBe(false)
  })

  it('筛查项用 risk_band：high 判重点，low/uncertain 不判', () => {
    expect(isAttentionMetric(baseView({ key: 'depression', severity: null, riskBand: 'high' }))).toBe(true)
    expect(isAttentionMetric(baseView({ key: 'depression', severity: null, riskBand: 'low' }))).toBe(false)
    expect(isAttentionMetric(baseView({ key: 'depression', severity: null, riskBand: 'uncertain' }))).toBe(false)
  })

  it('结构化字段缺失时回退文字匹配', () => {
    expect(isAttentionMetric(baseView({ originalLevel: '偏高' }))).toBe(true)
    expect(isAttentionMetric(baseView({ originalLevel: '参考范围' }))).toBe(false)
  })
})

describe('isStableMetric（稳定表现）', () => {
  it('severity=0 或低风险档为稳定', () => {
    expect(isStableMetric(baseView({ severity: 0, originalLevel: '参考范围' }))).toBe(true)
    expect(isStableMetric(baseView({ severity: 1 }))).toBe(false)
    expect(isStableMetric(baseView({ key: 'physiological_arousal', severity: 0, originalLevel: '负荷较低' }))).toBe(true)
    expect(isStableMetric(baseView({ key: 'depression', severity: null, riskBand: 'low' }))).toBe(true)
    expect(isStableMetric(baseView({ key: 'depression', severity: null, riskBand: 'unavailable' }))).toBe(false)
  })
})

describe('生理唤醒展示口径', () => {
  it('合作方标记为负荷较低时显示正常（低负荷），参考范围直接显示正常', () => {
    const lowLoad = reportWith({
      core_indicators: {
        physiological_arousal: { score: 23.74, grade_label: '负荷较低', level: { severity: 0 } },
      },
    })
    const reference = reportWith({
      core_indicators: {
        physiological_arousal: { score: 40, grade_label: '参考范围', level: { severity: 0 } },
      },
    })
    expect(resultOverview(lowLoad).metrics.find(item => item.key === 'physiological_arousal')?.level).toBe('正常（低负荷）')
    expect(resultOverview(reference).metrics.find(item => item.key === 'physiological_arousal')?.level).toBe('正常')
  })
})

describe('dataQualityVerdict / confidenceConcerns', () => {
  it('合作方高置信 → 可解释，且不输出归因', () => {
    const report = reportWith({ confidence: { level: { key: 'high', label: '高' }, score: 0.9 } })
    expect(dataQualityVerdict(report).overall).toBe('可解释')
    expect(dataQualityVerdict(report).lowConfidence).toBe(false)
    expect(confidenceConcerns(report)).toEqual([])
  })

  it('低置信（score<0.6 既有规则）→ 建议谨慎解释，归因取最弱两项的中文表达', () => {
    const report = reportWith({
      confidence: {
        level: { key: 'medium', label: '中' },
        score: 0.5,
        components: { video_quality: 0.4, signal_stability: 0.9, effective_duration: 1.0 },
      },
    })
    expect(dataQualityVerdict(report).overall).toBe('建议谨慎解释')
    expect(dataQualityVerdict(report).lowConfidence).toBe(true)
    // 取最弱两项并翻译为中文归因，不暴露原始分数
    expect(confidenceConcerns(report)).toEqual(['画面质量', '信号稳定性'])
  })

  it('level=low 也触发低置信', () => {
    const report = reportWith({ confidence: { level: { key: 'low', label: '低' }, score: 0.7 } })
    expect(dataQualityVerdict(report).lowConfidence).toBe(true)
  })

  it('中档置信（如 0.79）属于正常可用结果，不升级为“建议谨慎解释”', () => {
    const report = reportWith({ confidence: { level: { key: 'medium', label: '中' }, score: 0.792 } })
    expect(dataQualityVerdict(report).overall).toBe('可解释')
    expect(dataQualityVerdict(report).lowConfidence).toBe(false)
    expect(confidenceConcerns(report)).toEqual([])
  })

  it('缺失 confidence → 未提供，不误报低置信', () => {
    const verdict = dataQualityVerdict(reportWith({}))
    expect(verdict.overall).toBe('未提供')
    expect(verdict.lowConfidence).toBe(false)
  })
})

describe('qualityCards（质量卡三档判读）', () => {
  it('数值缺失 → 未提供；有数值且置信正常 → 可解释；低置信 → 建议谨慎解释', () => {
    const full = reportWith({
      quality: { face_valid_ratio: 0.98, face_quality: 0.8, motion_noise_index: 0.2, drop_rate_percent: 0 },
      confidence: { level: { key: 'high' }, score: 0.9 },
    })
    expect(qualityCards(full).every(card => card.verdict === '可解释')).toBe(true)

    const partial = reportWith({ quality: { face_valid_ratio: 0.98 } })
    expect(qualityCards(partial).filter(card => card.verdict === '未提供')).toHaveLength(3)

    const low = reportWith({
      quality: { face_valid_ratio: 0.98, face_quality: 0.8, motion_noise_index: 0.2, drop_rate_percent: 0 },
      confidence: { level: { key: 'low' }, score: 0.4 },
    })
    expect(qualityCards(low).every(card => card.verdict === '建议谨慎解释')).toBe(true)
  })
})

describe('managementActions 与“建议重点查看”口径一致', () => {
  it('存在 severity>=1 的重点项 → 首条建议为优先人工复核', () => {
    const report = reportWith({
      core_indicators: { stress_load: { level: { severity: 1, label: '偏高' } } },
    })
    expect(resultOverview(report).attention.map(item => item.key)).toContain('stress_load')
    expect(managementActions(report)[0]).toContain('优先安排人工复核')
  })

  it('全部 severity=0 → 重点卡为空，首条建议为持续观察（不再看文字正则）', () => {
    const report = reportWith({
      core_indicators: { stress_load: { level: { severity: 0, label: '偏高' } } },
    })
    // 文字写着“偏高”但结构化 severity=0：重点卡不判，建议也一致不升级
    expect(resultOverview(report).attention).toHaveLength(0)
    expect(managementActions(report)[0]).toContain('当前未见需立即升级')
  })

  it('低置信 → 出现复测建议；置信正常 → 出现基线建议', () => {
    const low = reportWith({ confidence: { level: { key: 'low' }, score: 0.4 } })
    expect(managementActions(low).some(action => action.includes('置信度较低'))).toBe(true)
    const high = reportWith({ confidence: { level: { key: 'high' }, score: 0.9 } })
    expect(managementActions(high).some(action => action.includes('基线'))).toBe(true)
  })

  it('眼动未采集 → 追加眼动不推断说明', () => {
    const actions = managementActions(reportWith({}))
    expect(actions.some(action => action.includes('眼动未采集'))).toBe(true)
  })
})
