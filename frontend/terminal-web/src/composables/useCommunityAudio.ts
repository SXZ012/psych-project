import type { TerminalQuestion } from '@/types/terminal'

export type CommunityPlayback = 'played' | 'failed' | 'cancelled'
const PLAY_CONFIRM_TIMEOUT_MS = 1500

/** Local audio; cancellation is distinct from failure to prevent stale TTS. */
export function useCommunityAudio() {
  let current: HTMLAudioElement | null = null
  let cancelPending: (() => void) | null = null
  const cache = new Map<string, HTMLAudioElement>()
  const preloaded = new Set<string>()
  const cancelPreloads = new Set<() => void>()

  function preload(questions: TerminalQuestion[]): Promise<void[]> {
    return Promise.all(questions.map(question => new Promise<void>(resolve => {
      const url = question.audioUrl
      if (!url || cache.has(url)) return resolve()
      const audio = new Audio(url)
      audio.preload = 'auto'
      cache.set(url, audio)
      let settled = false
      const loaded = () => done(true)
      const failed = () => done(false)
      cancelPreloads.add(failed)
      const timer = window.setTimeout(() => done(audio.readyState >= 2), 12000)
      function done(ok: boolean) {
        if (settled) return
        settled = true
        cancelPreloads.delete(failed)
        window.clearTimeout(timer)
        audio.removeEventListener('loadeddata', loaded)
        audio.removeEventListener('canplaythrough', loaded)
        audio.removeEventListener('error', failed)
        if (ok) preloaded.add(url!)
        resolve()
      }
      audio.addEventListener('canplaythrough', loaded)
      audio.addEventListener('loadeddata', loaded)
      audio.addEventListener('error', failed)
      try { audio.load() } catch { done(false) }
    })))
  }

  function isReady(url?: string): boolean { return Boolean(url) && preloaded.has(url!) }

  function stop() {
    cancelPending?.()
    cancelPending = null
    if (current) {
      current.pause()
      try { current.currentTime = 0 } catch { /* metadata may not be ready */ }
      current = null
    }
  }

  function clear() {
    stop()
    for (const cancel of [...cancelPreloads]) cancel()
    for (const audio of cache.values()) {
      audio.pause()
      audio.removeAttribute('src')
      try { audio.load() } catch { /* already detached */ }
    }
    cache.clear()
    preloaded.clear()
  }

  function playQuestion(question: TerminalQuestion | undefined): Promise<CommunityPlayback> {
    stop()
    const url = question?.audioUrl
    if (!url) return Promise.resolve('failed')
    const audio = cache.get(url) || new Audio(url)
    cache.set(url, audio)
    current = audio
    return new Promise(resolve => {
      let settled = false
      const failed = () => finish('failed')
      const started = () => finish('played')
      const cancel = () => finish('cancelled')
      const timer = window.setTimeout(failed, PLAY_CONFIRM_TIMEOUT_MS)
      function finish(result: CommunityPlayback) {
        if (settled) return
        settled = true
        window.clearTimeout(timer)
        audio.removeEventListener('error', failed)
        audio.removeEventListener('timeupdate', started)
        if (cancelPending === cancel) cancelPending = null
        if (result !== 'played') {
          audio.pause()
          if (current === audio) current = null
        }
        resolve(result)
      }
      cancelPending = cancel
      audio.addEventListener('error', failed)
      try {
        audio.currentTime = 0
        const playing = audio.play()
        if (playing === undefined) audio.addEventListener('timeupdate', started)
        else playing.then(started).catch(failed)
      } catch { failed() }
    })
  }

  /** 提示音必须等到真正播放结束，题目才能接续，不能以 play() 成功代替播放完毕。 */
  function playPrompt(url: string): Promise<'ended' | 'failed' | 'cancelled'> {
    stop()
    const audio = cache.get(url) || new Audio(url)
    cache.set(url, audio)
    current = audio
    return new Promise(resolve => {
      let settled = false
      const ended = () => finish('ended')
      const failed = () => finish('failed')
      const cancel = () => finish('cancelled')
      const timeout = window.setTimeout(failed, 15_000)
      function finish(result: 'ended' | 'failed' | 'cancelled') {
        if (settled) return
        settled = true
        window.clearTimeout(timeout)
        audio.removeEventListener('ended', ended)
        audio.removeEventListener('error', failed)
        if (cancelPending === cancel) cancelPending = null
        audio.pause()
        if (current === audio) current = null
        resolve(result)
      }
      cancelPending = cancel
      audio.addEventListener('ended', ended)
      audio.addEventListener('error', failed)
      try { audio.currentTime = 0; audio.play()?.catch(failed) } catch { failed() }
    })
  }

  return { preload, isReady, playQuestion, playPrompt, stop, clear }
}
