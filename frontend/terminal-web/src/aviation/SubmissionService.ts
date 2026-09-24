/**
 * SubmissionService：提交、失败重试与幂等。
 *
 * - 幂等：每次测评（一次成功封存）在 begin() 生成 client_token，
 *   首次提交与全部重试复用同一 token；后端按 token 去重——
 *   网络失败后的重试绝不重复创建测评记录（浏览器与 Android 原生两条路径一致）。
 * - 状态区分：录像无效（video_invalid，无法重试提交，需重新测评）/
 *   上传失败（failed，视频仍在，重试原视频，不要求重新测评）/
 *   服务端质量拒绝（qa_rejected，需重新采集）/ 成功（succeeded）。
 *   “正在保存”“正在提交”“提交成功”分别对应真实阶段。
 * - 浏览器路径：FormData + fetch /api/v1/assessments/submit（带 client_token）。
 * - 原生路径：AndroidCamera.submitAssessment(payload)，payload 含同一 token
 *   与采集协议审计字段。
 */
import type { SubmitPayload } from './types.ts'
import { fetchWithTimeout, UPLOAD_TIMEOUT_MS } from '../utils/net.ts'

export type SubmitOutcome =
  | { status: 'succeeded'; assessmentId: string | null; accessCode: string | null }
  | { status: 'failed'; message: string; canRetry: boolean }
  | { status: 'qa_rejected'; message: string }
  | { status: 'video_invalid'; message: string }

export interface SubmissionAdapters {
  /** 浏览器上传（默认用全局 fetch；测试注入假实现） */
  fetchImpl?: typeof fetch
  /** 原生提交（AndroidCamera.submitAssessment 的封装）；null = 浏览器路径 */
  nativeSubmit?: ((payload: SubmitPayload) => Promise<{ ok: boolean; assessment_id?: string; access_code?: string; error?: string }>) | null
  /** 随机 token 生成（测试注入固定值） */
  randomToken?: () => string
}

const SUBMIT_URL = '/api/v1/assessments/submit'

export class SubmissionService {
  private clientToken: string | null = null
  private assessmentId: string | null = null
  private _attempts = 0
  private readonly adapters: SubmissionAdapters

  constructor(adapters: SubmissionAdapters = {}) { this.adapters = adapters }

  /** 新一次测评开始：生成幂等令牌（同一次测评的重试全部复用） */
  begin(): string {
    this.clientToken = this.adapters.randomToken?.() ?? cryptoRandomToken()
    this.assessmentId = null
    this._attempts = 0
    return this.clientToken
  }

  get token(): string | null { return this.clientToken }
  get attempts(): number { return this._attempts }

  /**
   * 提交（首次与重试同一入口）。video 仅浏览器路径需要；
   * 原生路径视频保存在设备 pendingFile，由原生层随同一 token 重传。
   */
  async submit(payload: SubmitPayload, video: Blob | null): Promise<SubmitOutcome> {
    if (!this.clientToken) return { status: 'failed', message: 'no_client_token', canRetry: false }
    this._attempts += 1
    const withToken: SubmitPayload = { ...payload, client_token: this.clientToken }
    try {
      if (this.adapters.nativeSubmit) {
        const result = await this.adapters.nativeSubmit(withToken)
        if (result.ok) {
          this.assessmentId = result.assessment_id ?? this.assessmentId
          return {
            status: 'succeeded',
            assessmentId: this.assessmentId,
            // 一次性明文查询码：仅服务端确认持久化后才有值
            accessCode: (result as { access_code?: string }).access_code ?? null,
          }
        }
        return this.classifyError(result.error || '原生上传失败')
      }
      if (!video) return { status: 'video_invalid', message: 'no_video' }
      const init: RequestInit = { method: 'POST', body: buildForm(withToken, video) }
      // 挂起不等于失败：默认实现带超时，abort 走 catch 分支，视频仍在可重试
      const response = this.adapters.fetchImpl
        ? await this.adapters.fetchImpl(SUBMIT_URL, init)
        : await fetchWithTimeout(SUBMIT_URL, init, UPLOAD_TIMEOUT_MS)
      if (response.ok) {
        const body = await response.json().catch(() => ({}))
        this.assessmentId = String((body as { id?: string }).id || '') || this.assessmentId
        return {
          status: 'succeeded',
          assessmentId: this.assessmentId,
          accessCode: (body as { access_code?: string }).access_code ?? null,
        }
      }
      return this.classifyError(await readError(response))
    } catch (error) {
      // 网络层失败：视频/数据仍在，可重试原视频
      return {
        status: 'failed',
        message: error instanceof Error ? error.message : '网络异常',
        canRetry: true,
      }
    }
  }

  /** 整场重置 */
  reset(): void {
    this.clientToken = null
    this.assessmentId = null
    this._attempts = 0
  }

  private classifyError(message: string): SubmitOutcome {
    if (message.includes('VideoQAFailed')) {
      // 服务端质量门禁拒绝：视频已被服务端丢弃，需重新采集
      return { status: 'qa_rejected', message: message.replace(/^.*VideoQAFailed:?\s*/, '') || '视频质量未达到分析要求' }
    }
    if (message.includes('no_video') || message.includes('录制时长不足') || message.includes('视频无效')) {
      return { status: 'video_invalid', message: message }
    }
    return { status: 'failed', message, canRetry: true }
  }
}

function buildForm(payload: SubmitPayload, video: Blob): FormData {
  const form = new FormData()
  form.append('name', payload.name)
  form.append('id_card', payload.id_card)
  form.append('subject_id', payload.subject_id)
  form.append('gender', payload.gender)
  form.append('age', String(payload.age))
  form.append('selections', JSON.stringify(payload.selections))
  form.append('duration_seconds', String(payload.duration_seconds))
  form.append('effective_duration_seconds', String(payload.effective_duration_seconds))
  form.append('paused_count', String(payload.paused_count))
  form.append('client_token', payload.client_token)
  if (payload.protocol_version) form.append('protocol_version', payload.protocol_version)
  if (payload.question_protocol_version) form.append('timeline_version', payload.question_protocol_version)
  if (payload.content_version) form.append('content_version', payload.content_version)
  if (payload.interruptions !== undefined) form.append('interruptions', String(payload.interruptions))
  if (payload.interrupted_ms !== undefined) form.append('interrupted_ms', String(payload.interrupted_ms))
  if (payload.scheduling_notes?.length) form.append('scheduling_notes', JSON.stringify(payload.scheduling_notes))
  if (payload.consent_version) form.append('consent_version', payload.consent_version)
  form.append('video', video, 'assessment.webm')
  return form
}

async function readError(response: Response): Promise<string> {
  const body = await response.json().catch(() => null) as { detail?: unknown } | null
  const detail = body?.detail
  if (typeof detail === 'object' && detail) {
    const code = String((detail as { code?: string }).code || '')
    const message = String((detail as { message?: string }).message || '')
    return `${code}: ${message}`.replace(/^: |: $/g, '') || `提交失败（${response.status}）`
  }
  return String(detail || `提交失败（${response.status}）`)
}

function cryptoRandomToken(): string {
  try {
    return crypto.randomUUID()
  } catch {
    // 非安全上下文兜底（WebView file:// 等）
    return `tk-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
  }
}
