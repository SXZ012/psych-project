/**
 * 航空测评运行配置：全部可调参数集中于此。
 *
 * 分两类：
 * - 【采集协议】合作方约束（60 秒连续有效窗口、全程在框）→ 复用 capture/protocol.ts，
 *   修订需合作方确认；
 * - 【产品试验配置】题池大小、切题节奏、收尾窗口、倒计时等 → 本文件，
 *   均为未经验证的试验值，仅用于流程运转，不宣称经过算法验证。
 */
import { STRICT_CONTINUOUS_V2 } from '../capture/protocol.ts'

/** 航空自定节奏调度协议版本（随提交上传，供审计） */
export const QUESTION_PROTOCOL_VERSION = 'aviation-self-paced-v1'

export const AVIATION_CONFIG = {
  /** 采集协议（合作方规则 + 待确认阈值） */
  protocol: STRICT_CONTINUOUS_V2,

  /** 正式固定时长（ms）。从录制实际启动成功起算，单调时钟测量。 */
  requiredMs: STRICT_CONTINUOUS_V2.requiredMs,

  // —— 预训练 ——
  practiceCount: 3,
  /** 主动跳过预训练：跳过整段（不凭未确认身份认定“老用户”） */
  practiceSkippable: true,

  // —— 倒计时 ——
  countdownSeconds: 3,

  // —— 题目调度（产品试验配置，非采集协议）——
  /** 点击后锁定反馈时长（ms），随后切换下一题；期间忽略重复点击 */
  selectFeedbackMs: 200,
  /** 跳过后切题前停留（ms），给“已跳过”一个可感知反馈 */
  skipFeedbackMs: 200,
  /** 采集剩余 > tailFromMs 时新题用常规题 */
  tailFromMs: 10_000,
  /** 采集剩余 ≤ tailFromMs 且 > closingFromMs 时新题优先用收尾题 */
  closingFromMs: 4_000,
  /** 采集剩余 ≤ closingFromMs：完成当前题后进入收尾页，不再出新题 */
  /** 预留作收尾题的题数（从会话题池尾部划出）【试验配置】 */
  tailPoolSize: 6,

  // —— 题池 ——
  /** 会话请求的题池上限（后端按 pair 去重，图片优先不重复） */
  poolRequestCount: 24,
  /** 题池低于此数阻止进入正式采集（明确可追踪，不静默进入） */
  poolMinimum: 10,

  // —— 反馈与提交节奏 ——
  /** “采集完成”反馈时长（ms），随后进入数据整理 */
  capturedNoticeMs: 2_500,
  /** 数据整理等待（保持与旧流程一致的既有节奏；期间不阻塞用户自然活动） */
  uploadSettleMs: 10_000,
  /** 完成页自动退出倒计时（秒） */
  completeTimeoutSec: 30,

  // —— 素材 ——
  audioRoot: '/static/assets/aviation/audio/paired-v1/',
  /** 题库接口（航空专用：按 pair 去重，可返回足量题目） */
  poolUrl: '/api/v1/pairs/aviation/pool',
} as const

/** UI 判定用：驱动节拍间隔（只驱动判定与展示刷新，时长一律按时钟差） */
export const TICK_MS = 100
