import type { TerminalQuestion } from '@/types/terminal'

/**
 * 题目语音统一播放器。
 * 音频由内容发布流程提前合成，测评现场只播放缓存资源，不调用云端 TTS。
 */
export function usePromptAudio() {
  let current: HTMLAudioElement | null = null
  const cache = new Map<string, HTMLAudioElement>()

  function preload(questions: TerminalQuestion[]) {
    for (const question of questions) {
      if (!question.audioUrl || cache.has(question.audioUrl)) continue
      const audio = new Audio(question.audioUrl)
      audio.preload = 'auto'
      cache.set(question.audioUrl, audio)
      audio.load()
    }
  }

  function stop() {
    if (!current) return
    current.pause()
    current.currentTime = 0
    current = null
  }

  /**
   * Chrome may block audio started by a later timer. Prime one cached media
   * element while the user is still inside the "开始测评" click gesture.
   */
  function unlock() {
    const audio = cache.values().next().value as HTMLAudioElement | undefined
    if (!audio) return
    const previousMuted = audio.muted
    audio.muted = true
    const started = audio.play()
    if (started) {
      void started.finally(() => {
        audio.pause()
        audio.currentTime = 0
        audio.muted = previousMuted
      })
    }
  }

  async function playQuestion(question: TerminalQuestion | undefined) {
    stop()
    if (!question?.audioUrl) return
    const audio = cache.get(question.audioUrl) || new Audio(question.audioUrl)
    cache.set(question.audioUrl, audio)
    current = audio
    audio.currentTime = 0
    try { await audio.play() } catch { /* 语音失败不阻断测评，页面文字始终保留 */ }
  }

  return { preload, unlock, playQuestion, stop }
}
