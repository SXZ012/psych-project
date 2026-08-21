import type { AssessmentDetail } from '@/types/assessment'
import { CORE_METRIC_DICTIONARY, SCREENING_DICTIONARY } from '@/data/metricDictionary'
import type { DetailedMetricView, EvidenceTab, MetricView, PageSummary, ReportTab, ReportTabDefinition } from '@/types/report'
import { displayNumber, displayPercent, getAt } from './formatters'

type Json = Record<string, any>
const tabKey = (tab: EvidenceTab) => tab === 'eye' ? 'eye_tracking' : tab
const summaryOf = (report: AssessmentDetail) => (report.result?.summary_json || {}) as Json
const timelineOf = (report: AssessmentDetail) => (report.result?.timeline_json || {}) as Json

export const REPORT_TABS: ReportTabDefinition[] = [
  { key: 'overview', label: '综合概览', kicker: 'Page 01 · Result Overview', title: '本次测评结果总览', hint: '先回答数据是否有效、哪些结果正常、哪些结果值得进一步关注。' },
  { key: 'screening', label: '方向筛查', kicker: 'Page 02 · Screening', title: '抑郁与焦虑方向筛查', hint: '展示合作方筛查分数、分类、置信度和使用限制；筛查不等于诊断。' },
  { key: 'core', label: '核心状态', kicker: 'Page 03 · Core State', title: '航空运行相关状态', hint: '逐项解释压力、疲劳、生理唤醒与视觉注意，并标明合作方档位和标准值区间。' },
  { key: 'evidence', label: '数据证据', kicker: 'Page 04 · Data Evidence', title: '数据质量与辅助证据', hint: '展示采集质量、可用的生理节律与视觉注意证据，并说明解释边界。' },
]

function displayResultLabel(key:string, raw:unknown, severity?:unknown) {
  const label = String(raw || '未提供')
  const lowRisk = Number(severity) === 0 || /参考范围|无明显风险/.test(label)
  if (key === 'physiological_arousal' && (lowRisk || /负荷较低|偏低/.test(label))) return '正常（低负荷）'
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

function group(report: AssessmentDetail, tab: EvidenceTab): Json {
  return getAt(summaryOf(report), `small_indicators.${tabKey(tab)}`, {}) || {}
}
function metric(source: Json, keys: string[], name: string): MetricView {
  const raw = keys.map(key => source[key]).find(value => value != null)
  const item = raw && typeof raw === 'object' ? raw : { value: raw }
  const value = item?.value ?? item?.raw_value ?? item?.mean ?? item?.score_0_100 ?? item?.score
  const unit = item?.unit || ''
  const rawLevel=item?.level?.label || item?.classification_label || item?.grade_label || '未提供'
  return { key: keys[0], name, value: unit === 'ratio' || unit === 'prob' ? displayPercent(value) : displayNumber(value), level: displayResultLabel(keys[0],rawLevel,item?.level?.severity), unit }
}
export function pageMetrics(report: AssessmentDetail, tab: EvidenceTab): MetricView[] {
  const source = group(report, tab)
  return SPECS[tab].map(([key, name, fallback]) => metric(source, [key, fallback].filter(Boolean) as string[], name))
}
export function unitLabel(unit?: string) { return ({ bpm: 'bpm', bpm_range: 'bpm', ms: 'ms', 'breaths/min': '次/分', 'events/min': '次/分', '0-1': '0–1', score: '分', '%': '%' } as Record<string, string>)[unit || ''] || unit || '合作方专业数据' }

export function qwenPages(report: AssessmentDetail): Record<string, { summary: string; constraint: string }> | null {
  try { const parsed = JSON.parse(report.result?.qwen_report || ''); return ['qwen_page_summaries_v1','qwen_page_summaries_v2'].includes(parsed?.schema_version) ? parsed.pages : null } catch { return null }
}
export function rppgAvailable(report: AssessmentDetail) {
  const summary = summaryOf(report), timeline = timelineOf(report)
  const value = getAt(timeline, 'display_payload.rppg_waveforms.quality_gate.physiology_available', getAt(summary, 'rppg_quality_gate.physiology_available', getAt(summary, 'quality.rppg_window_usable', null)))
  return value === true || (value == null && pageMetrics(report, 'rppg').some(item => item.value !== '—'))
}
export function rppgReasons(report: AssessmentDetail) {
  const gate = getAt(summaryOf(report), 'rppg_quality_gate', {}) || {}
  const reasons = gate.unavailable_reasons || gate.reasons || []
  return Array.isArray(reasons) ? reasons.filter(Boolean).join('；') : String(reasons || '')
}
export function eyeData(report: AssessmentDetail): Json { return getAt(timelineOf(report), 'display_payload.eye_tracking', {}) || {} }
export function eyeAvailable(report: AssessmentDetail) {
  const eye = eyeData(report), small = group(report, 'eye')
  const status = eye.status || getAt(summaryOf(report), 'modules.eye_tracking.status', getAt(summaryOf(report), 'quality.eye_tracking_status', ''))
  return !/not_collected|unavailable|missing/i.test(String(status)) && (!!eye.metrics || (Array.isArray(eye.gaze_points) && eye.gaze_points.length > 0) || Object.keys(small).length > 0)
}
export function auVisual(report: AssessmentDetail): Json { return getAt(summaryOf(report), 'modules.au.visualization', {}) || {} }
export function auVisualImageUrl(report: AssessmentDetail): string {
  const visual = auVisual(report), source = String(visual.image_url || '')
  if (source.startsWith('data:')) return source
  return source || visual.image_url_file_id != null
    ? `/api/v1/assessments/${report.id}/au-image`
    : ''
}
export function auCandidates(report: AssessmentDetail): Json[] { const items = getAt(timelineOf(report), 'display_payload.au_event_frames.candidate_frames', []); return Array.isArray(items) ? items.slice(0, 6) : [] }
export function rppgCharts(report: AssessmentDetail) {
  const waveforms = getAt(timelineOf(report), 'display_payload.rppg_waveforms.waveforms', {}) || {}
  return [['hr_avg', '平均心率'], ['hrv_rmssd_ms', 'RMSSD 趋势'], ['signal_quality', '信号质量']].map(([key, name]) => { const item = waveforms[key] || {}; const range = item.range || {}; const series = item.value_series || item.score_series || []; return { key, name, series: Array.isArray(series) ? series : [], range: range.min != null && range.max != null ? `${displayNumber(range.min)}–${displayNumber(range.max)}` : '—' } })
}
export function sparkline(series: unknown[], width = 320, height = 70) {
  const values = series.map(item => Number(item && typeof item === 'object' ? (item as Json).value : item)).filter(Number.isFinite)
  if (values.length < 2) return ''
  const min = Math.min(...values), max = Math.max(...values), span = max - min || 1
  return values.map((value, index) => `${(index / (values.length - 1) * width).toFixed(1)},${(height - 4 - ((value - min) / span) * (height - 8)).toFixed(1)}`).join(' ')
}
export function formalRows(report: AssessmentDetail) {
  const raw = getAt(timelineOf(report), 'display_payload.vibra_formal12_ranges.indicators', {}) || {}
  return FORMAL_KEYS.map((key, index) => raw[key] ? { key, index: index + 1, range: raw[key].range || {} } : null).filter(Boolean) as Array<{ key: string; index: number; range: Json }>
}
export function formalStatus(report: AssessmentDetail) {
  const status = getAt(summaryOf(report), 'formal_segment_status', {}) || {}
  return status.clinical_eligible === true ? `可解释 · ${status.segment_count || 0} 段` : status.segment_count != null ? `仅趋势 · ${status.segment_count} 段` : '状态待确认'
}
export function heatCells(report: AssessmentDetail): number[] { const heat = eyeData(report).heatmap; return Array.isArray(heat) ? (heat as any[]).flat(Infinity).slice(0, 144).map(Number) : [] }
export function heatColor(value: unknown) { const n = Math.max(0, Math.min(1, Number(value) || 0)); return `hsla(${205 - n * 165},85%,${92 - n * 42}%,${.45 + n * .55})` }
export function eyePointCount(report: AssessmentDetail) { const points = eyeData(report).gaze_points; return Array.isArray(points) ? points.length : 0 }

export function overviewCards(report: AssessmentDetail) {
  const result = report.result, summary = summaryOf(report), screening = getAt(summary, 'clinical_screening', {}) || {}, state = getAt(summary, 'product_logic_summary.state_severity', {}) || {}, core = getAt(summary, 'core_indicators', {}) || {}
  const screens = [{ key: 'depression', name: '抑郁方向筛查', result: result?.depression_label || result?.depression_classification, score: result?.depression_score }, { key: 'anxiety', name: '焦虑方向筛查', result: result?.anxiety_label || result?.anxiety_classification, score: result?.anxiety_score }].map(def => { const item = screening[def.key] || {}; return { ...def, value: def.result || item.classification_label || item.screening_result || '待分析', score: def.score ?? item.score ?? (item.probability != null ? Number(item.probability) * 100 : null) } })
  const states = [['stress_load', '压力负荷'], ['fatigue_recovery', '疲劳/恢复负荷'], ['physiological_arousal', '生理唤醒线索'], ['attention_focus', '视觉注意力']].map(([key, name]) => { const item = state[key] || core[key] || {}; const raw=item.classification_label || item.grade_label || getAt(item, 'level.label', '待分析'); return { key, name, value: displayResultLabel(key, raw, item.level?.severity), score: item.grade_source_score ?? item.raw_score ?? item.score ?? null } })
  return [...screens, ...states]
}

function thresholdText(thresholds: number[], direction: 'higher_load'|'higher_better') {
  if (thresholds.length !== 4) return '合作方当前结果未提供固定数值分档，以返回档位为准'
  const [a,b,c,d] = thresholds.map(Number)
  const labels = direction === 'higher_better'
    ? ['低','偏低','正常（第3档）','正常（第4档）','正常（第5档）']
    : ['明显偏低','偏低','参考范围','偏高','明显偏高']
  return `<${a} ${labels[0]}；${a}–<${b} ${labels[1]}；${b}–<${c} ${labels[2]}；${c}–<${d} ${labels[3]}；≥${d} ${labels[4]}`
}

function detailedMetric(key:string, item:Json, definition:typeof CORE_METRIC_DICTIONARY[string]):DetailedMetricView {
  const thresholds = Array.isArray(item.grade_thresholds) ? item.grade_thresholds.map(Number).filter(Number.isFinite) : []
  const score = item.grade_source_score ?? item.raw_score ?? item.score
  const reference = item.reference_range || item.audit?.reference_range || {}
  const n = Number(reference.n)
  const weakReference = item.reliability === 'weak_reference' || (Number.isFinite(n) && n < Number(reference.weak_reference_min_n || 20))
  const originalLevel=item.classification_label || item.grade_label || item.level?.label || '未提供'
  return {
    key, name:item.name || definition.name, technicalName:key, score:Number.isFinite(Number(score)) ? Number(score) : null,
    level:displayResultLabel(key, originalLevel, item.level?.severity), originalLevel, grade:item.grade_display || (item.grade_1_5 ? `${item.grade_1_5}档` : '未提供'),
    thresholds, referenceText:thresholdText(thresholds, definition.direction), definition:item.interpretation || definition.plainMeaning,
    plainMeaning:definition.plainMeaning, aviationMeaning:definition.aviationMeaning, limitation:definition.limitation,
    recommendation:definition.recommendation, confidence:item.classification_confidence_label || item.confidence?.level?.label || '未提供',
    direction:definition.direction, source:item.source || reference.source || '合作方结构化结果', weakReference,
  }
}

export function coreMetricViews(report:AssessmentDetail):DetailedMetricView[] {
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

export function screeningMetricViews(report:AssessmentDetail):DetailedMetricView[] {
  const screening = getAt(summaryOf(report), 'clinical_screening', {}) || {}
  return Object.entries(SCREENING_DICTIONARY).map(([key, definition]) => {
    const item = screening[key] || {}
    const view = detailedMetric(key, item, definition)
    view.name = item.name || definition.name
    view.technicalName = `clinical_screening.${key}`
    // 筛查结果没有“第几档”的概念；置信度由卡片单独展示，避免出现
    // “置信度中 · 置信度中”这样的重复文案。
    view.grade = '合作方筛查分类'
    view.referenceText = '<50 无明显风险；50–70 需量表确认；≥70 高风险关注（70分边界及最终分类以合作方接口返回为准）'
    view.weakReference = item.reliability === 'weak_reference'
    view.source = item.source || '合作方临床方向筛查层'
    return view
  })
}

/** 报告图形使用的简明标准区间，避免重复展示整套五档阈值。 */
export function standardRangeText(item:DetailedMetricView):string {
  if (item.key === 'depression' || item.key === 'anxiety') return '0–<50'
  const [,b,c] = item.thresholds
  if (item.direction === 'higher_better') return `${Number.isFinite(b) ? b : 45}–100`
  const start = Number.isFinite(b) ? b : 35, end = Number.isFinite(c) ? c : 55
  return `${start}–<${end}`
}

export function resultOverview(report:AssessmentDetail) {
  const metrics = [...coreMetricViews(report), ...screeningMetricViews(report)]
  const attention = metrics.filter(item => item.key !== 'physiological_arousal' && /偏高|明显偏高|偏低|明显偏低|需.*确认|高风险|关注/.test(item.level))
  const stable = metrics.filter(item => /正常/.test(item.level))
  return { metrics, attention, stable }
}

/** 总览长解读：只组合合作方正式分数、分类与固定解释，不生成新结论。 */
export function overviewNarrative(report:AssessmentDetail):string[] {
  const core = coreMetricViews(report), screening = screeningMetricViews(report)
  const byKey = (key:string) => [...core, ...screening].find(item => item.key === key)
  const stress = byKey('stress_load'), fatigue = byKey('fatigue_recovery')
  const arousal = byKey('physiological_arousal'), attention = byKey('attention_focus')
  const depression = byKey('depression'), anxiety = byKey('anxiety')
  const result = (item:DetailedMetricView|undefined) => item ? `${item.name}${item.score == null ? '' : displayNumber(item.score)}（${item.level}）` : '未提供'
  return [
    `本次测评的核心心理生理结果为：${result(stress)}，${result(fatigue)}，${result(arousal)}，${result(attention)}。这些结果描述的是测评时段内压力、恢复、生理激活与视觉关注的组合状态，不是对长期人格或飞行能力的直接判定。`,
    `从航空任务关注点看，${attention ? `视觉注意力处于“${attention.level}”档位，用于辅助观察持续监控、信息获取和注视稳定性` : '视觉注意数据未提供'}；${fatigue ? `疲劳恢复负荷处于“${fatigue.level}”档位，应结合近期睡眠、连续值勤和恢复情况理解` : '疲劳恢复数据未提供'}；${stress ? `压力负荷处于“${stress.level}”档位` : '压力负荷数据未提供'}；${arousal ? `生理唤醒线索处于“${arousal.level}”档位` : '生理唤醒数据未提供'}。`,
    `心理方向筛查方面，${result(depression)}，${result(anxiety)}。筛查结果用于提示是否需要进一步确认，不等同于临床诊断；如后续同类结果持续偏离，建议结合标准量表、专业访谈和近期实际情境复核。本次结果宜作为相近条件下后续复测的对照基线。`,
  ]
}

function scoreText(metric:DetailedMetricView) {
  return metric.score == null ? `${metric.name}为${metric.level}` : `${metric.name}${displayNumber(metric.score)}（${metric.level}）`
}

export function notableEvidence(report:AssessmentDetail) {
  const all = (['rppg','eye'] as EvidenceTab[]).flatMap(tab => pageMetrics(report, tab))
  return all.filter(item => item.value !== '—' && /偏高|明显偏高|偏低|明显偏低|关注/.test(item.level))
}

function deterministicPageSummary(report:AssessmentDetail, tab:ReportTab):PageSummary {
  const core = coreMetricViews(report)
  const screening = screeningMetricViews(report)
  const coreText = core.map(scoreText).join('，')
  const screeningText = screening.map(scoreText).join('，')
  if (tab === 'overview') return {
    text: `${screeningText}；${coreText}。`,
    constraint: '本页只汇总合作方返回的分类和数值；筛查结果不是医学诊断，需结合量表、访谈及实际情况综合判断。',
  }
  if (tab === 'core') return {
    text: `本次核心状态结果为：${coreText}。各项结果的含义、标准值区间和航空场景边界见下方卡片。`,
    constraint: '这些数值反映本次短时测评状态，受测试情境和采集质量影响，不能单独判断稳定人格或岗位胜任。',
  }
  if (tab === 'screening') return {
    text: `本次方向筛查结果为：${screeningText}。若分类提示需要关注，应再结合标准量表、访谈和近期实际情境确认。`,
    constraint: '抑郁、焦虑均为方向筛查而非临床诊断；报告不使用一次视频结果判定是否患病。',
  }
  if (tab === 'evidence') return {
    text: `本页用于确认视频采集质量，并保留AU面部动作、Vibra微振动、${rppgAvailable(report) ? '可用的rPPG生理节律' : '未达到解释条件的rPPG状态'}与${eyeAvailable(report) ? '眼动注意' : '未采集的眼动状态'}等算法依据。底层证据只用于结果追溯，不单独形成心理风险结论。`,
    constraint: 'AU、Vibra、rPPG与眼动代理均为辅助证据；单项偏高或偏低不等同于心理风险，也不能覆盖合作方核心分类。',
  }
  return {
    text: '本页暂无可展示内容。',
    constraint: '本报告不自动判断适航、岗位胜任或疾病。',
  }
}
export function pageSummary(report: AssessmentDetail, tab: ReportTab): PageSummary {
  const ai = qwenPages(report)?.[tab]; if (ai?.summary && ai?.constraint) return { text: ai.summary.replaceAll('参考范围','正常').replaceAll('无明显风险','正常'), constraint: ai.constraint }
  return deterministicPageSummary(report, tab)
}
export function managementActions(report: AssessmentDetail) { const labels = overviewCards(report).map(item => String(item.value)).join('|'); const actions = [/高风险|明显偏高|需.*确认|关注/.test(labels) ? '优先安排人工复核，结合量表、访谈与近期情境确认风险。' : '当前未见需立即升级的筛查结论，建议结合日常状态持续观察。']; const confidence = getAt(summaryOf(report), 'confidence.score', null); actions.push(confidence != null && Number(confidence) < .6 ? '本次证据置信度较低，建议改善光照、姿态与录制稳定性后复测。' : '保留本次记录作为基线，在相近条件下进行后续复测对照。'); if (!eyeAvailable(report)) actions.push('眼动未采集，本报告不对视觉注意力作推断。'); return actions }
