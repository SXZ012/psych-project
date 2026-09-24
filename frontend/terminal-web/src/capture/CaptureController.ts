/**
 * 采集控制器：录制计时、质量门禁、终止与封存的唯一判定来源。
 *
 * 严格零中断语义（strict-continuous-v2）：
 * 1. 计时使用注入的单调时钟的实际时间差，绝不用定时回调次数累计。
 * 2. 连续不合格区间：从第一次不合格事件起算；中途原因变化只追加子事件，
 *    不重置区间起点；只有真实合格状态（reportQuality(true)）才能结束区间。
 * 3. 确认出框 = 连续不合格持续 ≥ detectionDebounceMs → 本轮立即无效。
 *    防抖窗口仅用于区分检测器瞬时抖动，不是容忍窗口。
 * 4. 到达目标时长时若仍有未结束的异常区间 → 挂起封存（pendingSeal），
 *    绝不带着异常封存成功；区间恢复合格才封存，确认出框则无效。
 * 5. 封存成功必须可证明：elapsed ≥ requiredMs 且无确认出框且无进行中异常；
 *    effectiveContinuousMs 即"可证明连续有效时长"。
 * 6. 状态机单向：idle → recording → sealed | invalid；终态后一切调用为 no-op。
 */

export type CaptureState = 'idle' | 'recording' | 'sealed' | 'invalid'

/** 原因子事件（审计用）：不合格区间内原因可能变化，每次变化记一条 */
export interface QualityEvent {
  startMs: number
  endMs: number | null
  reason: string
}

/** 连续不合格区间：起点唯一，原因变化只追加子事件 */
export interface BadInterval {
  startMs: number
  endMs: number | null
  reasons: { atMs: number; reason: string }[]
}

export interface CaptureSummary {
  protocolVersion: string
  /** 实际连续录制时长（封存/失效时点） */
  elapsedMs: number
  /** 可证明的连续有效时长：仅在无确认出框且无进行中异常时封存，等于 elapsedMs（≥requiredMs） */
  effectiveContinuousMs: number
  /** 确认出框次数（>0 时本轮必为 invalid，防御性记录） */
  confirmedAbsenceCount: number
  /** 未确认抖动次数：持续 < 防抖窗口后恢复的检测噪声（审计用，不判无效） */
  unconfirmedDebounceCount: number
  /** 连续不合格区间数 */
  interruptions: number
  /** 累计不合格时长（含未确认抖动；审计用，不得用于冒充有效） */
  interruptedMs: number
  /** 原因子事件（审计用） */
  events: QualityEvent[]
  /** 连续不合格区间（审计用） */
  intervals: BadInterval[]
}

export interface CaptureControllerOptions {
  requiredMs: number
  /** 检测信号防抖窗口（确认出框阈值），非容忍窗口 */
  detectionDebounceMs: number
  protocolVersion?: string
  /** 默认 performance.now；测试注入假时钟 */
  clock?: () => number
  onProgress?: (elapsedMs: number, remainingMs: number) => void
  /** 唯一的"完成"信号：可证明连续有效达到 requiredMs */
  onSealed?: (summary: CaptureSummary) => void
  /** 本轮无效：确认出框（连续不合格 ≥ 防抖窗口）或外部硬失效 */
  onInvalid?: (reason: string, summary: CaptureSummary) => void
}

export class CaptureController {
  private readonly now: () => number
  private readonly o: CaptureControllerOptions
  private _state: CaptureState = 'idle'
  private startWall = 0
  private events: QualityEvent[] = []
  private intervals: BadInterval[] = []
  private confirmedAbsenceCount = 0
  private unconfirmedDebounceCount = 0
  private currentBad: { since: number } | null = null
  private pendingSeal = false
  private sealedElapsed = 0

  constructor(options: CaptureControllerOptions) {
    this.o = options
    this.now = options.clock ?? (() => performance.now())
  }

  get state(): CaptureState { return this._state }
  get elapsedMs(): number {
    if (this._state === 'recording') return Math.max(0, this.now() - this.startWall)
    if (this._state === 'sealed' || this._state === 'invalid') return this.sealedElapsed
    return 0
  }
  /** 进行中的连续不合格区间（相对录制起点）；null = 当前合格 */
  get activeInterruption(): { startMs: number; durationMs: number; reason: string } | null {
    if (!this.currentBad || this._state !== 'recording') return null
    const interval = this.intervals[this.intervals.length - 1]
    const lastReason = interval?.reasons[interval.reasons.length - 1]?.reason ?? ''
    const now = this.now()
    return { startMs: this.currentBad.since - this.startWall, durationMs: now - this.currentBad.since, reason: lastReason }
  }

  /** 录制已实际开始（调用方在录制器成功启动后调用）——此刻为计时零点。 */
  start(): boolean {
    if (this._state !== 'idle') return false
    this.startWall = this.now()
    this.events = []; this.intervals = []
    this.currentBad = null; this.pendingSeal = false
    this.confirmedAbsenceCount = 0; this.unconfirmedDebounceCount = 0
    this._state = 'recording'
    this.o.onProgress?.(0, this.o.requiredMs)
    return true
  }

  /** 时钟驱动（由 UI 节拍调用）：只做判定，时长永远按时钟差计算。 */
  tick(): void {
    if (this._state !== 'recording') return
    const now = this.now()
    if (this.currentBad) {
      if (now - this.currentBad.since >= this.o.detectionDebounceMs) {
        this.invalidate(this.absenceReason())
        return
      }
      // 到时但有未结束异常：挂起，绝不满异常封存
      if (now - this.startWall >= this.o.requiredMs) this.pendingSeal = true
      this.o.onProgress?.(now - this.startWall, 0)
      return
    }
    const elapsed = now - this.startWall
    if (elapsed >= this.o.requiredMs) { this.seal(now); return }
    this.o.onProgress?.(elapsed, this.o.requiredMs - elapsed)
  }

  /**
   * 质量上报。ok=true 为真实合格状态；ok=false 附带具体原因。
   * 连续不合格的起点不因原因变化而重置——失效判定基于连续不合格总时长。
   */
  reportQuality(ok: boolean, reason = ''): void {
    if (this._state !== 'recording') return
    const now = this.now()
    if (ok) {
      if (!this.currentBad) return
      const duration = now - this.currentBad.since
      if (duration < this.o.detectionDebounceMs) this.unconfirmedDebounceCount += 1
      this.closeInterval(now)
      this.currentBad = null
      // 挂起的封存：恢复合格且已达时长 → 现在封存（可证明连续）
      if (this.pendingSeal && now - this.startWall >= this.o.requiredMs) {
        this.pendingSeal = false
        this.seal(now)
      }
      return
    }
    if (!this.currentBad) {
      this.currentBad = { since: now }
      this.intervals.push({
        startMs: now - this.startWall, endMs: null,
        reasons: [{ atMs: now - this.startWall, reason: reason || '采集条件不满足' }],
      })
      this.events.push({ startMs: now - this.startWall, endMs: null, reason: reason || '采集条件不满足' })
    } else if (reason && this.lastReason() !== reason) {
      // 原因变化：追加子事件，区间起点不动（连续不合格时长持续累计）
      const at = now - this.startWall
      this.intervals[this.intervals.length - 1].reasons.push({ atMs: at, reason })
      this.events.push({ startMs: at, endMs: null, reason })
      this.closePriorEvent(at)
    }
    if (now - this.currentBad.since >= this.o.detectionDebounceMs) {
      this.invalidate(this.absenceReason())
    }
  }

  /** 本轮无效：确认出框，或外部硬失效（摄像头断开、页面长时间后台等）。 */
  invalidate(reason: string): void {
    if (this._state !== 'recording') return
    const now = this.now()
    this.sealedElapsed = now - this.startWall
    if (this.currentBad) {
      // 连续不合格 ≥ 防抖窗口的失效即"确认出框"
      if (now - this.currentBad.since >= this.o.detectionDebounceMs) this.confirmedAbsenceCount += 1
      this.closeInterval(now)
      this.currentBad = null
    }
    this.pendingSeal = false
    this._state = 'invalid'
    this.o.onInvalid?.(reason, this.summary(this.sealedElapsed))
  }

  /** 主动放弃（用户退出/组件卸载）：不触发完成/失效回调。 */
  abort(): void {
    if (this._state === 'recording' && this.currentBad) this.closeInterval(this.now())
    this._state = 'idle'
  }
  dispose(): void { this.abort() }

  // —— 内部 ——

  private lastReason(): string {
    const interval = this.intervals[this.intervals.length - 1]
    return interval?.reasons[interval.reasons.length - 1]?.reason ?? ''
  }
  private absenceReason(): string {
    const interval = this.intervals[this.intervals.length - 1]
    const first = interval?.reasons[0]?.reason ?? '采集条件不满足'
    const last = this.lastReason()
    const label = first === last ? first : `${first} → ${last}`
    return `人脸离开有效框（${label}）——本协议要求全程在框，本轮无效`
  }
  private closePriorEvent(at: number): void {
    for (let i = this.events.length - 1; i >= 0; i--) {
      if (this.events[i].endMs === null) { this.events[i].endMs = at; break }
    }
  }
  private closeInterval(now: number): void {
    const interval = this.intervals[this.intervals.length - 1]
    if (interval && interval.endMs === null) interval.endMs = now - this.startWall
    this.closePriorEvent(now - this.startWall)
  }
  private seal(now: number): void {
    // 防御式断言：存在未结束的异常区间绝不封存
    if (this.currentBad) return
    this.sealedElapsed = now - this.startWall
    if (this.sealedElapsed < this.o.requiredMs || this.confirmedAbsenceCount > 0) return
    this._state = 'sealed'
    this.o.onSealed?.(this.summary(this.sealedElapsed))
  }
  private summary(elapsedMs: number): CaptureSummary {
    const intervals = this.intervals.map(i => ({ ...i, reasons: [...i.reasons] }))
    const events = this.events.map(e => ({ ...e }))
    let interruptedMs = 0
    for (const i of intervals) interruptedMs += (i.endMs ?? elapsedMs) - i.startMs
    const provable = this._state === 'sealed'
    return {
      protocolVersion: this.o.protocolVersion ?? '',
      elapsedMs,
      effectiveContinuousMs: provable ? elapsedMs : 0,
      confirmedAbsenceCount: this.confirmedAbsenceCount,
      unconfirmedDebounceCount: this.unconfirmedDebounceCount,
      interruptions: intervals.length,
      interruptedMs,
      events,
      intervals,
    }
  }
}
