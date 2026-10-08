/**
 * 浏览器 HTMLAudioElement 播放器（AudioCoordinator 的真实工厂）。
 *
 * - 预加载：canplaythrough 或 20s 超时；失败/超时抛错 → 素材层给出
 *   “明确错误 + 重新加载入口”。
 * - play() 的 Promise 三态落地：ended / failed / cancelled，
 *   stop() 后 Promise 立即以 cancelled 收敛，绝不悬挂。
 * - 不使用 playbackRate 加速（协议要求）；顺序播放同一元素前重置进度。
 */
import type { AudioPlaybackResult, AudioPlayer, AudioPlayerFactory } from './types.ts'

const PRELOAD_TIMEOUT_MS = 20_000

class HtmlAudioPlayer implements AudioPlayer {
  private element: HTMLAudioElement
  private settle: ((result: AudioPlaybackResult) => void) | null = null
  private playing = false

  constructor(url: string) {
    this.element = new Audio()
    this.element.preload = 'auto'
    this.element.src = url
  }

  get durationMs(): number {
    return Number.isFinite(this.element.duration) ? this.element.duration * 1000 : 0
  }

  /** 预取：等到可播（loadeddata/canplay/canplaythrough 任一，或 readyState≥3）。失败/超时抛错。 */
  load(): Promise<void> {
    return new Promise((resolve, reject) => {
      const ready = () => this.element.readyState >= 3
      const done = (error?: Error) => {
        window.clearTimeout(timeout)
        this.element.oncanplaythrough = null
        this.element.oncanplay = null
        this.element.onloadeddata = null
        this.element.onerror = null
        if (error) reject(error)
        else resolve()
      }
      const timeout = window.setTimeout(() => {
        // 超时兜底：数据其实已在时也算成功（个别 WebView 不派发 canplay 系事件）
        if (ready() || this.element.buffered.length > 0) done()
        else done(new Error('timeout'))
      }, PRELOAD_TIMEOUT_MS)
      this.element.oncanplaythrough = () => done()
      this.element.oncanplay = () => done()
      this.element.onloadeddata = () => done()
      this.element.onerror = () => done(new Error('load error'))
      this.element.load()
      if (ready()) done()   // 缓存命中时事件可能已错过
    })
  }

  play(): Promise<AudioPlaybackResult> {
    if (this.playing) return Promise.resolve('cancelled')
    this.playing = true
    this.element.currentTime = 0
    return new Promise<AudioPlaybackResult>(resolve => {
      this.settle = result => {
        this.settle = null
        this.playing = false
        this.element.onended = null
        this.element.onerror = null
        resolve(result)
      }
      this.element.onended = () => this.settle?.('ended')
      this.element.onerror = () => this.settle?.('failed')
      this.element.play().catch(() => this.settle?.('failed'))
    })
  }

  stop(): void {
    try {
      this.element.pause()
      this.element.currentTime = 0
    } catch { /* 停止失败按取消收尾 */ }
    this.settle?.('cancelled')
  }
}

export function createHtmlAudioFactory(): AudioPlayerFactory {
  const loaded = new Map<string, Promise<AudioPlayer>>()
  return {
    async create(url: string): Promise<AudioPlayer> {
      // 同一 URL 复用同一元素与预取结果；顺序播放由 AudioCoordinator 保证一次一段
      const existing = loaded.get(url)
      if (existing) return existing
      const created = (async () => {
        const player = new HtmlAudioPlayer(url)
        await player.load()
        return player
      })()
      loaded.set(url, created)
      return created
    },
  }
}
