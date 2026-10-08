/**
 * 航空测评流程的类型定义。
 *
 * 纯类型文件：不含运行时逻辑，控制器（FlowController / QuestionScheduler /
 * AudioCoordinator / FaceReadiness / SubmissionService）与 UI 共用，
 * 保证阶段、事件、结构化状态在全链路只有一份拼写。
 */

// ═══════════════ 阶段与事件 ═══════════════

/** 页面阶段（单向主链 + 异常/恢复分支；合法转换由 FlowController 的转换表约束） */
export type Phase =
  | 'login'            // 身份确认
  | 'consent'          // 知情同意 + 素材预加载
  | 'detect'           // 人脸就位检查
  | 'practice'         // 三道预训练（不录像、不上传）
  | 'countdown'        // 开始提示 + 3 秒倒计时（不计入 60 秒）
  | 'assess'           // 60 秒自定节奏连续图题（正式采集）
  | 'captured'         // 采集完成即时反馈（视频已封存=已可靠保存）
  | 'loading'          // 录像已封存，进入提交前的短暂完成反馈
  | 'capture_invalid'  // 本轮采集失效（确认出框/硬失效），需重新就位
  | 'submitting'       // 正在提交（真实网络提交中）
  | 'submit_failed'    // 提交失败（可重试；视频仍在，不要求重新测评）
  | 'quality_restart'  // 服务端视频 QA 拒绝（需重新采集）
  | 'complete'         // 提交成功，完成退出倒计时

/** 触发阶段转换的事件（由用户操作、控制器回调或超时发出） */
export type FlowEvent =
  | { type: 'IDENTITY_SUBMITTED' }                                   // 登录页完成
  | { type: 'CONSENT_CONFIRMED' }                                    // 同意并素材就绪
  | { type: 'BEGIN_PRACTICE' }                                       // 就位通过，用户点“开始操作体验”
  | { type: 'START_COUNTDOWN' }                                      // 预训练完成/跳过后点“开始正式测评”
  | { type: 'COUNTDOWN_ABORTED' }                                    // 倒计时期间就位失效，回到就位检查
  | { type: 'COUNTDOWN_FINISHED' }                                   // 倒计时归零（能力就绪）
  | { type: 'CAPTURE_SEALED' }                                       // 60 秒连续有效封存
  | { type: 'CAPTURE_INVALIDATED' }                                  // 采集失效
  | { type: 'RECORD_START_FAILED' }                                  // 录制器启动失败（硬失败）
  | { type: 'SEAL_FAILED' }                                          // 录制器停止/封装失败（硬失败）
  | { type: 'VIDEO_SEALED' }                                         // 视频已可靠保存
  | { type: 'UPLOAD_START' }                                         // 数据整理结束，开始提交
  | { type: 'UPLOAD_SUCCEEDED' }
  | { type: 'UPLOAD_FAILED'; retryable: boolean }                    // retryable=false 走不可恢复分支
  | { type: 'VIDEO_QA_REJECTED' }                                    // 服务端判定视频质量不合格
  | { type: 'RETRY_SUBMIT' }                                         // 提交失败后重试
  | { type: 'RESTART_AFTER_INVALID' }                                // 失效后重新就位
  | { type: 'RESTART_AFTER_QA' }                                     // QA 拒绝后重新就位
  | { type: 'FINISHED' }                                             // 完成退出/组件卸载

// ═══════════════ 题目与调度 ═══════════════

export interface QuestionOption { id: string; text: string }

/** 会话内题目（来自后端题库或本地兜底配置，携带题库元数据） */
export interface SessionQuestion {
  /** 题库 pair_id；本地兜底题为本地 id */
  id: string
  question: string
  options: QuestionOption[]
  image: string
  imageAlt: string
  audioUrl: string
  dimension?: string
  scenario?: string
  contentVersion?: string
  /** 仅展示用途；任何题目答案都不参与擅自生成的心理评分 */
  scoringMode?: 'observation_only' | 'validated'
}

/** 题目在池中的用途：常规题 / 收尾窗口优先使用的收尾题 */
export type QuestionRole = 'regular' | 'tail'

/** 一次展示实例：事件携带 instanceId 防止旧题点击/穿透选中下一题 */
export interface QuestionInstance {
  /** 展示序号（第几次出题，从 1 开始；与题库内容无关，不展示给用户） */
  instanceId: number
  question: SessionQuestion
  role: QuestionRole
}

export type QuestionOutcome = 'selected' | 'skipped' | 'unanswered'

/** 单题作答记录（提交审计用；unanswered 在封存/失效时对未终结题补记） */
export interface QuestionRecord {
  instanceId: number
  questionId: string
  role: QuestionRole
  outcome: QuestionOutcome
  optionId: string | null
  /** 相对采集零点的时刻（ms）；skipped/unanswered 为记录时刻 */
  atMs: number
}

export type SchedulerCard =
  | { kind: 'question'; instance: QuestionInstance }   // 当前题（等待选择/跳过）
  | { kind: 'feedback'; instance: QuestionInstance; outcome: QuestionOutcome; optionId: string | null } // 已锁定反馈
  | { kind: 'closing' }        // 收尾页（剩余不足 4 秒 / 题库耗尽 / 采集仍在进行）
  | { kind: 'none' }           // 未开始 / 已冻结

// ═══════════════ 人脸就位 / 质量反馈 ═══════════════

/** 检测事件原始输入（原生 RKNN 或浏览器 MediaPipe，统一归一化坐标） */
export interface FaceEvent {
  count?: number
  xCenter?: number
  yCenter?: number
  width?: number
  height?: number
  error?: string
}

/**
 * 结构化就位状态：区分“摄像头能力”“检测结果”“就位稳定”，
 * UI 展示与采集有效性判定共用同一份事实，不互相覆盖。
 */
export interface FaceReadinessState {
  /** 摄像头能力（开启成功且未断开） */
  cameraOn: boolean
  /** 最近一次检测：单人脸已确认 */
  singleFace: boolean
  /** 最近一次检测：位置与大小在目标区内（合格，不含预警） */
  positionOk: boolean
  /** 检测信号新鲜（未超过 staleDetectionMs 视为过期，过期不得维持 ready） */
  detectionFresh: boolean
  /** 持续合格时长（ms）；达到 readyStableMs 才 ready */
  stableMs: number
  /** 就位成立 = cameraOn + singleFace + positionOk + fresh + 稳定 */
  ready: boolean
}

/** 人脸提示四态（合格 / 接近边界预警 / 确认不合格 / 检测或设备异常） */
export type FaceNoticeLevel = 'ok' | 'warn' | 'fail' | 'error'

export interface FaceNotice {
  level: FaceNoticeLevel
  /** 文案 key（messages.ts 集中管理），warn/fail/error 时必有 */
  messageKey: string
}

// ═══════════════ 音频 ═══════════════

/** 语音种类；优先级见 AudioCoordinator */
export type AudioCue =
  | 'invalid'          // 采集失效说明（最高，必须完整播放）
  | 'deviation' | 'near' | 'far'   // 位置提醒
  | 'start' | 'complete' | 'practice-complete' | 'practice-skipped' | 'finishing'
  | 'question'         // 题目语音（最低）

export type AudioPlaybackResult = 'ended' | 'failed' | 'cancelled'

/** 可注入的音频播放器（测试用假实现；真实实现为 HTMLAudioElement 封装） */
export interface AudioPlayer {
  play(): Promise<AudioPlaybackResult>
  stop(): void
  readonly durationMs: number
}

export interface AudioPlayerFactory {
  /** 预取并创建播放器；缺失/加载失败抛错（预加载校验用） */
  create(url: string): Promise<AudioPlayer>
}

// ═══════════════ 提交 ═══════════════

export interface SubmitSelection {
  question_id: string
  picked: string[]
  answered_ms?: number
  outcome?: QuestionOutcome
  role?: QuestionRole
}

export interface SubmitPayload {
  name: string
  id_card: string
  subject_id: string
  gender: string
  age: number
  selections: SubmitSelection[]
  duration_seconds: number
  effective_duration_seconds: number
  paused_count: number
  /** 幂等令牌：同一次测评的重试复用同一 token，后端不重复建记录 */
  client_token: string
  protocol_version?: string
  question_protocol_version?: string
  content_version?: string
  interruptions?: number
  interrupted_ms?: number
  /** 审计：题库耗尽/图片复用等兜底事件 */
  scheduling_notes?: string[]
  /** 知情同意版本（可追溯） */
  consent_version?: string
}

export type SubmissionState = 'idle' | 'submitting' | 'succeeded' | 'failed' | 'qa_rejected'
