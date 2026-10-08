/**
 * 共享报告类型（admin-web 与 terminal-web 共用的唯一类型源）。
 *
 * ReportSource 是"报告数据源"的结构化输入：管理员网页传完整的
 * AssessmentDetail（含全量 summary/timeline），终端个人视图传后端
 * 白名单子集——两者结构兼容，同一套映射代码产出同一口径的展示视图。
 * 共享层绝不访问 id/URL/文件路径类字段，从结构上杜绝管理端专属内容
 * （AU 图地址、原始波形、候选帧）进入终端。
 */
export type ReportTab = 'overview' | 'screening' | 'core' | 'evidence'
export type EvidenceTab = 'au' | 'rppg' | 'vibra' | 'eye'

export interface PageSummary { text: string; constraint: string }

export interface MetricView { key: string; name: string; value: string; level: string; unit?: string }

export interface DetailedMetricView {
  key: string; name: string; technicalName: string; score: number | null; level: string; grade: string
  thresholds: number[]; referenceText: string; definition: string; plainMeaning: string
  aviationMeaning: string; limitation: string; recommendation: string; confidence: string
  direction: 'higher_load' | 'higher_better'; source: string; weakReference: boolean
  originalLevel?: string
  /** 合作方结构化严重程度：0=参考范围 1=偏离 2=明显偏离；缺失为 null */
  severity?: number | null
  /** 合作方筛查风险档：low/uncertain/high/unavailable；仅筛查项提供 */
  riskBand?: string | null
}

export interface ReportResultSource {
  algorithm_version?: string | null
  summary_json?: Record<string, any> | null
  timeline_json?: Record<string, any> | null
  qwen_report?: string | null
  overall_score?: number | null
  overall_level_label?: string | null
  depression_classification?: string | null
  depression_label?: string | null
  depression_score?: number | null
  anxiety_classification?: string | null
  anxiety_label?: string | null
  anxiety_score?: number | null
}

export interface ReportSource {
  scene?: 'aviation' | 'community'
  /** 仅供管理端 URL 构造使用；共享映射层不读取 */
  id?: string
  created_at?: string | null
  submitted_at?: string | null
  status?: string
  result_valid?: boolean | null
  result?: ReportResultSource | null
}

export interface QualityVerdict {
  overall: '可解释' | '建议谨慎解释' | '未提供'
  /** 置信度不足（合作方档位为低，或沿用既有 score<0.6 规则） */
  lowConfidence: boolean
  levelLabel: string | null
}

export interface QualityCardView { name: string; value: number | null; percent: boolean; verdict: '可解释' | '建议谨慎解释' | '未提供' }

export interface MetricDefinition {
  name: string
  plainMeaning: string
  aviationMeaning: string
  limitation: string
  recommendation: string
  direction: 'higher_load' | 'higher_better'
}

/** 等级标签 → 语义色调（success/warning/danger/neutral）；两端使用同一规则 */
export type StatusTone = 'success' | 'warning' | 'danger' | 'neutral'
