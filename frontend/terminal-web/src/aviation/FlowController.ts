/**
 * AssessmentFlowController：航空测评页面阶段状态机。
 *
 * 职责只有一个——持有当前阶段、校验并执行合法转换、拒绝非法转换。
 * 不做采集、不做题目、不做音频；各子系统通过事件驱动它前进。
 *
 * 转换表是唯一事实来源：加阶段/事件先改表；UI 渲染分支、控制器回调
 * 的守卫都以这里的行为为准，避免散落的 `if (phase === …)` 私改状态。
 */
import type { FlowEvent, Phase } from './types.ts'

/** 主链（正常路径顺序） */
export const PHASE_ORDER: readonly Phase[] = [
  'login', 'consent', 'detect', 'practice', 'countdown', 'assess',
  'captured', 'submitting', 'complete',
]

/**
 * 合法转换表：event → (当前阶段 → 目标阶段)。
 * 未列出的 (event, phase) 组合一律拒绝（返回 false 并保持原阶段），
 * 并发/重放事件因此不可能造成二次封存、二次提交或阶段回跳。
 */
const TRANSITIONS: Record<FlowEvent['type'], Partial<Record<Phase, Phase>>> = {
  IDENTITY_SUBMITTED: { login: 'consent' },
  CONSENT_CONFIRMED: { consent: 'detect' },
  BEGIN_PRACTICE: { detect: 'practice' },
  // 预训练完成或被主动跳过后开倒计时；采集失效重测时预训练已完成，允许 detect 直达
  START_COUNTDOWN: { practice: 'countdown', detect: 'countdown' },
  COUNTDOWN_ABORTED: { countdown: 'detect' },                        // 倒计时期间就位失效
  COUNTDOWN_FINISHED: { countdown: 'assess' },
  CAPTURE_SEALED: { assess: 'captured' },                            // 视频封存（唯一进入点）
  CAPTURE_INVALIDATED: { assess: 'capture_invalid' },
  RECORD_START_FAILED: { countdown: 'submit_failed' },               // 录制器启动失败
  SEAL_FAILED: { captured: 'submit_failed' },                        // 录制器停止/封装失败
  VIDEO_SEALED: { captured: 'loading' },                             // 录像封装成功
  UPLOAD_START: { loading: 'submitting' },                           // 短暂完成反馈后提交
  UPLOAD_SUCCEEDED: { submitting: 'complete' },
  UPLOAD_FAILED: { submitting: 'submit_failed' },
  VIDEO_QA_REJECTED: { submitting: 'quality_restart' },
  RETRY_SUBMIT: { submit_failed: 'submitting' },
  RESTART_AFTER_INVALID: { capture_invalid: 'detect' },              // 重测保留预训练完成状态（编排层负责）
  RESTART_AFTER_QA: { quality_restart: 'detect' },
  FINISHED: {
    // 任何非采集进行中的阶段都允许完成退出；assess 进行中先由采集层终止
    login: 'login', consent: 'login', detect: 'login', practice: 'login',
    countdown: 'login', captured: 'login', capture_invalid: 'login',
    loading: 'login', submit_failed: 'login', quality_restart: 'login',
    complete: 'login', submitting: 'login',
  },
}

export interface FlowControllerOptions {
  onPhaseChange?: (phase: Phase, previous: Phase, event: FlowEvent) => void
  /** 非法转换的监听（调试/审计用，不改变拒绝行为） */
  onRejected?: (event: FlowEvent['type'], phase: Phase) => void
}

export class FlowController {
  private _phase: Phase = 'login'
  private readonly o: FlowControllerOptions

  constructor(options: FlowControllerOptions = {}) {
    this.o = options
  }

  get phase(): Phase { return this._phase }

  /** 采集进行中（assess 阶段）——外部清理路径需要知道 */
  get capturing(): boolean { return this._phase === 'assess' }

  /** 提交已成功（complete）后不再接受任何重试/重开事件 */
  get finishedSuccessfully(): boolean { return this._phase === 'complete' }

  /**
   * 派发事件。合法则转换并返回 true；非法返回 false（状态不变）。
   * 所有并发重放（重复封存、二次提交、封存后再点选项等）在这里被挡下。
   */
  dispatch(event: FlowEvent): boolean {
    const target = TRANSITIONS[event.type]?.[this._phase]
    if (!target) {
      this.o.onRejected?.(event.type, this._phase)
      return false
    }
    const previous = this._phase
    this._phase = target
    this.o.onPhaseChange?.(target, previous, event)
    return true
  }

  /** 回到登录页（不触发回调；用于完成退出后的整场重置） */
  reset(): void { this._phase = 'login' }
}
