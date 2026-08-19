import type { AssessmentDetail } from '@/types/assessment'
import type { MetricView, PageSummary, ReportTab, ReportTabDefinition } from '@/types/report'
import { displayNumber, displayPercent, getAt } from './formatters'

type Json = Record<string, any>
const tabKey = (tab: Exclude<ReportTab, 'overview'>) => tab === 'eye' ? 'eye_tracking' : tab
const summaryOf = (report: AssessmentDetail) => (report.result?.summary_json || {}) as Json
const timelineOf = (report: AssessmentDetail) => (report.result?.timeline_json || {}) as Json

export const REPORT_TABS: ReportTabDefinition[] = [
  { key: 'overview', label: '综合概览', kicker: 'Page 01 · Multimodal Overview', title: '心理生理状态总览', hint: '呈现筛查结果、当前状态和证据质量；所有结果均为辅助线索，不替代临床诊断。' },
  { key: 'au', label: 'AU 面部动作', kicker: 'Page 02 · Facial Action Units', title: 'AU 面部动作', hint: '展示面部动作指标、代表性语义标注图和候选时间点，不把局部动作直接解释为心理诊断。' },
  { key: 'rppg', label: 'rPPG 生理节律', kicker: 'Page 03 · Physiological Rhythm', title: 'rPPG 生理节律', hint: '展示质量门控后的心率、HRV 与信号质量；质量不足时不补算、不强行解释。' },
  { key: 'vibra', label: 'Vibra 微振动', kicker: 'Page 04 · Micro-vibration', title: 'Vibra 微振动', hint: '展示聚合状态线索与 Formal 12 分段统计，单项特征不直接翻译为确定心理结论。' },
  { key: 'eye', label: '眼动注意', kicker: 'Page 05 · Gaze Evidence', title: '眼动注意力', hint: '展示视频级注视线索；它不是经过屏幕校准的专业眼动仪结果。' },
]

const SPECS: Record<Exclude<ReportTab, 'overview'>, Array<[string, string, string?]>> = {
  au: [['micro_expression_event_rate_per_min', 'AU 事件率', 'au_event_rate_per_min'], ['au_event_peak_intensity', 'AU 峰值强度', 'au_activity_score'], ['au_tension_event_rate_per_min', 'AU 紧张事件率', 'tension_au_score'], ['au_low_activity_score', '低活动比例'], ['facial_variability', '面部变化幅度', 'au_variability_score']],
  rppg: [['hr_interval', '心率区间'], ['hr_range', '心率变幅'], ['hrv_rmssd_ms', 'RMSSD'], ['hrv_sdnn_ms', 'SDNN'], ['signal_quality', '信号质量'], ['motion_noise_index', '运动干扰'], ['light_noise_index', '光照干扰']],
  vibra: [['vibra_positive_score', '正向状态线索'], ['vibra_negative_score', '负向状态线索'], ['vibra_body_score', '身体/生理调节线索']],
  eye: [['attention_focus_score', '视觉专注度'], ['attention_stability_score', '注意稳定性'], ['gaze_valid_ratio', '有效眼动比例'], ['aoi_center_dwell_ratio', '中心关注比例'], ['fixation_ratio', '注视停留比例'], ['gaze_entropy', '视线离散度'], ['gaze_x_range', '水平移动范围'], ['gaze_y_range', '垂直移动范围']],
}
const FORMAL_KEYS = ['happiness', 'confidence', 'stress', 'unrest', 'suspicion', 'depression', 'energy', 'balance', 'self_regulation', 'reaction', 'neuroticism', 'aggression']

function group(report: AssessmentDetail, tab: Exclude<ReportTab, 'overview'>): Json {
  return getAt(summaryOf(report), `small_indicators.${tabKey(tab)}`, {}) || {}
}
function metric(source: Json, keys: string[], name: string): MetricView {
  const raw = keys.map(key => source[key]).find(value => value != null)
  const item = raw && typeof raw === 'object' ? raw : { value: raw }
  const value = item?.value ?? item?.raw_value ?? item?.mean ?? item?.score_0_100 ?? item?.score
  const unit = item?.unit || ''
  return { key: keys[0], name, value: unit === 'ratio' || unit === 'prob' ? displayPercent(value) : displayNumber(value), level: item?.level?.label || item?.classification_label || item?.grade_label || '未提供', unit }
}
export function pageMetrics(report: AssessmentDetail, tab: Exclude<ReportTab, 'overview'>): MetricView[] {
  const source = group(report, tab)
  return SPECS[tab].map(([key, name, fallback]) => metric(source, [key, fallback].filter(Boolean) as string[], name))
}
export function unitLabel(unit?: string) { return ({ bpm: 'bpm', bpm_range: 'bpm', ms: 'ms', 'breaths/min': '次/分', 'events/min': '次/分', '0-1': '0–1', score: '分', '%': '%' } as Record<string, string>)[unit || ''] || unit || '合作方专业数据' }

export function qwenPages(report: AssessmentDetail): Record<string, { summary: string; constraint: string }> | null {
  try { const parsed = JSON.parse(report.result?.qwen_report || ''); return parsed?.schema_version === 'qwen_page_summaries_v1' ? parsed.pages : null } catch { return null }
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
  const states = [['stress_load', '压力/唤醒负荷'], ['fatigue_recovery', '疲劳/恢复负荷'], ['physiological_arousal', '生理唤醒线索'], ['attention_focus', '视觉注意力']].map(([key, name]) => { const item = state[key] || core[key] || {}; return { key, name, value: item.classification_label || item.grade_label || getAt(item, 'level.label', '待分析'), score: item.grade_source_score ?? item.raw_score ?? item.score ?? null } })
  return [...screens, ...states]
}
export function pageSummary(report: AssessmentDetail, tab: ReportTab): PageSummary {
  const ai = qwenPages(report)?.[tab]; if (ai?.summary && ai?.constraint) return { text: ai.summary, constraint: ai.constraint }
  if (tab === 'rppg' && !rppgAvailable(report)) return { text: '本次视频的生理节律信号未达到可靠展示条件，因此不对心率或心率变异性作结果解释。', constraint: `不可用原因：${rppgReasons(report) || '有效窗口或信号质量不足'}。不补算、不推测缺失数据。` }
  if (tab === 'eye' && !eyeAvailable(report)) return { text: '本次测评未采集到可用于正式解释的眼动数据，因此不对视觉注意力作判断。', constraint: '未采集即不推测；本页保留状态说明，避免将摄像头画面误当作专业眼动仪结果。' }
  const name = ({ overview: '综合状态', au: '面部动作', rppg: '生理节律', vibra: '微振动', eye: '视觉注意' } as Record<ReportTab, string>)[tab]
  return { text: `本页汇总了本次测评的${name}数据，请结合下方专业指标、数据质量与测试情境综合查看。`, constraint: '本摘要仅概括本页已有数据，不新增指标、不作疾病诊断，也不替代专业人员判断。' }
}
export function managementActions(report: AssessmentDetail) { const labels = overviewCards(report).map(item => String(item.value)).join('|'); const actions = [/高风险|明显偏高|需.*确认|关注/.test(labels) ? '优先安排人工复核，结合量表、访谈与近期情境确认风险。' : '当前未见需立即升级的筛查结论，建议结合日常状态持续观察。']; const confidence = getAt(summaryOf(report), 'confidence.score', null); actions.push(confidence != null && Number(confidence) < .6 ? '本次证据置信度较低，建议改善光照、姿态与录制稳定性后复测。' : '保留本次记录作为基线，在相近条件下进行后续复测对照。'); if (!eyeAvailable(report)) actions.push('眼动未采集，本报告不对视觉注意力作推断。'); return actions }
