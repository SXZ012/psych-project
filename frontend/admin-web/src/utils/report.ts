/**
 * 管理端报告工具：共享映射层（frontend/shared/report-kit）的转发 + 管理端专属可视化。
 *
 * 分数、等级、阈值、分组、质量判读等口径全部来自共享层——终端个人报告与
 * 本管理端因此使用同一份实现；本文件只保留管理端才需要的部分：
 * Qwen 页摘要、AU 标注图地址/候选帧、rPPG 波形图、热力图等原始证据可视化。
 * 这些内容依赖管理端鉴权接口与完整 timeline，绝不进入终端个人视图。
 */
import type { AssessmentDetail } from '@/types/assessment'
import { displayNumber } from '@/utils/formatters'
import { getAt } from '@/utils/formatters'

// ── 共享层转发（两端同口径） ──
export {
  REPORT_TABS,
  coreMetricViews,
  screeningMetricViews,
  pageMetrics,
  unitLabel,
  rppgAvailable,
  rppgReasons,
  eyeAvailable,
  overviewCards,
  standardRangeText,
  hasPartnerThresholds,
  isScreeningRange,
  resultOverview,
  isAttentionMetric,
  isStableMetric,
  dataQualityVerdict,
  confidenceConcerns,
  qualityCards,
  overviewNarrative,
  notableEvidence,
  pageSummary,
  managementActions,
} from '../../../shared/report-kit/mapping'
export type { ReportTabDefinition } from '../../../shared/report-kit/mapping'

// ── 管理端专属（依赖鉴权接口或完整 timeline 的原始证据可视化） ──

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = Record<string, any>
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const summaryOf = (report: AssessmentDetail) => (report.result?.summary_json || {}) as Json
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const timelineOf = (report: AssessmentDetail) => (report.result?.timeline_json || {}) as Json

export function qwenPages(report: AssessmentDetail): Record<string, { summary: string; constraint: string }> | null {
  try { const parsed = JSON.parse(report.result?.qwen_report || ''); return ['qwen_page_summaries_v1', 'qwen_page_summaries_v2'].includes(parsed?.schema_version) ? parsed.pages : null } catch { return null }
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
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function eyeData(report: AssessmentDetail): Json { return getAt(timelineOf(report), 'display_payload.eye_tracking', {}) || {} }
export function heatCells(report: AssessmentDetail): number[] { const heat = eyeData(report).heatmap; return Array.isArray(heat) ? (heat as any[]).flat(Infinity).slice(0, 144).map(Number) : [] }
export function heatColor(value: unknown) { const n = Math.max(0, Math.min(1, Number(value) || 0)); return `hsla(${205 - n * 165},85%,${92 - n * 42}%,${.45 + n * .55})` }
export function eyePointCount(report: AssessmentDetail) { const points = eyeData(report).gaze_points; return Array.isArray(points) ? points.length : 0 }
export function formalRows(report: AssessmentDetail) {
  const FORMAL_KEYS = ['happiness', 'confidence', 'stress', 'unrest', 'suspicion', 'depression', 'energy', 'balance', 'self_regulation', 'reaction', 'neuroticism', 'aggression']
  const raw = getAt(timelineOf(report), 'display_payload.vibra_formal12_ranges.indicators', {}) || {}
  return FORMAL_KEYS.map((key, index) => raw[key] ? { key, index: index + 1, range: raw[key].range || {} } : null).filter(Boolean) as Array<{ key: string; index: number; range: Json }>
}
