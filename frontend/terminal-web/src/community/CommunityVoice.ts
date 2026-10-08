import { AVIATION_CONFIG } from '../aviation/config.ts'
import { MESSAGES } from '../aviation/messages.ts'
import type { TerminalQuestion } from '../types/terminal.ts'
import type { useCommunityAudio } from '../composables/useCommunityAudio.ts'

export type CommunityCue = 'deviation' | 'near' | 'far' | 'start' | 'complete' | 'practice-complete' | 'practice-skipped' | 'invalid' | 'finishing'
const PRIORITY: Record<CommunityCue, number> = {
  invalid: 40, deviation: 30, near: 30, far: 30,
  start: 20, complete: 20, 'practice-complete': 20, 'practice-skipped': 20, finishing: 20,
}
const TEXT: Record<CommunityCue, string> = {
  deviation: '请将面部回到画面中央', near: '请稍微向后坐', far: '请向屏幕靠近一点',
  start: '正式测评开始，请保持头部稳定，看向屏幕',
  complete: '采集完成，正在保存本次测评数据',
  'practice-complete': '三道预训练已完成。正式测评时，请保持头部稳定，持续看向屏幕',
  'practice-skipped': '已跳过预训练。正式测评时，请保持头部稳定，持续看向屏幕',
  invalid: '本轮采集已中断，请重新就位后再开始，无需重复支付',
  finishing: '采集即将完成，请完成当前选择',
}
const CUE_URLS: Record<string, string> = Object.fromEntries(Object.entries(MESSAGES.audioCueFiles).map(([cue, file]) => [cue, AVIATION_CONFIG.audioRoot + file]))
export const COMMUNITY_CUE_URLS = [...new Set(Object.values(CUE_URLS))]
type Question = { key: string; question: TerminalQuestion; isCurrent: () => boolean }
interface VoiceOptions {
  audio: ReturnType<typeof useCommunityAudio>
  speak: (text: string) => void
  stopSpeech: () => void
}

/** 社区与航空使用相同提示音；高优先级提醒不会被题目、收尾或点击打断。 */
export class CommunityVoice {
  private generation = 0
  private prompt: CommunityCue | null = null
  private question: Question | null = null
  private fallbackTimer: number | null = null
  private positionReminded = false
  private readonly options: VoiceOptions
  constructor(options: VoiceOptions) { this.options = options }

  playQuestion(key: string, question: TerminalQuestion, isCurrent: () => boolean): void {
    if (!isCurrent()) return
    this.question = { key, question, isCurrent }
    if (this.prompt) return // 提醒结束后只接续仍有效的当前题。
    this.startQuestion(this.question)
  }

  private startQuestion(target: Question): void {
    if (!target.isCurrent()) return
    const token = ++this.generation
    this.options.stopSpeech()
    void this.options.audio.playQuestion(target.question).then(result => {
      if (result === 'failed' && token === this.generation && !this.prompt && target.isCurrent()) this.options.speak(target.question.question)
    })
  }

  stopQuestion(): void {
    this.question = null
    // 作答可取消当前题，不能取消正在播放的安全提醒或阶段提示。
    if (!this.prompt) { ++this.generation; this.options.audio.stop(); this.options.stopSpeech() }
  }

  playCue(cue: CommunityCue): boolean {
    if (this.prompt && PRIORITY[this.prompt] > PRIORITY[cue]) return false
    if (this.prompt === cue) return false
    const reminder = this.isReminder(cue)
    if (reminder && this.positionReminded) return false
    if (reminder) this.positionReminded = true
    if (!reminder && cue !== 'start') this.question = null
    this.cancelPlayback()
    this.prompt = cue
    const token = this.generation
    const url = CUE_URLS[cue]
    if (!url) { this.speakFallback(cue, token); return true }
    void this.options.audio.playPrompt(url).then(result => {
      if (token !== this.generation) return
      if (result === 'failed') this.speakFallback(cue, token)
      else if (result === 'ended') this.finishPrompt(token)
    })
    return true
  }

  resetPositionReminder(): void {
    this.positionReminded = false
    if (this.prompt && this.isReminder(this.prompt)) {
      this.cancelPlayback()
      this.resumeQuestion()
    }
  }

  stopAll(): void { this.question = null; this.cancelPlayback() }

  private isReminder(cue: CommunityCue): boolean { return cue === 'deviation' || cue === 'near' || cue === 'far' }
  private cancelPlayback(): void {
    ++this.generation
    this.prompt = null
    if (this.fallbackTimer !== null) window.clearTimeout(this.fallbackTimer)
    this.fallbackTimer = null
    this.options.audio.stop()
    this.options.stopSpeech()
  }
  private speakFallback(cue: CommunityCue, token: number): void {
    this.options.speak(TEXT[cue])
    // 旧 APK 的 TTS 不提供结束事件；仅音频失败时采用保守等待，仍受切页/回正取消控制。
    this.fallbackTimer = window.setTimeout(() => this.finishPrompt(token), Math.min(12_000, TEXT[cue].length * 240 + 600))
  }
  private finishPrompt(token: number): void {
    if (token !== this.generation) return
    this.prompt = null
    this.fallbackTimer = null
    this.resumeQuestion()
  }
  private resumeQuestion(): void {
    const target = this.question
    if (target?.isCurrent()) this.startQuestion(target)
    else this.question = null
  }
}
