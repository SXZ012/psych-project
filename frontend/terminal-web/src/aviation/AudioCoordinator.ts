/**
 * AudioCoordinator：航空流程语音唯一入口。
 *
 * 规则：
 * - 一次只播一段；新请求按优先级裁决：失效说明 > 位置提醒 > 开始/完成提示 > 题目语音。
 *   低优先级不抢占高优先级；高优先级打断低优先级（被中断的按“取消”收尾，回调不悬挂）。
 * - 用户作答/跳过时编排层立即 stopQuestionAudio()——旧题语音绝不跨题。
 * - 位置提醒结束后只恢复“仍然有效”的当前题语音：恢复目标带题目实例标识，
 *   由 isQuestionCurrent 校验，旧题/已切换的题不会被恢复。
 * - 同一次持续位置异常只提醒一次（resetPositionReminder 在质量恢复时调用），
 *   恢复后再次异常才重新提醒。
 * - 采集失效说明为 critical：stopAll() 不打断它（必须能完整播放），
 *   只有整场 dispose() 才会终止。
 * - 播放失败 / 自然结束 / 主动取消 三种结果分别回调，Promise 均正常落地。
 * - 不使用 playbackRate 加速；题目音频与题干/选项的对应关系由
 *   会话构建（pool → SessionQuestion.audioUrl）保证。
 */
import type { AudioCue, AudioPlayer, AudioPlayerFactory, QuestionInstance } from './types.ts'
import { AVIATION_CONFIG } from './config.ts'
import { MESSAGES } from './messages.ts'

const PRIORITY: Record<string, number> = {
  invalid: 40,
  deviation: 30, near: 30, far: 30,
  start: 20, 'complete': 20, 'practice-complete': 20, 'practice-skipped': 20, finishing: 20,
  question: 10,
}

export interface AudioCoordinatorOptions {
  factory: AudioPlayerFactory
  /** 校验某题目实例是否仍是当前应播的题（恢复旧题的防线） */
  isQuestionCurrent: (instanceId: number) => boolean
  /** 播放失败（区别于取消/结束）：UI 可提示，不阻塞流程 */
  onPlaybackError?: (cue: AudioCue | 'question') => void
}

interface ActivePlayback {
  player: AudioPlayer
  cue: AudioCue
  priority: number
  critical: boolean
  token: number
  /** 正在播放的是题目语音时的实例（位置提醒打断后的恢复目标） */
  questionInstance?: QuestionInstance
  after?: () => void
}

export class AudioCoordinator {
  private readonly cache = new Map<string, AudioPlayer>()
  private active: ActivePlayback | null = null
  private generation = 0
  /** 被位置提醒打断的当前题（恢复目标） */
  private suspendedQuestion: QuestionInstance | null = null
  /** 同一次持续位置异常已提醒（质量恢复时重置） */
  private positionReminded = false
  private disposed = false

  private readonly o: AudioCoordinatorOptions
  constructor(options: AudioCoordinatorOptions) { this.o = options }

  /**
   * 预取全部所需音频并保持可用。任一失败即抛错（含具体 cue/url），
   * 由素材准备层转成“明确错误 + 重新加载入口”，绝不带着缺失音频进入正式采集。
   */
  async preload(urls: readonly string[]): Promise<void> {
    await Promise.all(urls.map(async url => {
      if (this.cache.has(url)) return
      try {
        this.cache.set(url, await this.o.factory.create(url))
      } catch (error) {
        throw new Error(`audio_preload_failed: ${url} ${error instanceof Error ? error.message : ''}`)
      }
    }))
  }

  /** 播放题目语音（最低优先级）。实例已失效（切题/结束）时忽略。 */
  playQuestion(instance: QuestionInstance): void {
    if (this.disposed) return
    if (!this.o.isQuestionCurrent(instance.instanceId)) return
    this.suspendedQuestion = null
    if (this.active && this.active.priority >= PRIORITY.question) {
      // 有更高优先级语音进行中：记住恢复目标，不抢占
      this.suspendedQuestion = instance
      return
    }
    this.startPlayback('question', instance.question.audioUrl, undefined, { questionInstance: instance })
  }

  /** 停止当前题目语音（用户已作答/跳过/切题）。不打断提醒与提示。 */
  stopQuestionAudio(): void {
    this.suspendedQuestion = null
    if (this.active && this.active.cue === 'question') this.cancelActive()
  }

  /** 播放提示类 cue（start/complete/practice-complete）。 */
  playCue(cue: 'start' | 'complete' | 'practice-complete' | 'practice-skipped' | 'finishing', after?: () => void): boolean {
    if (this.disposed) return false
    if (cue !== 'start') this.suspendedQuestion = null
    return this.startPlayback(cue, cueUrl(cue), after)
  }

  /**
   * 播报采集失效说明（critical）：抢占一切、完整播放、结束后回调。
   * stopAll() 不会打断它；只有 dispose()（整场重置）会。
   */
  playInvalidExplanation(after?: () => void): void {
    if (this.disposed) return
    this.suspendedQuestion = null
    this.startPlayback('invalid', cueUrl('invalid'), after, { critical: true })
  }

  /**
   * 位置提醒（deviation/near/far）。同一次持续异常内只播一次；
   * 进行中的提醒不被新的提醒打断（一次只播一段）。
   */
  playPositionReminder(kind: 'deviation' | 'near' | 'far'): void {
    if (this.disposed) return
    if (this.positionReminded) return
    if (this.active && (this.active.cue === 'deviation' || this.active.cue === 'near' || this.active.cue === 'far' || this.active.cue === 'invalid')) return
    this.positionReminded = true
    this.startPlayback(kind, cueUrl(kind), () => this.maybeResumeQuestion())
  }

  /** 质量恢复：解除“同一次异常已提醒”标记；再次异常可重新提醒 */
  resetPositionReminder(): void { this.positionReminded = false }

  /**
   * 阶段切换的统一清理：停止除 critical（失效说明）外的一切语音。
   * 失效说明由编排层在其 onEnded 后自行收尾。
   */
  stopAll(): void {
    this.suspendedQuestion = null
    if (this.active && !this.active.critical) this.cancelActive()
  }

  /** 整场终止（退出/重置/卸载）：全部停止，含 critical */
  dispose(): void {
    this.disposed = true
    this.suspendedQuestion = null
    this.cancelActive()
    this.cache.clear()
  }

  // —— 内部 ——

  private startPlayback(
    cue: AudioCue,
    url: string,
    after?: () => void,
    opts: { critical?: boolean; questionInstance?: QuestionInstance } = {},
  ): boolean {
    const player = this.cache.get(url)
    if (!player) {
      // 预加载遗漏（或 URL 配置错误）：按播放失败处理，不悬挂
      this.o.onPlaybackError?.(cue)
      return false
    }
    const priority = PRIORITY[cue] ?? 0
    if (this.active && this.active.priority > priority) return false // 低不让高
    const isReminder = cue === 'deviation' || cue === 'near' || cue === 'far'
    if (this.active) {
      // 位置提醒打断题目语音 → 记录恢复目标（提醒结束后只恢复仍有效的当前题）
      if (isReminder && this.active.cue === 'question' && this.active.questionInstance) {
        this.suspendedQuestion = this.active.questionInstance
      }
      this.cancelActive()
    }
    const token = ++this.generation
    this.active = {
      player, cue, priority, critical: Boolean(opts.critical), token, after,
      questionInstance: opts.questionInstance,
    }
    void player.play().then(result => {
      if (!this.active || this.active.token !== token) return         // 已被后续播放接管
      this.active = null
      if (result === 'ended') {
        after?.()
        if (isReminder || cue === 'start') this.maybeResumeQuestion()
      } else if (result === 'failed') {
        this.o.onPlaybackError?.(cue)
      }
      // 'cancelled'：主动停止，无回调——避免取消后回调串入新阶段
    })
    return true
  }

  private cancelActive(): void {
    const active = this.active
    this.active = null
    if (!active) return
    // 若被取消的是当前题语音且即将被位置提醒取代，交由调用方设置恢复目标
    try { active.player.stop() } catch { /* 取消失败不阻塞状态推进 */ }
  }

  private maybeResumeQuestion(): void {
    const suspended = this.suspendedQuestion
    this.suspendedQuestion = null
    if (!suspended || this.disposed) return
    if (!this.o.isQuestionCurrent(suspended.instanceId)) return       // 只恢复仍有效的当前题
    this.playQuestion(suspended)
  }
}

/** cue → 预生成音频 URL（文件清单集中在 messages.audioCueFiles） */
function cueUrl(cue: AudioCue): string {
  const file = MESSAGES.audioCueFiles[cue]
  if (!file) throw new Error(`unknown audio cue: ${cue}`)
  return AVIATION_CONFIG.audioRoot + file
}
