import type { TerminalQuestion } from '@/types/terminal'

/**
 * 社区正式题语音：预生成的本地音频（assets/community/audio）。
 * 与航空 AudioCoordinator 相互独立——只服务社区题库的 audio_url。
 *
 * 预加载是硬门禁：未就绪的音频会让流程停在 assets_failed。
 * 播放返回可确认的异步结果：只有 audio.play() 真正成功才视为
 * "本地音频已接管"；rejected / error / 超时 / 无 URL → 返回 false，
 * 调用方立即降级到社区原生 TTS（AndroidCamera.speakPrompt）。
 */
const PLAY_CONFIRM_TIMEOUT_MS = 1500

export function useCommunityAudio() {
  let current: HTMLAudioElement | null = null
  const cache = new Map<string, HTMLAudioElement>()
  const preloaded = new Set<string>()

  function preload(questions: TerminalQuestion[]): Promise<void[]> {
    const jobs = questions.map(
      question =>
        new Promise<void>(resolve => {
          const url = question.audioUrl
          if (!url || cache.has(url)) {
            if (url) preloaded.add(url)
            return resolve()
          }
          const audio = new Audio(url)
          audio.preload = 'auto'
          let settled = false
          let fallbackTimer: number | null = null
          const done = (ok: boolean) => {
            if (settled) return
            settled = true
            if (fallbackTimer) window.clearTimeout(fallbackTimer)
            if (ok) preloaded.add(url)
            resolve()
          }
          // canplaythrough/cached 足够视为可用；出错也要 resolve 让上层决定拦截
          audio.addEventListener('canplaythrough', () => done(true), { once: true })
          audio.addEventListener('loadeddata', () => done(true), { once: true })
          audio.addEventListener('error', () => done(false), { once: true })
          cache.set(url, audio)
          audio.load()
          // 兜底：本地静态文件 3s 内必达
          fallbackTimer = window.setTimeout(() => done(true), 3000)
        }),
    )
    return Promise.all(jobs)
  }

  /** 本题音频是否已成功缓存（预加载门禁用） */
  function isReady(url?: string): boolean {
    return Boolean(url) && preloaded.has(url as string)
  }

  function stop() {
    if (!current) return
    current.pause()
    current.currentTime = 0
    current = null
  }

  /**
   * 播放本题语音，返回 Promise<true|false>：
   * true  = audio.play() 已真正开始（本地音频接管）
   * false = 无 URL / play() rejected / error 事件 / 确认超时 → 调用方降级 TTS
   */
  function playQuestion(question: TerminalQuestion | undefined): Promise<boolean> {
    stop()
    const url = question?.audioUrl
    if (!url) return Promise.resolve(false)
    const audio = cache.get(url) || new Audio(url)
    cache.set(url, audio)
    current = audio
    audio.currentTime = 0
    return new Promise<boolean>(resolve => {
      let settled = false
      const finish = (ok: boolean) => {
        if (settled) return
        settled = true
        window.clearTimeout(confirmTimer)
        resolve(ok)
      }
      // 播放确认超时：play() Promise 挂起或事件缺失时不无限等待
      const confirmTimer = window.setTimeout(() => finish(false), PLAY_CONFIRM_TIMEOUT_MS)
      audio.addEventListener('error', () => finish(false), { once: true })
      try {
        const played = audio.play()
        if (played === undefined) {
          // 旧 WebView 无返回 Promise：以 timeupdate 作为已出声信号
          audio.addEventListener('timeupdate', () => finish(true), { once: true })
          return
        }
        played.then(() => finish(true)).catch(() => finish(false))
      } catch {
        finish(false)
      }
    })
  }

  return { preload, isReady, playQuestion, stop }
}
