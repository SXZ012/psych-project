/**
 * QuestionScheduler：航空自定节奏题目调度器。
 *
 * 规则（见 messages/config 与产品说明）：
 * - 点击选项立即锁定该题（feedback），约 200ms 后由采集时钟驱动切下一题；
 *   未点击时无限保持当前题——绝无“每题 N 秒自动切换”。
 * - 事件携带题目实例标识（instanceId），双击、触摸穿透、旧题事件
 *   一律因实例不匹配被拒绝，不可能误选下一题。
 * - 收尾调度：剩余 >10s 新题用常规题；4–10s 优先收尾题；≤4s 完成当前题后
 *   进入收尾页，不再出新题。
 * - 正式题不重复；题库耗尽时进入收尾页并记录可追踪的兜底说明
 *   （禁止重复题目、伪造题目或静默卡住）。
 * - finalize() 在采集封存/失效后冻结：挂起的切题不再生效，
 *   当前未答的题补记为 unanswered；已提交的选择保留。
 *
 * 计时一律由外部传入的单调时钟 elapsedMs 驱动（不自建定时器），
 * 采集终止即停驱，天然取消一切挂起回调。
 */
import type {
  QuestionInstance, QuestionOutcome, QuestionRecord, QuestionRole,
  SchedulerCard, SessionQuestion,
} from './types.ts'

export interface SchedulerOptions {
  /** 正式总时长（ms），用于剩余时间判定；练习模式忽略 */
  requiredMs: number
  /** 剩余 ≤ 此值新题优先收尾题 */
  tailFromMs: number
  /** 剩余 ≤ 此值不再出新题（完成当前题后收尾页） */
  closingFromMs: number
  /** 选择锁定反馈时长 */
  selectFeedbackMs: number
  /** 跳过反馈时长 */
  skipFeedbackMs: number
  /** 从题池尾部划出作收尾题的数量 */
  tailPoolSize: number
  /** practice 模式：按池顺序出题，耗尽即 finished，不做时间判定 */
  mode?: 'formal' | 'practice'
}

interface PoolEntry {
  question: SessionQuestion
  role: QuestionRole
  used: boolean
}

export class QuestionScheduler {
  private readonly pool: PoolEntry[]
  private readonly o: SchedulerOptions
  private records: QuestionRecord[] = []
  /** 兜底/审计说明（题库耗尽时刻等），随提交上传 */
  readonly notes: string[] = []
  private nextInstanceId = 1
  private currentInstance: QuestionInstance | null = null
  private feedback: { outcome: QuestionOutcome; optionId: string | null; untilMs: number } | null = null
  private frozen = false
  private _finished = false
  /** 正式模式：不再出新题，展示收尾页直到采集结束 */
  private closingCard = false

  constructor(questions: SessionQuestion[], options: SchedulerOptions) {
    this.o = options
    // 收尾题从池尾划出（池已在会话构建时打乱），保证常规题优先消耗
    const tailStart = options.mode === 'practice'
      ? questions.length
      : Math.max(0, questions.length - options.tailPoolSize)
    this.pool = questions.map((question, i) => ({
      question,
      role: i >= tailStart ? 'tail' : 'regular',
      used: false,
    }))
  }

  get card(): SchedulerCard {
    if (this.currentInstance === null) return this.closingCard ? { kind: 'closing' } : { kind: 'none' }
    if (this.feedback !== null) {
      return {
        kind: 'feedback',
        instance: this.currentInstance,
        outcome: this.feedback.outcome,
        optionId: this.feedback.optionId,
      }
    }
    return { kind: 'question', instance: this.currentInstance }
  }

  get results(): readonly QuestionRecord[] { return this.records }
  /** 练习模式：题池按序耗尽（第三题反馈结束即 true） */
  get finished(): boolean { return this._finished }
  get isFrozen(): boolean { return this.frozen }

  /** 开始出题（在采集零点或练习开始时调用一次） */
  start(elapsedMs: number): void {
    if (this.frozen || this.currentInstance !== null) return
    this.advance(elapsedMs)
  }

  /** 时钟驱动：仅在反馈期结束时切题；无反馈时无事可做（保持当前题） */
  update(elapsedMs: number): void {
    if (this.frozen || this.currentInstance === null || this.feedback === null) return
    if (elapsedMs >= this.feedback.untilMs) {
      this.feedback = null
      this.advance(elapsedMs)
    }
  }

  /**
   * 选择选项。仅当 card 为 question 且 instanceId 与当前实例一致时生效；
   * 双击（已进 feedback）、旧题事件（实例不匹配）、冻结后一律拒绝。
   */
  select(instanceId: number, optionId: string, elapsedMs: number): boolean {
    if (this.frozen || this.feedback !== null) return false
    const instance = this.currentInstance
    if (instance === null || instance.instanceId !== instanceId) return false
    this.record(instance, 'selected', optionId, elapsedMs)
    this.feedback = { outcome: 'selected', optionId, untilMs: elapsedMs + this.o.selectFeedbackMs }
    return true
  }

  /** 主动跳过：与选择同样的锁定/实例校验，记录 skipped 后短暂反馈切题 */
  skip(instanceId: number, elapsedMs: number): boolean {
    if (this.frozen || this.feedback !== null) return false
    const instance = this.currentInstance
    if (instance === null || instance.instanceId !== instanceId) return false
    this.record(instance, 'skipped', null, elapsedMs)
    this.feedback = { outcome: 'skipped', optionId: null, untilMs: elapsedMs + this.o.skipFeedbackMs }
    return true
  }

  /**
   * 冻结（采集封存/失效/退出后）。当前题若仍在等待作答 → 补记 unanswered；
   * 挂起的切题不再生效；此后 select/skip/update 均为 no-op。
   */
  finalize(elapsedMs: number): void {
    if (this.frozen) return
    this.frozen = true
    const instance = this.currentInstance
    if (instance !== null && this.feedback === null) {
      this.record(instance, 'unanswered', null, elapsedMs)
    }
    this.feedback = null
  }

  /** 已展示题目数（含当前；审计用） */
  get presentedCount(): number { return this.nextInstanceId - 1 }

  // —— 内部 ——

  private record(instance: QuestionInstance, outcome: QuestionOutcome, optionId: string | null, atMs: number): void {
    this.records.push({
      instanceId: instance.instanceId,
      questionId: instance.question.id,
      role: instance.role,
      outcome,
      optionId,
      atMs: Math.round(atMs),
    })
  }

  /** 反馈结束后（或初次开始时）挑下一张卡：新题或收尾页 */
  private advance(elapsedMs: number): void {
    const next = this.pickNext(elapsedMs)
    if (next === null) {
      this.currentInstance = null
      this._finished = true
      if (this.o.mode !== 'practice') this.closingCard = true   // 正式模式：收尾页直到采集结束
      return
    }
    next.used = true
    this.currentInstance = {
      instanceId: this.nextInstanceId++,
      question: next.question,
      role: next.role,
    }
  }

  /** 按剩余时间挑下一道未用题；null = 收尾页（不再出新题） */
  private pickNext(elapsedMs: number): PoolEntry | null {
    if (this.o.mode === 'practice') {
      const next = this.pool.find(entry => !entry.used)
      return next ?? null
    }
    const remaining = this.o.requiredMs - elapsedMs
    let preferred: QuestionRole | null = null
    if (remaining > this.o.tailFromMs) preferred = 'regular'
    else if (remaining > this.o.closingFromMs) preferred = 'tail'
    else return null   // 剩余 ≤4s：不再出新题，进入收尾页

    const pick = this.pool.find(entry => !entry.used && entry.role === preferred)
      ?? this.pool.find(entry => !entry.used)   // 首选角色耗尽退另一角色（仍是未用题，不重复）
    if (pick === undefined) {
      // 题库耗尽：收尾页 + 可追踪兜底说明（只记一次）
      if (!this.notes.some(note => note.startsWith('pool_exhausted'))) {
        this.notes.push(`pool_exhausted_at_ms=${Math.round(elapsedMs)}`)
      }
      return null
    }
    return pick
  }
}
