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
import { getCurrentInstance, onBeforeUnmount, ref } from 'vue'
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

export type LookupError = 'invalid' | 'rate_limited' | 'network' | 'forbidden'

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
  const loading = ref(false), error = ref<LookupError | null>(null)
  const result = ref<LookupResult | null>(null), submittedCode = ref<string | null>(null)
  const submittedSubjectId = ref<string | null>(null), elapsedMs = ref(0)
  let pollTimer: ReturnType<typeof setTimeout> | undefined
  let controller: AbortController | undefined
  let generation = 0, startedAt = 0, pollInterval = POLL_START_MS
  let currentBody: Record<string,string> = {}, currentUrl = VIEW_BY_ID_URL
  function clearPoll() { clearTimeout(pollTimer); pollTimer = undefined }
  function schedule(run: number) {
    if (run !== generation) return
    clearPoll()
    pollTimer = setTimeout(() => void request(run, false), pollInterval)
    pollInterval = Math.min(POLL_MAX_MS, pollInterval * 2)
  }
  async function request(run: number, initial: boolean): Promise<boolean> {
    const abort = new AbortController(); controller = abort
    const timeout = setTimeout(() => abort.abort(), 15000)
    let retry = false
    try {
      const response = await fetchImpl(currentUrl, {
        method:'POST', headers:{'Content-Type':'application/json'}, cache:'no-store',
        body:JSON.stringify(currentBody), signal:abort.signal,
      })
      if (run !== generation) return false
      if (!response.ok) {
        error.value = response.status === 401 ? 'invalid' : response.status === 403 ? 'forbidden' : response.status === 429 ? 'rate_limited' : 'network'
        retry = error.value === 'network'
        if (!initial && !retry && result.value) result.value = { ...result.value, status:'needs_attention', report:undefined }
        return false
      }
      const body = await response.json() as LookupResult
      if (run !== generation) return false
      error.value = null; result.value = body
      elapsedMs.value = performance.now() - startedAt
      retry = body.status === 'processing'
      return true
    } catch {
      if (run === generation) { error.value = 'network'; retry = true }
      return false
    } finally {
      clearTimeout(timeout)
      if (run === generation) {
        loading.value = false
        if (retry && (!initial || result.value)) schedule(run)
      }
    }
  }
  async function start(url: string, body: Record<string,string>) {
    clearPoll(); controller?.abort(); const run = ++generation
    result.value = null; error.value = null; loading.value = true
    currentUrl = url; currentBody = body; startedAt = performance.now(); pollInterval = POLL_START_MS
    return request(run, true)
  }
  function lookup(subjectId: string, accessCode: string) {
    submittedSubjectId.value = subjectId; submittedCode.value = accessCode
    return start(VIEW_URL, { subject_id:subjectId, access_code:accessCode })
  }
  function lookupByReportId(reportId: string) {
    submittedSubjectId.value = null; submittedCode.value = reportId.toUpperCase()
    return start(VIEW_BY_ID_URL, { report_id:reportId })
  }
  function retry() { clearPoll(); controller?.abort(); return request(++generation, false) }
  function errorMessage(): string {
    if(error.value==='invalid') return MESSAGES.report.invalidCredential
    if(error.value==='forbidden') return '当前入口需要工作人员认证，请联系现场工作人员。'
    if(error.value==='rate_limited') return MESSAGES.report.rateLimited
    return error.value==='network' ? MESSAGES.report.networkError : ''
  }
  function isSlow() { return result.value?.status==='processing' && elapsedMs.value>=MESSAGES.report.slowAfterMinutes*60_000 }
  function exit() {
    generation++; controller?.abort(); clearPoll(); loading.value=false
    result.value=null; submittedCode.value=null; submittedSubjectId.value=null; error.value=null; elapsedMs.value=0
    currentBody={}
  }
  if (getCurrentInstance()) onBeforeUnmount(exit)
  return { loading, error, result, submittedCode, elapsedMs, isSlow, errorMessage, lookup, lookupByReportId, retry, exit }
}
