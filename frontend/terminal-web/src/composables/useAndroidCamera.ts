import { nextTick, ref } from 'vue'
import type { NativeResult } from '@/types/terminal'

declare global {
  interface Window {
    AndroidCamera?: Record<string, (...args: unknown[]) => void>
    __onNativeFaceState?: (result: NativeFaceResult) => void
  }
}

export interface NativeFaceResult { count?: number; xCenter?: number; yCenter?: number; width?: number; height?: number; error?: string }

export function useAndroidCamera() {
  const available = ref(false)
  const cameraOn = ref(false)
  const message = ref('请正对屏幕，让头部完整位于框内')
  const faceResult = ref<NativeFaceResult | null>(null)
  window.__onNativeFaceState = result => { faceResult.value = result }

  try { available.value = Boolean(window.AndroidCamera && JSON.parse((window.AndroidCamera as Record<string, () => string>).isAvailable?.() || '{}').available) } catch { available.value = false }

  const call = (method: string, ...args: string[]): Promise<NativeResult> => new Promise(resolve => {
    if (!window.AndroidCamera?.[method]) return resolve({ ok: false, error: '原生采集接口不可用' })
    const callback = `__terminal_cb_${Math.random().toString(36).slice(2)}`
    ;(window as unknown as Record<string, (result: NativeResult) => void>)[callback] = result => {
      delete (window as unknown as Record<string, unknown>)[callback]
      resolve(result || { ok: false, error: '原生接口未返回结果' })
    }
    try { window.AndroidCamera[method](...args, callback) } catch (error) { resolve({ ok: false, error: String(error) }) }
  })

  // Android WebView 的 @JavascriptInterface 需要接收原始 Boolean / Number。
  // 旧版页面亦是此写法；把它们转为字符串会导致原生预览区域无法正确配置。
  const hide = () => { try { window.AndroidCamera?.setPreviewLayout?.(false, 0, 0, 0, 0) } catch { /* no-op */ } }
  const setGuideState = (state: 'ok'|'warning'|'error') => { try { window.AndroidCamera?.setFaceGuideState?.(state) } catch { /* no-op */ } }

  const place = async (anchor: HTMLElement | null) => {
    if (!available.value || !anchor) return hide()
    await nextTick()
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
    const rect = anchor.getBoundingClientRect()
    const width = Math.max(1, window.innerWidth), height = Math.max(1, window.innerHeight)
    try {
      window.AndroidCamera?.setPreviewLayout?.(true, rect.left / width * 100, rect.top / height * 100, rect.width / width * 100, rect.height / height * 100)
    } catch { /* no-op */ }
  }

  async function startPreview(anchor: HTMLElement | null) {
    if (!available.value) return false
    message.value = '正在开启摄像头…'
    await place(anchor)
    const result = await call('startPreview')
    cameraOn.value = Boolean(result.ok)
    message.value = result.ok ? '位置合适，请保持当前坐姿' : `摄像头开启失败：${result.error || '未知原因'}`
    return Boolean(result.ok)
  }
  async function startRecording() { return call('startRecording') }
  async function stopRecording() { return call('stopRecording') }
  /** 社区录制封存后关闭 Camera2，但保留原生 READY 状态以允许提交或重试。 */
  async function releasePreviewForUpload() { return call('releasePreviewForUpload') }
  async function submitAssessment(payload: object) { return call('submitAssessment', JSON.stringify(payload)) }
  function stopPreview() { hide(); cameraOn.value = false; try { window.AndroidCamera?.stopPreview?.('') } catch { /* no-op */ } }
  function stopPromptAudio() { try { window.AndroidCamera?.stopPromptAudio?.() } catch { /* no-op */ } }
  function playIntroAudio() { try { window.AndroidCamera?.playIntroAudio?.() } catch { /* no-op */ } }
  function playOutroAudio() { try { window.AndroidCamera?.playOutroAudio?.() } catch { /* no-op */ } }
  function speakPrompt(text: string) { try { window.AndroidCamera?.speakPrompt?.(text) } catch { /* no-op */ } }

  return { available, cameraOn, message, faceResult, call, place, hide, setGuideState, startPreview, startRecording, stopRecording, releasePreviewForUpload, submitAssessment, stopPreview, stopPromptAudio, playIntroAudio, playOutroAudio, speakPrompt }
}
