/**
 * FaceReadiness：人脸就位与质量反馈的结构化判定（纯逻辑，可注入时钟）。
 *
 * 区分三层事实，不互相冒充：
 * 1. 摄像头能力（cameraOn）：设备开启成功且未报错；
 * 2. 最近一次检测（singleFace / positionOk / detected 坐标）：
 *    固定目标区与实际检测位置是两个概念，这里同时给出；
 * 3. 就位成立（ready）：能力 + 单人 + 位置合格 + 检测新鲜 + 持续稳定 readyStableMs。
 *
 * 输出 FaceNotice 四态：ok 合格 / warn 接近边界预警 / fail 确认不合格 /
 * error 检测或设备异常。“人脸位置合适”≠“持续注视已验证”——本系统不做
 * 注视检测，readiness 永不声称注视已验证。
 *
 * 检测过期：evaluate 由检测流驱动；若流停止（页面后台/检测器崩溃），
 * 调用方周期性 tickStale() 即可让 fresh=false——ready 不会静默维持。
 * UI 提醒只读这份状态；采集有效性仍由 CaptureController.reportQuality 判定，
 * UI 规则不反向修改有效性规则。
 */
import type { FaceEvent, FaceNotice, FaceReadinessState } from './types.ts'

export interface FaceThresholds {
  /** 就位稳定时长（达到才 ready） */
  readyStableMs: number
  /** 检测结果超过该时长未刷新 → 过期 */
  staleDetectionMs: number
  // —— 确认不合格边界（超出即 fail，采集侧按中断处理）——
  minWidth: number
  maxWidth: number
  maxHeight: number
  minX: number
  maxX: number
  minY: number
  maxY: number
  // —— 预警边界（在合格区内但接近边缘 → warn）——
  warnMinWidth: number
  warnMaxWidth: number
  warnMinX: number
  warnMaxX: number
  warnMinY: number
  warnMaxY: number
}

/** 既有就位阈值的结构化版本（与旧 evaluateFace 数值一致，集中可调） */
export const FACE_THRESHOLDS: FaceThresholds = {
  readyStableMs: 2_000,
  staleDetectionMs: 2_000,
  minWidth: .11, maxWidth: .72, maxHeight: .88,
  minX: .20, maxX: .80, minY: .15, maxY: .82,
  warnMinWidth: .16, warnMaxWidth: .62,
  warnMinX: .28, warnMaxX: .72, warnMinY: .23, warnMaxY: .74,
}

export interface FaceReadinessOptions {
  thresholds?: FaceThresholds
  clock?: () => number
  /** 就位状态跨越（false→true / true→false）时回调 */
  onReadyChange?: (ready: boolean) => void
}

export class FaceReadiness {
  private readonly t: FaceThresholds
  private readonly now: () => number
  private state: FaceReadinessState = {
    cameraOn: false, singleFace: false, positionOk: false,
    detectionFresh: false, stableMs: 0, ready: false,
  }
  private notice: FaceNotice = { level: 'error', messageKey: 'opening' }
  /** 最近一次检测的归一化位置（区别于固定目标区；UI 展示检测框用） */
  detected: { x: number; y: number; width: number; height: number } | null = null
  private lastEventAt = 0
  private validSince: number | null = null
  private everReceivedEvent = false

  constructor(options: FaceReadinessOptions = {}) {
    this.t = options.thresholds ?? FACE_THRESHOLDS
    this.now = options.clock ?? (() => performance.now())
    this.onReadyChange = options.onReadyChange
  }

  private readonly onReadyChange?: (ready: boolean) => void

  get snapshot(): FaceReadinessState { return { ...this.state } }
  get currentNotice(): FaceNotice { return this.notice }

  /** 摄像头能力变化（开启成功/失败/断开） */
  setCamera(on: boolean, failKey?: string): void {
    this.state.cameraOn = on
    if (!on) {
      this.setNotice('error', failKey ?? 'cameraFailed')
      this.recomputeStability(false)
    } else if (this.notice.level === 'error' && this.notice.messageKey !== 'detectError' && this.notice.messageKey !== 'detectInitFailed') {
      this.setNotice('fail', 'confirming')
    }
  }

  /** 摄像头未开启时检测事件不覆盖设备错误提示（位置照常记录） */
  private setDetectNotice(level: FaceNotice['level'], messageKey: string): void {
    if (!this.state.cameraOn) {
      if (this.notice.level !== 'error') this.setNotice('error', 'cameraFailed')
      return
    }
    this.setNotice(level, messageKey)
  }

  /**
   * 检测流事件（原生或浏览器）。同时刷新 detected 位置、notice 与稳定性。
   * result.ok：单人且位置合格（采集有效性输入）。
   */
  evaluate(event: FaceEvent | null): { ok: boolean; issueKey: string } {
    if (!event) return { ok: false, issueKey: this.notice.messageKey }
    const now = this.now()
    this.lastEventAt = now
    this.everReceivedEvent = true
    this.state.detectionFresh = true      // 事件到达即新鲜；静默由 tickStale 负责转过期

    if (event.error) {
      this.detected = null
      this.state.singleFace = false
      this.state.positionOk = false
      this.setNotice('error', 'detectError')
      this.recomputeStability(false)
      return { ok: false, issueKey: 'detectError' }
    }
    if (!event.count) {
      this.failEvent('noFace')
      return { ok: false, issueKey: 'noFace' }
    }
    if (event.count > 1) {
      this.failEvent('multiFace')
      return { ok: false, issueKey: 'multiFace' }
    }
    this.state.singleFace = true
    const width = event.width ?? 0, height = event.height ?? 0
    const x = event.xCenter ?? .5, y = event.yCenter ?? .5
    this.detected = { x, y, width, height }

    if (width < this.t.minWidth) { this.failEvent('tooFar'); return { ok: false, issueKey: 'tooFar' } }
    if (width > this.t.maxWidth || height > this.t.maxHeight) { this.failEvent('tooNear'); return { ok: false, issueKey: 'tooNear' } }
    if (x < this.t.minX || x > this.t.maxX || y < this.t.minY || y > this.t.maxY) { this.failEvent('offCenter'); return { ok: false, issueKey: 'offCenter' } }
    this.state.positionOk = true

    // 合格区内再分“完全合格”与“接近边界预警”
    const edge = (
      x < this.t.warnMinX || x > this.t.warnMaxX || y < this.t.warnMinY || y > this.t.warnMaxY
        ? 'nearCenterEdge'
        : width < this.t.warnMinWidth ? 'tooFar'
        : width > this.t.warnMaxWidth ? 'tooNear'
        : ''
    )
    if (edge) this.setDetectNotice('warn', edge)
    else this.setDetectNotice('ok', 'readyMessage')
    this.recomputeStability(true)
    return { ok: true, issueKey: edge }
  }

  /** 周期调用：检测流静默时把 fresh 置 false（ready 不得静默维持） */
  tickStale(): void {
    const fresh = this.everReceivedEvent && this.now() - this.lastEventAt <= this.t.staleDetectionMs
    if (fresh !== this.state.detectionFresh) {
      this.state.detectionFresh = fresh
      if (!fresh) {
        this.setNotice('error', 'signalLost')
        this.recomputeStability(false)
      } else if (this.notice.messageKey === 'signalLost') {
        this.setNotice('fail', 'confirming')
      }
    }
  }

  /**
   * 周期调用：检测流间歇（事件尚未到、但未过期）时按墙钟推进稳定计时，
   * 避免“就位稳定判定永远等不到下一个事件”。含过期检查。
   */
  refresh(): void {
    this.tickStale()
    if (this.state.detectionFresh && this.validSince !== null) {
      this.recomputeStability(true)
    }
  }

  /** 阶段重置（重新就位）：清检测记忆但保留摄像头能力状态 */
  resetForPositionCheck(): void {
    this.state.singleFace = false
    this.state.positionOk = false
    this.state.detectionFresh = false
    this.state.stableMs = 0
    this.detected = null
    this.lastEventAt = 0
    this.everReceivedEvent = false
    this.validSince = null
    this.setNotice(this.state.cameraOn ? 'fail' : 'error', this.state.cameraOn ? 'confirming' : 'opening')
    this.recomputeStability(false)
  }

  /** 整场重置（完成退出/换人） */
  resetAll(): void {
    this.state.cameraOn = false
    this.resetForPositionCheck()
  }

  // —— 内部 ——

  private failEvent(key: string): void {
    this.detected = null
    this.state.singleFace = false
    this.state.positionOk = false
    this.setNotice('fail', key)
    this.recomputeStability(false)
  }

  private setNotice(level: FaceNotice['level'], messageKey: string): void {
    this.notice = { level, messageKey }
  }

  private recomputeStability(valid: boolean): void {
    const now = this.now()
    if (valid) {
      if (this.validSince === null) this.validSince = now
      this.state.stableMs = now - this.validSince
    } else {
      this.validSince = null
      this.state.stableMs = 0
    }
    const ready = this.state.cameraOn && this.state.singleFace && this.state.positionOk
      && this.state.detectionFresh && this.state.stableMs >= this.t.readyStableMs
    if (ready !== this.state.ready) {
      this.state.ready = ready
      this.onReadyChange?.(ready)
    }
  }
}
