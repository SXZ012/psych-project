/**
 * 社区流程纯逻辑：阶段→大步映射、提交错误分类、会话短码。
 * 独立成模块便于单元测试（node --test 直跑，无 DOM 依赖）。
 */
import type { CommunityPhase } from '@/types/community'

/** 顶部阶段进度的五个大步（用户视角的旅程骨架） */
export const COMMUNITY_JOURNEY_STEPS = ['了解', '确认', '准备', '体验', '报告'] as const

/** 阶段 → 大步序号；失败态返回 null（不显示进度条） */
export const PHASE_STEP: Record<CommunityPhase, number | null> = {
  welcome: null,
  brief: 0,
  payment_mock: 1,
  consent: 1,
  assets_loading: 2,
  face_ready: 2,
  practice: 2,
  countdown: 3,
  capturing: 3,
  closing: 4,
  report_processing: 4,
  complete: 4,
  assets_failed: null,
  device_error: null,
  quality_failed: null,
  submit_failed: null,
}

/** 提交错误分类：决定恢复路径，不把原始错误串直接丢给用户 */
export type SubmitErrorKind =
  | 'already-submitted'   // 服务端已有本次会话的测评（假失败：响应丢失后的重试）
  | 'video-invalid'       // 录像无效（需重新采集）
  | 'network'             // 网络/服务暂不可用（可原样重试）

export function classifySubmitError(message: string): SubmitErrorKind {
  if (/已提交过|每笔支付仅支持一次提交/.test(message)) return 'already-submitted'
  if (/录制时长不足|视频无效|没有可提交的视频|VideoQAFailed|视频质量/.test(message)) return 'video-invalid'
  return 'network'
}

/** 会话短码：UUID 前 8 位大写，供用户抄录/求助/对账（不暴露完整 id） */
export function formatSessionCode(sessionId: string): string {
  const clean = sessionId.replace(/-/g, '').toUpperCase()
  return clean.slice(0, 8)
}
