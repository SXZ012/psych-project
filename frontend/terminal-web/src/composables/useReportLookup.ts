/**
 * 报告查询：凭证输入 → 状态查询 →（完成后）报告查看。
 *
 * - 查询码只经 POST body 提交，绝不进 URL 查询参数；
 * - 轮询 5s → 10s 退避封顶 30s；组件卸载/离开页面立即停止（clearTimers）；
 * - 错误统一化：凭证无效/记录不存在/已撤销返回同一文案，不泄露存在性；
 * - v2 报告载荷 = 后端"个人安全报告视图"（白名单子集）；
 *   toReportSource() 把它适配为共享映射层（frontend/shared/report-kit）
 *   的输入——终端四页报告与管理员网页因此使用同一份映射与口径；
 * - 退出（exit()）清空全部状态：编号、查询码与报告内容不留在内存。
 */
import { onBeforeUnmount, ref } from 'vue'
import { MESSAGES } from '../aviation/messages.ts'
import type { ReportSource } from '../../../shared/report-kit/types.ts'

export type LookupStatus = 'processing' | 'completed' | 'needs_attention' | 'invalid'

/** v1 最小指标（兼容保留；v2 终端不再使用） */
export interface ReportIndicator {
  key: string
  label: string
  value: number | null
  unit: string
  source: string
  level_label: string | null
  reference: unknown
}

/** 后端个人安全报告视图（personal-report-v2）载荷 */
export interface ReportPayload {
  template_version: string
  submitted_at: string | null
  completed_at: string | null
  result_valid: boolean | null
  capture: {
    duration_seconds: number | null
    effective_duration_seconds: number | null
    video_qa_ok: boolean | null
  }
  review: { review_status: string; reviewed: boolean }
  disclaimer: string
  /** result 顶层的筛查分数/标签（与管理员报告总览同源） */
  result_subset: {
    overall_score?: number | null
    overall_level_label?: string | null
    depression_score?: number | null
    depression_label?: string | null
    depression_classification?: string | null
    anxiety_score?: number | null
    anxiety_label?: string | null
    anxiety_classification?: string | null
  }
  /** summary_json 的白名单子集：共享映射层的直接输入 */
  summary_subset: Record<string, unknown>
  /** v1 兼容字段（可缺省） */
  indicators?: ReportIndicator[]
  advice?: { needs_review_attention: boolean; review_note: string | null }
}

export interface LookupResult {
  status: LookupStatus
  /** 处理中阶段的用户文案（两档：已提交，正在处理 / 报告生成中） */
  stage_label: string | null
  submitted_at: string | null
  expected_minutes: number[]
  report?: ReportPayload
}

export type LookupError = 'invalid' | 'rate_limited' | 'network'

const VIEW_URL = '/api/v1/reports/view'
const VIEW_BY_ID_URL = '/api/v1/reports/view-by-id'
const POLL_START_MS = 5_000
const POLL_MAX_MS = 30_000

/**
 * 个人视图载荷 → 共享映射层输入。
 * 终端与管理员网页从此共用同一份分数/等级/解释实现（@report-kit/mapping）；
 * 本函数不添加、不计算任何指标。
 */
export function toReportSource(payload: ReportPayload): ReportSource {
  return {
    submitted_at: payload.submitted_at,
    status: 'completed',
    result_valid: payload.result_valid,
    result: {
      ...payload.result_subset,
      summary_json: payload.summary_subset as Record<string, unknown> | null,
      // 终端个人视图不含原始 timeline（波形/热图/候选帧为管理端专属）
      timeline_json: null,
    },
  }
}

export function useReportLookup(fetchImpl: typeof fetch = fetch) {
  const loading = ref(false)
  const error = ref<LookupError | null>(null)
  const result = ref<LookupResult | null>(null)
  const submittedCode = ref<string | null>(null)   // 会话内存留；exit() 清空
  const submittedSubjectId = ref<string | null>(null)
  const elapsedMs = ref(0)
  let pollTimer: number | null = null
  let pollInterval = POLL_START_MS
  let startedAt = 0

  function clearPoll() {
    if (pollTimer !== null) { window.clearTimeout(pollTimer); pollTimer = null }
  }

  /** 查询（POST body 携带凭证；响应含状态，完成时含报告载荷） */
  async function lookup(subjectId: string, accessCode: string): Promise<boolean> {
    clearPoll()
    error.value = null
    loading.value = true
    try {
      const response = await fetchImpl(VIEW_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject_id: subjectId, access_code: accessCode }),
      })
      if (response.status === 401) { error.value = 'invalid'; return false }
      if (response.status === 429) { error.value = 'rate_limited'; return false }
      if (!response.ok) { error.value = 'network'; return false }
      result.value = await response.json() as LookupResult
      submittedSubjectId.value = subjectId
      submittedCode.value = accessCode
      startedAt = performance.now()
      pollInterval = POLL_START_MS
      if (result.value.status === 'processing') schedulePoll()
      return true
    } catch {
      error.value = 'network'
      return false
    } finally {
      loading.value = false
    }
  }

  /** 固定报告编号查询：编号与管理端显示的测评编号完全一致。 */
  async function lookupByReportId(reportId: string): Promise<boolean> {
    clearPoll()
    error.value = null
    loading.value = true
    try {
      const response = await fetchImpl(VIEW_BY_ID_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ report_id: reportId }),
      })
      if (response.status === 401) { error.value = 'invalid'; return false }
      if (response.status === 429) { error.value = 'rate_limited'; return false }
      if (!response.ok) { error.value = 'network'; return false }
      result.value = await response.json() as LookupResult
      submittedSubjectId.value = null
      submittedCode.value = reportId.toUpperCase()
      startedAt = performance.now()
      pollInterval = POLL_START_MS
      // 固定编号轮询继续调用专用接口，避免混用旧版凭证协议。
      if (result.value.status === 'processing') scheduleReportIdPoll()
      return true
    } catch {
      error.value = 'network'
      return false
    } finally {
      loading.value = false
    }
  }

  function scheduleReportIdPoll() {
    clearPoll()
    pollTimer = window.setTimeout(async () => {
      pollTimer = null
      if (!submittedCode.value) return
      elapsedMs.value = performance.now() - startedAt
      try {
        const response = await fetchImpl(VIEW_BY_ID_URL, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ report_id: submittedCode.value }),
        })
        if (!response.ok) return
        result.value = await response.json() as LookupResult
        if (result.value.status === 'processing') scheduleReportIdPoll()
      } catch { scheduleReportIdPoll() }
    }, pollInterval)
    pollInterval = Math.min(POLL_MAX_MS, pollInterval * 2)
  }

  function schedulePoll() {
    clearPoll()
    pollTimer = window.setTimeout(async () => {
      pollTimer = null
      if (!submittedCode.value || !submittedSubjectId.value) return
      elapsedMs.value = performance.now() - startedAt
      await lookupKeepResult(submittedSubjectId.value, submittedCode.value)
    }, pollInterval)
    pollInterval = Math.min(POLL_MAX_MS, pollInterval * 2)   // 退避：5s→10s→…→30s
  }

  /** 轮询变体：失败不弹表单错误（保留上一次结果），仅在可恢复时继续 */
  async function lookupKeepResult(subjectId: string, accessCode: string): Promise<void> {
    try {
      const response = await fetchImpl(VIEW_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject_id: subjectId, access_code: accessCode }),
      })
      if (response.status === 401 || response.status === 429) return   // 网络外的状态突变：停止轮询
      if (!response.ok) { schedulePoll(); return }
      result.value = await response.json() as LookupResult
      if (result.value.status === 'processing') schedulePoll()
    } catch {
      schedulePoll()   // 网络抖动：退避后重试
    }
  }

  function errorMessage(): string {
    if (error.value === 'invalid') return MESSAGES.report.invalidCredential
    if (error.value === 'rate_limited') return MESSAGES.report.rateLimited
    if (error.value === 'network') return MESSAGES.report.networkError
    return ''
  }

  /** 是否已超过预计时间（切"分析时间较长"文案） */
  function isSlow(): boolean {
    return result.value?.status === 'processing'
      && elapsedMs.value >= MESSAGES.report.slowAfterMinutes * 60_000
  }

  /** 退出/清屏：清空编号、查询码、报告；停止轮询 */
  function exit() {
    clearPoll()
    result.value = null
    submittedCode.value = null
    submittedSubjectId.value = null
    error.value = null
    elapsedMs.value = 0
  }

  onBeforeUnmount(exit)

  return { loading, error, result, submittedCode, elapsedMs, isSlow, errorMessage, lookup, lookupByReportId, exit }
}
