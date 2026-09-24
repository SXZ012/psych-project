/**
 * 共享报告映射层：原始分析结果 → 展示视图（分数/等级/阈值/分组/质量判读）。
 *
 * 迁移自 admin-web/src/utils/report.ts（内容逐字一致），是两端唯一映射实现：
 * 管理员网页与终端个人报告对同一份数据得到同一等级标签、同一分组、同一解释。
 * 管理端专属内容（AU 图地址、候选帧、波形图、Qwen 摘要）留在 admin-web，
 * 不进入本层——共享层不读取 id/URL/文件路径，结构上无法泄漏到终端。
 */
import { CORE_METRIC_DICTIONARY, SCREENING_DICTIONARY } from './dictionary.ts'
import { displayNumber, displayPercent, getAt } from './formatters.ts'
import type {
  DetailedMetricView, EvidenceTab, MetricView, PageSummary, QualityCardView,
  QualityVerdict, ReportSource, ReportTab,
} from './types.ts'
import type { MetricDefinition } from './dictionary.ts'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = Record<string, any>
const tabKey = (tab: EvidenceTab) => tab === 'eye' ? 'eye_tracking' : tab
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const summaryOf = (report: ReportSource) => (report.result?.summary_json || {}) as Json
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const timelineOf = (report: ReportSource) => (report.result?.timeline_json || {}) as Json

export interface ReportTabDefinition { key: ReportTab; label: string; kicker: string; title: string; hint: string }

export const REPORT_TABS: ReportTabDefinition[] = [
  { key: 'overview', label: '综合概览', kicker: 'Page 01 · Result Overview', title: '本次状态与复核重点', hint: '先确认数据是否有效、哪些结果稳定、哪些项目建议结合实际情况复核。' },
  { key: 'screening', label: '方向筛查', kicker: 'Page 02 · Screening', title: '抑郁与焦虑方向筛查', hint: '展示筛查分数、结果分类、置信度和使用限制；筛查不等于诊断。' },
  { key: 'core', label: '核心状态', kicker: 'Page 03 · Core State', title: '核心心理生理状态', hint: '逐项解释压力、疲劳、生理唤醒与视觉注意，并标明本次结果的档位与参考区间。' },
  { key: 'evidence', label: '数据证据', kicker: 'Page 04 · Data Evidence', title: '数据质量与辅助证据', hint: '展示采集质量、可用的生理节律与视觉注意证据，并说明解释边界。' },
]

function displayResultLabel(key: string, raw: unknown, severity?: unknown) {
  const label = String(raw || '未提供')
  const lowRisk = Number(severity) === 0 || /参考范围|无明显风险/.test(label)
  // 生理唤醒的“负荷较低”表示安静、放松的低负荷状态；
  // 合作方标注为“参考范围”时只显示“正常”，不要误写成低负荷。
  if (key === 'physiological_arousal' && /负荷较低|偏低/.test(label)) return '正常（低负荷）'
  if (key === 'physiological_arousal' && lowRisk) return '正常'
  if (lowRisk && /参考范围|无明显风险|负荷较低/.test(label)) return '正常'
  return label
}

const SPECS: Record<EvidenceTab, Array<[string, string, string?]>> = {
  au: [['micro_expression_event_rate_per_min', 'AU 事件率', 'au_event_rate_per_min'], ['au_event_peak_intensity', 'AU 峰值强度', 'au_activity_score'], ['au_tension_event_rate_per_min', 'AU 紧张事件率', 'tension_au_score'], ['au_low_activity_score', '低活动比例'], ['facial_variability', '面部变化幅度', 'au_variability_score']],
  rppg: [['hr_interval', '心率区间'], ['hr_range', '心率变幅'], ['hrv_rmssd_ms', 'RMSSD'], ['hrv_sdnn_ms', 'SDNN'], ['signal_quality', '信号质量'], ['motion_noise_index', '运动干扰'], ['light_noise_index', '光照干扰']],
  vibra: [['vibra_positive_score', '正向状态线索'], ['vibra_negative_score', '负向状态线索'], ['vibra_body_score', '身体/生理调节线索']],
  eye: [['attention_focus_score', '视觉专注度'], ['attention_stability_score', '注意稳定性'], ['gaze_valid_ratio', '有效眼动比例'], ['aoi_center_dwell_ratio', '中心关注比例'], ['fixation_ratio', '注视停留比例'], ['gaze_entropy', '视线离散度'], ['gaze_x_range', '水平移动范围'], ['gaze_y_range', '垂直移动范围']],
}
const FORMAL_KEYS = ['happiness', 'confidence', 'stress', 'unrest', 'suspicion', 'depression', 'energy', 'balance', 'self_regulation', 'reaction', 'neuroticism', 'aggression']

function group(report: ReportSource, tab: EvidenceTab): Json {
  return getAt(summaryOf(report), `small_indicators.${tabKey(tab)}`, {}) || {}
}
function evidenceLabel(tab: EvidenceTab, key: string, item: Json, rawLevel: string): string {
  const direction = String(item?.direction || '')
  // 3.2 明确规定视觉注意力“分数越高越专注”；不能把高分套成负荷类的“明显偏高”。
  if (tab === 'eye') {
    const focused = direction === 'higher_more_focused' || ['attention_focus_score', 'attention_stability_score', 'gaze_valid_ratio', 'aoi_center_dwell_ratio', 'fixation_ratio'].includes(key)
    const unstable = direction === 'higher_more_unstable' || ['gaze_entropy', 'gaze_x_range', 'gaze_y_range'].includes(key)
    if (focused) {
      if (/偏低|低/.test(rawLevel)) return '偏低'
      return '稳定/良好'
    }
    if (unstable) {
      if (/偏高|高/.test(rawLevel)) return '视线较分散'
      return '正常'
    }
  }
  if (tab === 'rppg' && key === 'signal_quality') {
    if (/偏低|低/.test(rawLevel)) return '需谨慎'
    return '良好'
  }
  if (tab === 'rppg' && ['motion_noise_index', 'light_noise_index'].includes(key)) {
    // 这两个字段本身就是 0～1 的干扰指数，数值优先于接口附带的通用分档标签。
    const numeric = Number(item?.value ?? item?.raw_value ?? item?.score_0_100 ?? item?.score)
    if (Number.isFinite(numeric)) {
      if (numeric < 0.3) return '干扰较低'
      if (numeric >= 0.6) return '干扰较高'
      return '干扰中等'
    }
    return '干扰待确认'
  }
  // 合作方仅定义这些证据的含义，没有给出可用于用户判定的常模区间；不把内部档位渲染成风险色。
  if (tab === 'au' || tab === 'vibra' || (tab === 'rppg' && ['hr_range', 'hrv_rmssd_ms', 'hrv_sdnn_ms'].includes(key))) return '辅助观察'
  return displayResultLabel(key, rawLevel, item?.level?.severity)
}

function metric(source: Json, keys: string[], name: string, tab: EvidenceTab): MetricView {
  const raw = keys.map(key => source[key]).find(value => value != null)
  const item = raw && typeof raw === 'object' ? raw : { value: raw }
  const value = item?.value ?? item?.raw_value ?? item?.mean ?? item?.score_0_100 ?? item?.score
  const unit = item?.unit || ''
  const rawLevel = item?.level?.label || item?.classification_label || item?.grade_label || '未提供'
  return { key: keys[0], name, value: unit === 'ratio' || unit === 'prob' ? displayPercent(value) : displayNumber(value), level: evidenceLabel(tab, keys[0], item, String(rawLevel)), unit }
}
export function pageMetrics(report: ReportSource, tab: EvidenceTab): MetricView[] {
  const source = group(report, tab)
  return SPECS[tab].map(([key, name, fallback]) => metric(source, [key, fallback].filter(Boolean) as string[], name, tab))
}
export function unitLabel(unit?: string) { return ({ bpm: 'bpm', bpm_range: 'bpm', ms: 'ms', 'breaths/min': '次/分', 'events/min': '次/分', '0-1': '0–1', score: '分', '%': '%' } as Record<string, string>)[unit || ''] || unit || '评估数据' }

export function rppgAvailable(report: ReportSource) {
  const summary = summaryOf(report), timeline = timelineOf(report)
  const value = getAt(timeline, 'display_payload.rppg_waveforms.quality_gate.physiology_available', getAt(summary, 'rppg_quality_gate.physiology_available', getAt(summary, 'quality.rppg_window_usable', null)))
  return value === true || (value == null && pageMetrics(report, 'rppg').some(item => item.value !== '—'))
}
export function rppgReasons(report: ReportSource) {
  const gate = getAt(summaryOf(report), 'rppg_quality_gate', {}) || {}
  const reasons = gate.unavailable_reasons || gate.reasons || []
  const joined = Array.isArray(reasons) ? reasons.filter(Boolean).join('；') : String(reasons || '')
  // 结果数据里的原因若不是中文（内部排查用语），不直接展示给用户
  return /[一-鿿]/.test(joined) ? joined : ''
}
export function eyeData(report: ReportSource): Json { return getAt(timelineOf(report), 'display_payload.eye_tracking', {}) || {} }
export function eyeAvailable(report: ReportSource) {
  const eye = eyeData(report), small = group(report, 'eye')
  const status = eye.status || getAt(summaryOf(report), 'modules.eye_tracking.status', getAt(summaryOf(report), 'quality.eye_tracking_status', ''))
  return !/not_collected|unavailable|missing/i.test(String(status)) && (!!eye.metrics || (Array.isArray(eye.gaze_points) && eye.gaze_points.length > 0) || Object.keys(small).length > 0)
}
export function formalRows(report: ReportSource) {
  const raw = getAt(timelineOf(report), 'display_payload.vibra_formal12_ranges.indicators', {}) || {}
  return FORMAL_KEYS.map((key, index) => raw[key] ? { key, index: index + 1, range: raw[key].range || {} } : null).filter(Boolean) as Array<{ key: string; index: number; range: Json }>
}
export function formalStatus(report: ReportSource) {
  const status = getAt(summaryOf(report), 'formal_segment_status', {}) || {}
  return status.clinical_eligible === true ? `可解释 · ${status.segment_count || 0} 段` : status.segment_count != null ? `仅趋势 · ${status.segment_count} 段` : '状态待确认'
}

export function overviewCards(report: ReportSource) {
  const result = report.result, summary = summaryOf(report), screening = getAt(summary, 'clinical_screening', {}) || {}, state = getAt(summary, 'product_logic_summary.state_severity', {}) || {}, core = getAt(summary, 'core_indicators', {}) || {}
  const screens = [{ key: 'depression', name: '抑郁方向筛查', result: result?.depression_label || result?.depression_classification, score: result?.depression_score }, { key: 'anxiety', name: '焦虑方向筛查', result: result?.anxiety_label || result?.anxiety_classification, score: result?.anxiety_score }].map(def => { const item = screening[def.key] || {}; return { ...def, value: def.result || item.classification_label || item.screening_result || '待分析', score: def.score ?? item.score ?? (item.probability != null ? Number(item.probability) * 100 : null) } })
  const states = [['stress_load', '压力负荷'], ['fatigue_recovery', '疲劳/恢复负荷'], ['physiological_arousal', '生理唤醒线索'], ['attention_focus', '视觉注意力']].map(([key, name]) => { const item = state[key] || core[key] || {}; const raw = item.classification_label || item.grade_label || getAt(item, 'level.label', '待分析'); return { key, name, value: displayResultLabel(key, raw, item.level?.severity), score: item.grade_source_score ?? item.raw_score ?? item.score ?? null } })
  return [...screens, ...states]
}

function thresholdText(thresholds: number[], direction: 'higher_load' | 'higher_better') {
  if (thresholds.length !== 4) return '本次结果未提供固定数值分档，以结果档位为准'
  const [a, b, c, d] = thresholds.map(Number)
  const labels = direction === 'higher_better'
    ? ['低', '偏低', '正常（第3档）', '正常（第4档）', '正常（第5档）']
    : ['明显偏低', '偏低', '参考范围', '偏高', '明显偏高']
  return `<${a} ${labels[0]}；${a}–<${b} ${labels[1]}；${b}–<${c} ${labels[2]}；${c}–<${d} ${labels[3]}；≥${d} ${labels[4]}`
}

function detailedMetric(key: string, item: Json, definition: MetricDefinition): DetailedMetricView {
  const thresholds = Array.isArray(item.grade_thresholds) ? item.grade_thresholds.map(Number).filter(Number.isFinite) : []
  const score = item.grade_source_score ?? item.raw_score ?? item.score
  const reference = item.reference_range || item.audit?.reference_range || {}
  const n = Number(reference.n)
  const weakReference = item.reliability === 'weak_reference' || (Number.isFinite(n) && n < Number(reference.weak_reference_min_n || 20))
  const originalLevel = item.classification_label || item.grade_label || item.level?.label || '未提供'
  return {
    key, name: item.name || definition.name, technicalName: key, score: Number.isFinite(Number(score)) ? Number(score) : null,
    level: displayResultLabel(key, originalLevel, item.level?.severity), originalLevel,
    severity: item.level?.severity != null ? Number(item.level.severity) : null,
    riskBand: item.risk_band != null ? String(item.risk_band) : null,
    grade: item.grade_display || (item.grade_1_5 ? `${item.grade_1_5}档` : '未提供'),
    thresholds, referenceText: thresholdText(thresholds, definition.direction), definition: item.interpretation || definition.plainMeaning,
    plainMeaning: definition.plainMeaning, aviationMeaning: definition.aviationMeaning, limitation: definition.limitation,
    recommendation: definition.recommendation, confidence: item.classification_confidence_label || item.confidence?.level?.label || '未提供',
    direction: definition.direction, source: item.source || reference.source || '分析结果', weakReference,
  }
}

export function coreMetricViews(report: ReportSource): DetailedMetricView[] {
  const core = getAt(summaryOf(report), 'core_indicators', {}) || {}
  return Object.entries(CORE_METRIC_DICTIONARY).map(([key, definition]) => {
    const view = detailedMetric(key, core[key] || {}, definition)
    if (key === 'physiological_arousal') view.name = definition.name
    if (key === 'attention_focus' && !eyeAvailable(report)) {
      view.score = null; view.level = '未采集'; view.grade = '不建议解释'; view.referenceText = '本次未采集可用于正式解释的眼动数据'
    }
    return view
  })
}

export function screeningMetricViews(report: ReportSource): DetailedMetricView[] {
  const screening = getAt(summaryOf(report), 'clinical_screening', {}) || {}
  return Object.entries(SCREENING_DICTIONARY).map(([key, definition]) => {
    const item = screening[key] || {}
    const view = detailedMetric(key, item, definition)
    view.name = item.name || definition.name
    view.technicalName = `clinical_screening.${key}`
    // 合作方 V3.2 §6.3 明确给出筛查“加权决策分”的三分类阈值：
    // <50 无明显风险；50–<70 需量表确认；≥70 高风险关注。
    // 这不是前端自定义规则，前端仅用于展示接口已有的正式口径。
    view.thresholds = [0, 50, 70, 100]
    view.grade = '方向筛查分类'
    view.referenceText = '0–<50 无明显风险；50–<70 需量表确认；70–100 高风险关注'
    const classification = String(item.classification || '')
    view.riskBand = classification === 'high_attention' ? 'high' : classification === 'low_review' ? 'uncertain' : classification === 'no_obvious_risk' ? 'low' : view.riskBand
    view.weakReference = item.reliability === 'weak_reference'
    view.source = item.source || '方向筛查结果'
    return view
  })
}

/** 报告图形使用的简明标准区间，避免重复展示整套五档阈值。 */
export function standardRangeText(item: DetailedMetricView): string {
  if (item.thresholds.length !== 4) return '本次结果未提供固定数值区间'
  if (item.grade === '方向筛查分类') return '0–<50（无明显风险）'
  const [, b, c] = item.thresholds
  if (item.direction === 'higher_better') return `${b}–100`
  const start = b, end = c
  return `${start}–<${end}`
}

export function hasPartnerThresholds(item: DetailedMetricView): boolean {
  return item.thresholds.length === 4 && item.thresholds.every(Number.isFinite)
}

export function isScreeningRange(item: DetailedMetricView): boolean {
  return item.grade === '方向筛查分类' && hasPartnerThresholds(item)
}

export function resultOverview(report: ReportSource) {
  const metrics = [...coreMetricViews(report), ...screeningMetricViews(report)]
  const attention = metrics.filter(isAttentionMetric)
  const stable = metrics.filter(isStableMetric)
  return { metrics, attention, stable }
}

/**
 * “建议重点查看”判定：优先使用合作方结构化严重程度 level.severity
 * （level_definitions：0=参考范围 1=偏离 2=明显偏离），筛查项用 risk_band；
 * 两者都缺失时才回退到档位文字匹配，避免合作方调整措辞后分组静默失效。
 */
export function isAttentionMetric(item: DetailedMetricView): boolean {
  // 生理唤醒“正常（低负荷）”是安静放松的常态表现，沿既有口径不计入重点关注
  if (item.key === 'physiological_arousal') return false
  if (item.severity != null) return item.severity >= 1
  if (item.riskBand) return item.riskBand === 'high'
  return /偏高|明显偏高|偏低|明显偏低|需.*确认|高风险|关注/.test(item.originalLevel || item.level)
}

/** “本次稳定表现”判定：severity/risk_band 优先，文字兜底。 */
export function isStableMetric(item: DetailedMetricView): boolean {
  if (item.severity != null) return item.severity === 0
  if (item.riskBand) return item.riskBand === 'low' || item.riskBand === 'uncertain'
  return /正常|参考范围|负荷较?低|负荷很低|未见明显风险/.test(item.originalLevel || item.level)
}

/**
 * 数据质量整体判读：只使用合作方 confidence.level/score 字段，
 * 不引入自定义数值区间。仅“低”档（或沿用既有 score<0.6 规则）提示谨慎；
 * “中”档属于正常可用结果，不升级为警示表述。
 */
export function dataQualityVerdict(report: ReportSource): QualityVerdict {
  const confidence = getAt(summaryOf(report), 'confidence', {}) || {}
  const levelKey = String(confidence.level?.key || '')
  const levelLabel = confidence.level?.label ? String(confidence.level.label) : null
  const score = Number(confidence.score)
  const hasConfidence = Boolean(levelKey) || Number.isFinite(score)
  const lowConfidence = levelKey === 'low' || (Number.isFinite(score) && score < 0.6)
  if (!hasConfidence) return { overall: '未提供', lowConfidence: false, levelLabel: null }
  return {
    overall: lowConfidence ? '建议谨慎解释' : '可解释',
    lowConfidence,
    levelLabel,
  }
}

/** 置信度构成项 → 中文归因（只在低置信时解释原因，不展示原始分数） */
const CONFIDENCE_COMPONENT_LABELS: Record<string, string> = {
  video_quality: '画面质量',
  signal_stability: '信号稳定性',
  effective_duration: '有效时长',
  modality_consistency: '证据一致性',
  modality_completeness: '证据完整度',
  history_stability: '结果稳定性',
}

/** 低置信时的主要原因（按合作方构成项从低到高取最弱两项），仅在 lowConfidence 时非空 */
export function confidenceConcerns(report: ReportSource): string[] {
  const verdict = dataQualityVerdict(report)
  if (!verdict.lowConfidence) return []
  const components = getAt(summaryOf(report), 'confidence.components', {}) || {}
  return Object.entries(components)
    .filter(([, value]) => Number.isFinite(Number(value)))
    .sort((a, b) => Number(a[1]) - Number(b[1]))
    .slice(0, 2)
    .map(([key]) => CONFIDENCE_COMPONENT_LABELS[key])
    .filter(Boolean)
}

/** 采集质量卡片（概览页与数据证据页共用同一判读口径） */
export function qualityCards(report: ReportSource): QualityCardView[] {
  const source = report.result?.summary_json
  const overall = dataQualityVerdict(report).overall
  const items = [
    { name: '人脸有效率', value: getAt(source, 'quality.face_valid_ratio', null), percent: true },
    { name: '人脸质量', value: getAt(source, 'quality.face_quality', null), percent: false },
    { name: '运动干扰', value: getAt(source, 'quality.motion_noise_index', null), percent: false },
    { name: '丢帧率', value: getAt(source, 'quality.drop_rate_percent', null), percent: true },
  ]
  return items.map(item => ({
    ...item,
    verdict: item.value == null ? '未提供' : overall === '建议谨慎解释' ? '建议谨慎解释' : '可解释',
  }))
}

/** 总览长解读：只组合合作方正式分数、分类与固定解释，不生成新结论。 */
export function overviewNarrative(report: ReportSource): string[] {
  const core = coreMetricViews(report), screening = screeningMetricViews(report)
  const byKey = (key: string) => [...core, ...screening].find(item => item.key === key)
  const stress = byKey('stress_load'), fatigue = byKey('fatigue_recovery')
  const arousal = byKey('physiological_arousal'), attention = byKey('attention_focus')
  const depression = byKey('depression'), anxiety = byKey('anxiety')
  const result = (item: DetailedMetricView | undefined) => item ? `${item.name}${item.score == null ? '' : displayNumber(item.score)}（${item.level}）` : '未提供'
  return [
    `本次测评的核心心理生理结果为：${result(stress)}，${result(fatigue)}，${result(arousal)}，${result(attention)}。这些结果描述的是测评时段内压力、恢复、生理激活与视觉关注的组合状态，不是对长期人格或能力的直接判定。`,
    `状态解读方面，${attention ? `视觉注意力处于“${attention.level}”档位，用于辅助观察信息获取与注视稳定性` : '视觉注意数据未提供'}；${fatigue ? `疲劳恢复负荷处于“${fatigue.level}”档位，应结合近期睡眠和恢复情况理解` : '疲劳恢复数据未提供'}；${stress ? `压力负荷处于“${stress.level}”档位` : '压力负荷数据未提供'}；${arousal ? `生理唤醒线索处于“${arousal.level}”档位` : '生理唤醒数据未提供'}。`,
    `心理方向筛查方面，${result(depression)}，${result(anxiety)}。筛查结果用于提示是否需要进一步确认，不等同于临床诊断；如后续同类结果持续偏离，建议结合标准量表、专业访谈和近期实际情境复核。本次结果宜作为相近条件下后续复测的对照基线。`,
  ]
}

function scoreText(metric: DetailedMetricView) {
  return metric.score == null ? `${metric.name}为${metric.level}` : `${metric.name}${displayNumber(metric.score)}（${metric.level}）`
}

export function notableEvidence(report: ReportSource) {
  const all = (['rppg', 'eye'] as EvidenceTab[]).flatMap(tab => pageMetrics(report, tab))
  return all.filter(item => item.value !== '—' && /偏高|明显偏高|偏低|明显偏低|关注/.test(item.level))
}

function deterministicPageSummary(report: ReportSource, tab: ReportTab): PageSummary {
  const core = coreMetricViews(report)
  const screening = screeningMetricViews(report)
  const coreText = core.map(scoreText).join('，')
  const screeningText = screening.map(scoreText).join('，')
  if (tab === 'overview') return {
    text: `${screeningText}；${coreText}。`,
    constraint: '本页只汇总本次分析的结果分类和数值；筛查结果不是医学诊断，需结合量表、访谈及实际情况综合判断。',
  }
  if (tab === 'core') return {
    text: `本次核心状态结果为：${coreText}。各项结果的含义、参考区间和解释边界见下方卡片。`,
    constraint: '这些数值反映本次短时测评状态，受测试情境和采集质量影响，不能单独判断稳定人格或岗位胜任。',
  }
  if (tab === 'screening') return {
    text: `本次方向筛查结果为：${screeningText}。若分类提示需要关注，应再结合标准量表、访谈和近期实际情境确认。`,
    constraint: '抑郁、焦虑均为方向筛查而非临床诊断；报告不使用一次视频结果判定是否患病。',
  }
  if (tab === 'evidence') return {
    text: `本页用于确认视频采集质量，并保留面部动作（AU）、微振动（Vibra）、${rppgAvailable(report) ? '可用的生理节律估计（rPPG）' : '未达到解释条件的生理节律估计'}与${eyeAvailable(report) ? '眼动注意' : '未采集的眼动状态'}等评估依据。底层证据只用于结果追溯，不单独形成心理风险结论。`,
    constraint: '面部动作、微振动、生理节律估计与眼动线索均为辅助证据；单项偏高或偏低不等同于心理风险，也不能取代核心结果分类。',
  }
  return {
    text: '本页暂无可展示内容。',
    constraint: '本报告不自动判断岗位胜任或疾病。',
  }
}
export function pageSummary(report: ReportSource, tab: ReportTab): PageSummary {
  // 面向被测者与管理人员的页面只使用固定、可解释的表达，避免把模型字段名或内部处理说明带到报告中。
  return deterministicPageSummary(report, tab)
}

/** 建议与下一步：与首页“建议重点查看”共用同一套结构化判定（isAttentionMetric），保证三处结论一致。 */
export function managementActions(report: ReportSource) {
  const hasAttention = resultOverview(report).attention.length > 0
  const actions = [
    hasAttention
      ? '优先安排人工复核，结合量表、访谈与近期情境确认风险。'
      : '当前未见需立即升级的筛查结论，建议结合日常状态持续观察。',
  ]
  actions.push(
    dataQualityVerdict(report).lowConfidence
      ? '本次证据置信度较低，建议改善光照、姿态与录制稳定性后复测。'
      : '保留本次记录作为基线，在相近条件下进行后续复测对照。',
  )
  if (!eyeAvailable(report)) actions.push('眼动未采集，本报告不对视觉注意力作推断。')
  return actions
}
