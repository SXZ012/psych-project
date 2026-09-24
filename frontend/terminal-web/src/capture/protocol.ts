/**
 * 航空场景采集协议配置（集中管理，便于审查与后续按合作方确认结果修订）。
 *
 * 合作方规则（已明确）：60 秒有效采集，正式采集期间人脸全程位于有效框内。
 * 本协议按零中断执行：确认出框 → 本轮立即无效。
 *
 * 【待验证标注】以下参数尚未获得合作方书面确认：
 * - detectionDebounceMs：检测信号防抖窗口。仅用于区分"检测器瞬时抖动"与"确认出框"，
 *   防止单帧误报直接判死；出框持续不足该窗口且随后恢复合格 → 视为检测噪声，不判无效
 *   （但该段抖动会记入审计事件）。该窗口不是容忍窗口：不存在"出框 N 秒仍算有效"。
 * - staleDetectionMs / sustainedAlertMs / readyStableMs：同前。
 * 合作方确认前，不得对外宣称这些阈值"已通过算法验证"。
 */

export interface CaptureProtocol {
  /** 协议版本标识，随提交上传（仅浏览器路径），用于后台审计 */
  readonly version: string
  /** 目标连续采集时长（合作方窗口 30–70s，产品方案取连续 60s） */
  readonly requiredMs: number
  /**
   * 检测信号防抖（不是容忍窗口）：出框持续 ≥ 该窗口 = 确认出框 → 本轮立即无效；
   * 持续不足该窗口且随后恢复 → 视为检测器噪声，不判无效（记入审计）。【待合作方确认】
   */
  readonly detectionDebounceMs: number
  /** 检测结果超过该时长未刷新 → 视为信号中断（按出框处理，进入防抖/无效判定）【待验证】 */
  readonly staleDetectionMs: number
  /** 连续不合格持续该时长后播报一次语音提醒【待验证】 */
  readonly sustainedAlertMs: number
  /** 就位检查：人脸状态需保持该时长才判定稳定 */
  readonly readyStableMs: number
}

export const STRICT_CONTINUOUS_V2: CaptureProtocol = {
  version: 'strict-continuous-v2',
  requiredMs: 60_000,
  // 先给出位置提示与充分回正机会；持续 3 秒仍不合格才判定本轮无效。
  detectionDebounceMs: 3_000,
  staleDetectionMs: 2_000,
  sustainedAlertMs: 500,
  readyStableMs: 2_000,
}

/**
 * 采集模式说明：
 * - continuous（默认/严格零中断）：人脸全程在框；确认出框本轮无效；
 *   成功封存必须同时满足 elapsed ≥ requiredMs、无确认出框、无进行中的异常区间。
 * - cumulative（累计有效）：仅在合作方明确允许时启用；
 *   当前未获确认，仅保留枚举占位，禁止默认使用。
 */
export type CaptureMode = 'continuous' | 'cumulative'
export const DEFAULT_CAPTURE_MODE: CaptureMode = 'continuous'
